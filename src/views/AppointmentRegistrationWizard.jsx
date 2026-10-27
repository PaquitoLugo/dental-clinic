import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { dialog } from '../components/DialogHost';
import AvailabilityDatePicker, { formatTime } from '../components/AvailabilityDatePicker';
import { fetchDentistAvailability } from '../lib/dentistAvailability';

// "8:00 AM" / "1:00 PM" -> minutes since midnight
const slotToMinutes = (label) => {
  const m = label.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === 'PM') h += 12;
  return h * 60 + Number(m[2]);
};
// "8:00 AM \u2013 9:00 AM" -> "08:00" (24h format used by the rest of the system)
const slotStart24 = (slot) => {
  const mins = slotToMinutes(slot.split('\u2013')[0]);
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
};
const timeToMinutes = (value) => {
  const [hours, minutes] = String(value || '').split(':').map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null;
};
const minutesToTime = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const NON_BLOCKING = ['Rejected', 'Cancelled'];

// Booking is only available to signed-in, verified patients (embedded inside the patient workspace).
// `patient` is the staff_users row of the logged-in patient; `createAppointment` / `existingAppointments` come from ClinicContext.
export default function AppointmentRegistrationWizard({
  selectedCategory,
  onCancel,
  onComplete,
  embedded = false,
  patient = null,
  createAppointment = null,
  existingAppointments = [],
  initialService = null, // set when the patient taps "Book this service": starts on step 2 with it selected
}) {
  const [currentStep, setCurrentStep] = useState(initialService ? 2 : 1);
  const [services, setServices] = useState([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceCategory, setServiceCategory] = useState('All');
  const [servicePage, setServicePage] = useState(1);
  const [formError, setFormError] = useState('');
  const servicesPerPage = 12;

  const [formData, setFormData] = useState({
    selectedServices: initialService ? [initialService] : [],
    appointmentDate: '',
    appointmentTime: '',
    notes: '',
    firstName: '',
    middleName: '',
    lastName: '',
    suffix: '',
    birthDate: '',
    sex: '',
    mobileNumber: '',
    email: '',
    city: '',
    province: '',
    hospitalNumber: '',
    completeAddress: '',
    emergencyContact: '',
    isGuardianBooking: false,
    guardianName: '',
    guardianRelationship: '',
    guardianContact: '',
    consentUseInfo: false,
    confirmInfoCorrect: false
  });

  const [dentists, setDentists] = useState([]);
  const [selectedDentistId, setSelectedDentistId] = useState('');
  const [loadingDentists, setLoadingDentists] = useState(true);
  const [availabilityMap, setAvailabilityMap] = useState({});
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const selectedDentist = dentists.find((dentist) => String(dentist.id) === selectedDentistId);
  const dentistName = selectedDentist?.full_name || '';

  useEffect(() => {
    let active = true;
    const loadDentists = async () => {
      setLoadingDentists(true);
      const { data, error } = await supabase.from('staff_users')
        .select('id, full_name')
        .eq('role', 'dentist')
        .is('archived_at', null)
        .order('full_name');
      if (!active) return;
      if (error) {
        setFormError(`Could not load dentists: ${error.message}`);
      } else {
        setDentists(data || []);
        const assignedDentist = (data || []).find((dentist) => dentist.full_name === patient?.assigned_dentist);
        if (assignedDentist) setSelectedDentistId(String(assignedDentist.id));
      }
      setLoadingDentists(false);
    };
    loadDentists();
    return () => { active = false; };
  }, [patient?.assigned_dentist]);

  useEffect(() => {
    let active = true;
    if (!dentistName) {
      return () => { active = false; };
    }

    fetchDentistAvailability(dentistName)
      .then((availability) => {
        if (active) setAvailabilityMap(availability);
      })
      .catch((error) => {
        if (active) {
          setAvailabilityMap({});
          setFormError(`Could not load ${dentistName}'s availability: ${error.message}`);
        }
      })
      .finally(() => {
        if (active) setLoadingAvailability(false);
      });
    return () => { active = false; };
  }, [dentistName]);

  const [submitting, setSubmitting] = useState(false);

  const categories = ['All', ...new Set(services.map(service => service.category).filter(Boolean))];
  const filteredServices = services.filter(service =>
    (serviceCategory === 'All' || service.category === serviceCategory) &&
    service.service_name.toLowerCase().includes(serviceSearch.toLowerCase())
  );
  const servicePageCount = Math.max(1, Math.ceil(filteredServices.length / servicesPerPage));
  const pagedServices = filteredServices.slice((servicePage - 1) * servicesPerPage, servicePage * servicesPerPage);
  const selectedTotal = formData.selectedServices.reduce((total, service) => total + Number(service.price || 0), 0);

  const availableWindow = availabilityMap[formData.appointmentDate];
  const availabilityStart = timeToMinutes(availableWindow?.timeIn);
  const availabilityEnd = timeToMinutes(availableWindow?.timeOut);
  const slotCount = availableWindow?.active && availabilityStart !== null && availabilityEnd !== null
    ? Math.max(0, Math.floor((availabilityEnd - availabilityStart) / 60))
    : 0;
  const visibleTimeSlots = Array.from({ length: slotCount }, (_, index) => {
    const start = availabilityStart + index * 60;
    return `${formatTime(minutesToTime(start))} – ${formatTime(minutesToTime(start + 60))}`;
  });

  // Slots already taken on the chosen date (anyone's non-rejected appointment) or already past today
  const bookedTimes = new Set(
    (existingAppointments || [])
      .filter(a => a.appointment_date === formData.appointmentDate && !NON_BLOCKING.includes(a.status))
      .filter(a => !a.assigned_dentist || a.assigned_dentist === dentistName)
      .map(a => String(a.appointment_time || '').slice(0, 5))
  );
  const todayKeyLocal = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const isSlotUnavailable = (slot) =>
    bookedTimes.has(slotStart24(slot)) ||
    (formData.appointmentDate === todayKeyLocal && slotToMinutes(slot.split('\u2013')[0]) <= nowMinutes);

  // Fetch services filtered strictly by selected category
  useEffect(() => {
    async function fetchServices() {
      setLoadingServices(true);
      let query = supabase.from('services').select('*').eq('is_active', true);

      if (selectedCategory) {
        query = query.eq('category', selectedCategory);
      }

      const { data, error } = await query;

      if (!error && data) {
        setServices(data);
      } else {
        console.error('Error fetching registration services:', error?.message);
      }
      setLoadingServices(false);
    }
    fetchServices();
  }, [selectedCategory]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setFormError('');
  };

  const handleSelectService = (service) => {
    setFormError('');
    setFormData(prev => ({ ...prev, selectedServices: [service] }));
  };

  const handleNext = () => {
    setFormError('');
    if (currentStep === 1 && formData.selectedServices.length !== 1) {
      setFormError('Please select one dental service to continue.');
      return;
    }
    if (currentStep === 2 && !selectedDentist) {
      setFormError('Please choose a dentist to see their availability.');
      return;
    }
    if (currentStep === 2 && !formData.appointmentDate) {
      setFormError('Please select a valid appointment date.');
      return;
    }
    if (currentStep === 2 && !availabilityMap[formData.appointmentDate]) {
      setFormError('The selected dentist has no availability on that date. Please choose another date.');
      return;
    }
    if (currentStep === 3 && !formData.appointmentTime) {
      setFormError('Please choose an available time slot.');
      return;
    }
    if (currentStep === 3 && !visibleTimeSlots.includes(formData.appointmentTime)) {
      setFormError('That time is outside the dentist’s availability. Please choose another slot.');
      return;
    }
    if (currentStep === 3 && isSlotUnavailable(formData.appointmentTime)) {
      setFormError('That time slot was just taken. Please choose another one.');
      return;
    }
    setCurrentStep(prev => Math.min(prev + 1, 4));
  };

  const handleBack = () => {
    setFormError('');
    if (currentStep === 1) {
      if (onCancel) onCancel();
    } else {
      setCurrentStep(prev => Math.max(prev - 1, 1));
    }
  };

  const handleConfirmAppointment = async () => {
    if (formData.selectedServices.length !== 1) {
      setFormError('Please select one dental service before submitting your appointment request.');
      return;
    }
    if (!formData.consentUseInfo || !formData.confirmInfoCorrect) {
      setFormError('Please check both consent and confirmation boxes to submit.');
      return;
    }
    if (formData.isGuardianBooking && (!formData.guardianName.trim() || !formData.guardianRelationship.trim() || !formData.guardianContact.trim())) {
      setFormError('Please complete all Guardian Information fields.');
      return;
    }
    if (!patient) {
      setFormError('Please sign in to your patient account to book an appointment.');
      return;
    }

    if (!selectedDentist) {
      setFormError('Please choose a dentist before submitting your appointment request.');
      return;
    }

    setSubmitting(true);
    setFormError('');

    try {
      const currentAvailability = await fetchDentistAvailability(dentistName);
      const selectedWindow = currentAvailability[formData.appointmentDate];
      const slotStart = timeToMinutes(slotStart24(formData.appointmentTime));
      const availabilityStart = timeToMinutes(selectedWindow?.timeIn);
      const availabilityEnd = timeToMinutes(selectedWindow?.timeOut);
      if (
        !selectedWindow?.active ||
        slotStart === null ||
        availabilityStart === null ||
        availabilityEnd === null ||
        slotStart < availabilityStart ||
        slotStart + 60 > availabilityEnd
      ) {
        setFormError('The selected time is no longer within the dentist’s availability. Please choose another available slot.');
        return;
      }

      // Older accounts may not have the number on the loaded profile, so look it up
      let mobile = patient.mobile_number || '';
      if (!mobile && patient.id) {
        const { data: acct } = await supabase.from('staff_users').select('mobile_number').eq('id', patient.id).maybeSingle();
        mobile = acct?.mobile_number || '';
      }

      const payload = {
        patient_id: patient.id ?? null,
        patient_name: patient.full_name || patient.name,
        contact_number: mobile,
        email: patient.email || null,
        service_name: formData.selectedServices[0].service_name,
        service_price: Number(formData.selectedServices[0].price || 0),
        assigned_dentist: dentistName,
        appointment_date: formData.appointmentDate,
        appointment_time: slotStart24(formData.appointmentTime),
        notes: formData.notes || null,
        is_guardian_booking: formData.isGuardianBooking,
        guardian_name: formData.isGuardianBooking ? formData.guardianName.trim() : null,
        guardian_relationship: formData.isGuardianBooking ? formData.guardianRelationship.trim() : null,
        guardian_contact: formData.isGuardianBooking ? formData.guardianContact.trim() : null,
        status: 'Pending'
      };

      if (createAppointment) {
        await createAppointment(payload);
      } else {
        const { error } = await supabase.from('appointments').insert([payload]);
        if (error) throw error;
      }

      setSubmitting(false);
      await dialog.alert('Your appointment request was sent. The clinic assistant will review it and confirm your schedule. You can follow its status under History.', { title: 'Request submitted', variant: 'success' });
      if (onComplete) onComplete();
    } catch (err) {
      console.error('Error submitting appointment:', err);
      setFormError('Failed to submit appointment: ' + (err.message || 'Check database connection.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`${embedded ? 'h-full overflow-y-auto rounded-2xl' : 'min-h-screen'} w-full bg-[#f4f7f6] font-sans text-[#13241b] flex flex-col pb-8`}>
      
      {/* Header with Clickable Logo (hidden when embedded in the patient workspace) */}
      {!embedded && (
      <header className="bg-white border-b border-[#e1ebd7] px-3 py-3 sm:px-6 sm:py-4 flex items-center justify-between gap-2 sticky top-0 z-40 shadow-2xs">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-3 text-left cursor-pointer hover:opacity-85 transition bg-transparent border-none p-0"
        >
          <div className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-full bg-[#164e43] flex items-center justify-center text-white font-black text-xl shadow-xs">
            &#129463;
          </div>
          <div>
            <h1 className="font-black text-xs sm:text-base tracking-tight text-[#13241b]">LumiDent</h1>
            <p className="text-[8px] sm:text-[10px] font-bold text-[#607368] uppercase tracking-wider">Patient Scheduler & Charting System</p>
          </div>
        </button>

        <button
          type="button"
          onClick={onCancel}
          className="bg-white border border-[#d4e2dc] text-[#164e43] px-2.5 sm:px-4 py-2 rounded-xl font-bold text-[9px] sm:text-xs whitespace-nowrap hover:bg-[#f5f7f6] transition cursor-pointer shadow-2xs"
        >
          &#8592; Cancel / Back to Home
        </button>
      </header>
      )}

        <main className={`flex-1 w-full mx-auto ${currentStep === 1 ? 'max-w-none px-3 sm:px-6 xl:px-10 py-4 flex flex-col gap-3' : 'max-w-4xl px-4 py-8 space-y-6'}`}>
        <div className={`bg-white border border-[#d4e2dc] rounded-2xl shadow-2xs space-y-2 ${currentStep === 1 ? 'px-4 py-3 sm:px-5' : 'p-6'}`}>
          <span className="text-[10px] font-black tracking-widest text-[#164e43] uppercase">ONLINE REGISTRATION</span>
          <h2 className="text-2xl sm:text-3xl font-black text-[#13241b] tracking-tight">{embedded ? 'Book a Dental Appointment' : 'Register a Dental Appointment'}</h2>
          <p className="text-xs text-[#607368]">
            Follow the steps below. You can select multiple services under this category.
          </p>
        </div>

        <div className={`bg-white border border-[#d4e2dc] rounded-2xl shadow-2xs ${currentStep === 1 ? 'p-3 sm:p-5' : 'p-5 sm:p-8 space-y-6'}`}>
          <div className="space-y-2">
            <span className="text-xs font-bold text-[#13241b]">Step {currentStep} of 4</span>
            <div className="w-full bg-[#e8f0eb] h-2.5 rounded-full overflow-hidden">
              <div 
                className="bg-[#164e43] h-full transition-all duration-300 rounded-full" 
                style={{ width: `${(currentStep / 4) * 100}%` }}
              />
            </div>
          </div>

          {formError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3.5 rounded-xl font-bold">
              &#9888;&#65039; {formError}
            </div>
          )}

          {/* STEP 1: Service selection */}
          {currentStep === 1 && (
            <div className="min-h-0 flex flex-col">
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] 2xl:grid-cols-[minmax(0,1fr)_340px] gap-4 sm:gap-6 flex-1 min-h-0">
                <section className="min-h-0 flex flex-col">
                  <div className="mb-3">
                    <h3 className="text-xl sm:text-2xl font-black">{selectedCategory ? `${selectedCategory} Services` : 'Select a service'}</h3>
                    <p className="text-sm text-[#607368] mt-0.5">Choose one service for this appointment.</p>
                  </div>
                  <div className="flex gap-2 mb-2 flex-wrap">
                    <input aria-label="Search services" value={serviceSearch} onChange={e => { setServiceSearch(e.target.value); setServicePage(1); }} placeholder="Search services" className="min-w-36 flex-1 border border-[#d4e2dc] bg-white rounded-lg px-4 py-2.5 text-sm outline-none focus:border-[#164e43]" />
                    {categories.map(category => <button key={category} type="button" onClick={() => { setServiceCategory(category); setServicePage(1); }} className={`px-4 py-2 rounded-full text-[13px] font-bold border ${serviceCategory === category ? 'bg-[#164e43] text-white border-[#164e43]' : 'bg-white text-[#40584f] border-[#d4e2dc]'}`}>{category}</button>)}
                  </div>
                  <div className="flex-1 min-h-0">
                    {loadingServices ? <div className="py-12 text-center text-xs font-bold text-[#607368]">Loading services...</div> : filteredServices.length === 0 ? <div className="py-8 text-center text-xs text-gray-500">No active services match your search.</div> : (
                      <div role="radiogroup" aria-label="Choose one dental service" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 min-[1700px]:grid-cols-5 gap-3 sm:gap-4 content-start">
                        {pagedServices.map(service => {
                          const isSelected = formData.selectedServices.some(s => s.id === service.id);
                          return <button type="button" role="radio" aria-checked={isSelected} key={service.id} onClick={() => handleSelectService(service)} className={`text-left border rounded-2xl px-5 py-4 h-[124px] flex flex-col justify-between cursor-pointer transition ${isSelected ? 'border-[#164e43] bg-[#eef5f2] ring-1 ring-[#164e43]' : 'bg-white border-[#d4e2dc] hover:border-[#a3c4b8]'}`}>
                            <div className="flex items-start justify-between gap-3"><h4 className="font-bold text-base leading-tight text-[#13241b]">{service.service_name}</h4><span className="shrink-0 text-sm font-black text-[#164e43]">&#8369;{Number(service.price).toLocaleString()}</span></div>
                            <div className="flex justify-between items-center"><span className="text-sm text-[#71827c]">{service.duration || service.duration_minutes ? `About ${service.duration || service.duration_minutes} min` : 'Dental service'}</span><span className={`w-5 h-5 rounded-full border flex items-center justify-center ${isSelected ? 'bg-[#164e43] border-[#164e43] text-white' : 'border-[#a9bbb3]'}`}>{isSelected && <span className="text-sm">&#10003;</span>}</span></div>
                          </button>;
                        })}
                      </div>
                    )}
                  </div>
                  <div className="mt-auto pt-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 border-t border-[#f0f5f2] text-[13px] text-[#607368]">
                    <span>{filteredServices.length ? `Showing ${(servicePage - 1) * servicesPerPage + 1}\u2013${Math.min(servicePage * servicesPerPage, filteredServices.length)} of ${filteredServices.length}` : 'No services'}</span>
                    <div className="flex items-center gap-2 self-end sm:self-auto"><button type="button" disabled={servicePage <= 1} onClick={() => setServicePage(p => p - 1)} className="px-3 py-1.5 border border-[#d4e2dc] rounded disabled:opacity-40">Previous</button><span>{servicePage} / {servicePageCount}</span><button type="button" disabled={servicePage >= servicePageCount} onClick={() => setServicePage(p => p + 1)} className="px-3 py-1.5 border border-[#d4e2dc] rounded disabled:opacity-40">Next</button></div>
                  </div>
                </section>
                <aside className="h-fit lg:mt-4 border border-[#d4e2dc] bg-white rounded-2xl p-5 text-sm">
                  <h4 className="font-black text-lg">Your appointment</h4><p className="text-[13px] text-[#607368] mt-1">{formData.selectedServices.length === 1 ? '1 service selected' : 'Choose one service'}</p>
                  <div className="mt-4 space-y-3 max-h-48 overflow-y-auto">{formData.selectedServices.map(service => <div key={service.id} className="flex justify-between gap-2"><span>{service.service_name}</span><b>&#8369;{Number(service.price).toLocaleString()}</b></div>)}{formData.selectedServices.length === 0 && <p className="text-[#71827c]">Choose a service to get started.</p>}</div>
                  <div className="mt-4 pt-4 border-t border-[#e7eeea] flex justify-between items-center"><span className="text-[#607368]">Estimated total</span><strong className="text-2xl text-[#164e43]">&#8369;{selectedTotal.toLocaleString()}</strong></div>
                  <button type="button" onClick={handleNext} disabled={formData.selectedServices.length === 0} className="w-full mt-4 bg-[#164e43] text-white py-3 rounded-lg font-bold text-sm disabled:opacity-50">Continue to date &amp; time &#8594;</button>
                  <button type="button" onClick={() => setFormData(prev => ({ ...prev, selectedServices: [] }))} className="w-full mt-3 text-[#607368] text-[13px]">Clear selection</button>
                </aside>
              </div>
              {onCancel && <div className="mt-3"><button type="button" onClick={onCancel} className="w-full sm:w-auto bg-white border border-[#d4e2dc] text-[#13241b] px-5 py-2.5 rounded-lg font-bold text-[13px] hover:bg-[#f5f7f6]">&#8592; Back</button></div>}
            </div>
          )}
          {/* STEP 2: Choose Appointment Date */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <h3 className="text-2xl font-black text-[#13241b]">Choose an appointment date</h3>
              <div className="bg-[#eaf4ef] border border-[#bcd7ca] rounded-2xl p-5 space-y-1 text-xs text-[#164e43]">
                <p className="font-bold">Selected service:</p>
                <ul className="list-disc list-inside font-bold pt-1">
                  {formData.selectedServices.map(s => <li key={s.id}>{s.service_name}</li>)}
                </ul>
              </div>
              <div className="space-y-2">
                <label htmlFor="appointment-dentist" className="block text-xs font-bold text-[#13241b]">Choose dentist *</label>
                <select
                  id="appointment-dentist"
                  value={selectedDentistId}
                  disabled={loadingDentists}
                  onChange={(event) => {
                    setSelectedDentistId(event.target.value);
                    setFormData((previous) => ({ ...previous, appointmentDate: '', appointmentTime: '' }));
                    setAvailabilityMap({});
                    setLoadingAvailability(Boolean(event.target.value));
                    setFormError('');
                  }}
                  className="w-full max-w-xl border border-[#d4e2dc] rounded-xl p-3 bg-white text-sm font-semibold"
                >
                  <option value="">{loadingDentists ? 'Loading dentists…' : 'Select a dentist'}</option>
                  {dentists.map((dentist) => (
                    <option key={dentist.id} value={String(dentist.id)}>{dentist.full_name}</option>
                  ))}
                </select>
                {!loadingDentists && dentists.length === 0 && (
                  <p className="text-xs text-amber-700">No active dentists are currently available for booking.</p>
                )}
                {loadingAvailability && <p className="text-xs text-[#607368]">Loading this dentist’s schedule…</p>}
                {!loadingAvailability && selectedDentist && Object.keys(availabilityMap).length === 0 && (
                  <p className="text-xs text-[#607368]">This dentist has no upcoming availability listed yet.</p>
                )}
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-bold text-[#13241b]">Appointment date *</label>
              </div>
              <AvailabilityDatePicker
                availabilityMap={availabilityMap}
                value={formData.appointmentDate}
                onChange={(dateKey) => {
                  // changing the date invalidates a previously chosen time
                  setFormData(prev => ({ ...prev, appointmentDate: dateKey, appointmentTime: '' }));
                  setFormError('');
                }}
              />
              {formData.appointmentDate && availabilityMap[formData.appointmentDate] && (
                <p className="text-xs font-bold text-[#164e43]">
                  Selected: {formData.appointmentDate} · Dentist available {formatTime(availabilityMap[formData.appointmentDate].timeIn)} – {formatTime(availabilityMap[formData.appointmentDate].timeOut)}
                </p>
              )}
              <div className="flex gap-3 pt-4 border-t border-[#f0f5f2]">
                <button type="button" onClick={handleBack} className="bg-white border border-[#d4e2dc] text-[#13241b] px-6 py-3 rounded-xl font-bold text-xs cursor-pointer">Back</button>
                <button type="button" onClick={handleNext} className="bg-[#164e43] text-white px-8 py-3 rounded-xl font-bold text-xs cursor-pointer">Continue</button>
              </div>
            </div>
          )}

          {/* STEP 3: Choose Available Time */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <h3 className="text-2xl font-black text-[#13241b]">Choose an available time</h3>
          {visibleTimeSlots.length === 0 && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
              No appointment slots fit this dentist’s hours on the selected date. Choose another date or dentist.
            </p>
          )}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {visibleTimeSlots.map((slot) => {
                  const isSelected = formData.appointmentTime === slot;
                  const unavailable = isSlotUnavailable(slot);
                  return (
                    <button
                      key={slot}
                      type="button"
                      disabled={unavailable}
                      onClick={() => handleChange('appointmentTime', slot)}
                      className={`border rounded-xl p-4 font-bold text-xs text-center transition ${
                        unavailable ? 'border-[#e5e7eb] bg-gray-100 text-gray-400 cursor-not-allowed line-through' :
                        isSelected ? 'border-[#164e43] bg-[#164e43] text-white shadow-xs cursor-pointer' : 'border-[#d4e2dc] bg-white text-[#13241b] cursor-pointer'
                      }`}
                    >
                      {slot}{unavailable && <span className="block text-[10px] no-underline">Not available</span>}
                    </button>
                  );
                })}
              </div>
              {visibleTimeSlots.length === 0 && (
                <p className="text-xs font-bold text-gray-500">No appointment time slots are available. Please go back and choose another date.</p>
              )}
              <div className="flex gap-3 pt-4 border-t border-[#f0f5f2]">
                <button type="button" onClick={handleBack} className="bg-white border border-[#d4e2dc] text-[#13241b] px-6 py-3 rounded-xl font-bold text-xs cursor-pointer">Back</button>
                <button type="button" onClick={handleNext} className="bg-[#164e43] text-white px-8 py-3 rounded-xl font-bold text-xs cursor-pointer">Continue</button>
              </div>
            </div>
          )}

          {/* STEP 4: Review & Confirm */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <h3 className="text-2xl font-black text-[#13241b]">Please review your appointment information</h3>
              <div className="bg-[#f8faf9] border border-[#d4e2dc] rounded-2xl p-6 space-y-4 text-xs">
                <div className="flex justify-between border-b border-[#e5ece8] pb-3">
                  <span className="font-bold text-[#607368]">Selected service</span>
                  <span className="font-black text-[#13241b] text-right">{formData.selectedServices[0]?.service_name || '—'}</span>
                </div>
                <div className="flex justify-between border-b border-[#e5ece8] pb-3">
                  <span className="font-bold text-[#607368]">Date & Time</span>
                  <span className="font-black text-[#13241b]">{formData.appointmentDate} @ {formData.appointmentTime}</span>
                </div>
                <div className="flex justify-between border-b border-[#e5ece8] pb-3">
                  <span className="font-bold text-[#607368]">Dentist</span>
                  <span className="font-black text-[#13241b]">{dentistName || 'Clinic dentist'}</span>
                </div>
                <div className="flex justify-between border-b border-[#e5ece8] pb-3">
                  <span className="font-bold text-[#607368]">Estimated total</span>
                  <span className="font-black text-[#164e43]">&#8369;{selectedTotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between pb-1">
                  <span className="font-bold text-[#607368]">Patient</span>
                  <span className="font-black text-[#13241b]">{patient?.full_name || patient?.name || '—'}</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#13241b] mb-1">Special notes / concerns (optional)</label>
                <textarea rows="2" value={formData.notes || ''} onChange={(e) => handleChange('notes', e.target.value)} placeholder="e.g. Sensitive lower molar" className="w-full border border-[#d4e2dc] rounded-xl p-3 text-xs bg-white" />
              </div>
              <p className="text-[11px] text-[#607368]">Your request will be reviewed by the clinic assistant. You can follow its status under My Records.</p>

              <div className="space-y-3">
                <label className="flex items-start gap-3 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={formData.isGuardianBooking}
                    onChange={(e) => handleChange('isGuardianBooking', e.target.checked)}
                    className="mt-0.5 rounded border-gray-300 text-[#164e43]"
                  />
                  <span className="font-semibold text-[#13241b]">I am a guardian booking this appointment for the patient.</span>
                </label>
                {formData.isGuardianBooking && (
                  <section className="rounded-xl border border-[#bcd7ca] bg-[#f5faf7] p-4 sm:p-5 space-y-4">
                    <div>
                      <h4 className="text-sm font-black text-[#164e43]">Guardian Information</h4>
                      <p className="mt-1 text-[11px] text-[#607368]">Please provide your contact details as the patient’s guardian.</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="block text-xs font-bold text-[#13241b]">
                        Guardian full name *
                        <input
                          type="text"
                          value={formData.guardianName}
                          onChange={(e) => handleChange('guardianName', e.target.value)}
                          autoComplete="name"
                          className="mt-1 w-full rounded-lg border border-[#d4e2dc] bg-white px-3 py-2.5 text-xs font-normal outline-none focus:border-[#164e43]"
                        />
                      </label>
                      <label className="block text-xs font-bold text-[#13241b]">
                        Relationship to patient *
                        <input
                          type="text"
                          value={formData.guardianRelationship}
                          onChange={(e) => handleChange('guardianRelationship', e.target.value)}
                          placeholder="e.g. Parent"
                          className="mt-1 w-full rounded-lg border border-[#d4e2dc] bg-white px-3 py-2.5 text-xs font-normal outline-none focus:border-[#164e43]"
                        />
                      </label>
                      <label className="block text-xs font-bold text-[#13241b] sm:col-span-2">
                        Guardian contact number *
                        <input
                          type="tel"
                          value={formData.guardianContact}
                          onChange={(e) => handleChange('guardianContact', e.target.value)}
                          autoComplete="tel"
                          className="mt-1 w-full rounded-lg border border-[#d4e2dc] bg-white px-3 py-2.5 text-xs font-normal outline-none focus:border-[#164e43]"
                        />
                      </label>
                    </div>
                  </section>
                )}
              </div>

              <div className="space-y-3 text-xs pt-2">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={formData.consentUseInfo} onChange={(e) => handleChange('consentUseInfo', e.target.checked)} className="mt-0.5 rounded border-gray-300 text-[#164e43]" />
                  <span className="font-semibold text-[#13241b]">I consent to the use of this information for dental appointment scheduling and clinical records.</span>
                </label>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={formData.confirmInfoCorrect} onChange={(e) => handleChange('confirmInfoCorrect', e.target.checked)} className="mt-0.5 rounded border-gray-300 text-[#164e43]" />
                  <span className="font-semibold text-[#13241b]">I confirm that the information shown above is correct.</span>
                </label>
              </div>

              <div className="flex gap-3 pt-4 border-t border-[#f0f5f2]">
                <button type="button" onClick={handleBack} className="bg-white border border-[#d4e2dc] text-[#13241b] px-6 py-3 rounded-xl font-bold text-xs cursor-pointer">Edit information</button>
                <button type="button" onClick={handleConfirmAppointment} disabled={submitting} className="bg-[#164e43] text-white px-8 py-3 rounded-xl font-bold text-xs cursor-pointer">
                  {submitting ? 'Submitting...' : 'Confirm my appointment'}
                </button>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}