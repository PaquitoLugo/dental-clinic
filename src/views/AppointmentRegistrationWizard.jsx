import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import AvailabilityDatePicker, { formatTime } from '../components/AvailabilityDatePicker';

// Dentist's availability is saved by DentistModule under this key (dentist user id = 2)
const DENTIST_ID = 2;
const loadAvailability = () => {
  try {
    const saved = localStorage.getItem(`dentist_availability_${DENTIST_ID}`);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
};

// "8:00 AM" / "1:00 PM" -> minutes since midnight
const slotToMinutes = (label) => {
  const m = label.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === 'PM') h += 12;
  return h * 60 + Number(m[2]);
};
const timeToMinutes = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

export default function AppointmentRegistrationWizard({ selectedCategory, onCancel, onComplete }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [services, setServices] = useState([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceCategory, setServiceCategory] = useState('All');
  const [servicePage, setServicePage] = useState(1);
  const servicesPerPage = 12;

  const [formData, setFormData] = useState({
    selectedServices: [],
    appointmentDate: '',
    appointmentTime: '',
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
    hasValidId: false,
    noPreviousConsult: false,
    consentUseInfo: false,
    confirmInfoCorrect: false
  });

  const [availabilityMap, setAvailabilityMap] = useState(loadAvailability);

  // Keep in sync if the dentist updates availability in another tab
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === `dentist_availability_${DENTIST_ID}`) setAvailabilityMap(loadAvailability());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const categories = ['All', ...new Set(services.map(service => service.category).filter(Boolean))];
  const filteredServices = services.filter(service =>
    (serviceCategory === 'All' || service.category === serviceCategory) &&
    service.service_name.toLowerCase().includes(serviceSearch.toLowerCase())
  );
  const servicePageCount = Math.max(1, Math.ceil(filteredServices.length / servicesPerPage));
  const pagedServices = filteredServices.slice((servicePage - 1) * servicesPerPage, servicePage * servicesPerPage);
  const selectedTotal = formData.selectedServices.reduce((total, service) => total + Number(service.price || 0), 0);

  const availableTimeSlots = [
    '8:00 AM \u2013 9:00 AM',
    '9:00 AM \u2013 10:00 AM',
    '10:00 AM \u2013 11:00 AM',
    '11:00 AM \u2013 12:00 PM',
    '1:00 PM \u2013 2:00 PM'
  ];

  // Only offer slots that fall inside the dentist's time-in / time-out for the chosen date
  const daySchedule = availabilityMap[formData.appointmentDate];
  const visibleTimeSlots = daySchedule
    ? availableTimeSlots.filter((slot) => {
        const [start, end] = slot.split('–').map((s) => slotToMinutes(s));
        return start !== null && end !== null &&
          start >= timeToMinutes(daySchedule.timeIn) && end <= timeToMinutes(daySchedule.timeOut);
      })
    : availableTimeSlots;

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

  // Toggle multi-select / deselect service
  const handleToggleService = (service) => {
    setFormError('');
    setFormData(prev => {
      const exists = prev.selectedServices.some(s => s.id === service.id);
      if (exists) {
        return {
          ...prev,
          selectedServices: prev.selectedServices.filter(s => s.id !== service.id)
        };
      } else {
        return {
          ...prev,
          selectedServices: [...prev.selectedServices, service]
        };
      }
    });
  };

  const handleNext = () => {
    setFormError('');
    if (currentStep === 1 && formData.selectedServices.length === 0) {
      setFormError('Please select at least one dental service to continue.');
      return;
    }
    if (currentStep === 2 && !formData.appointmentDate) {
      setFormError('Please select a valid appointment date.');
      return;
    }
    if (currentStep === 3 && !formData.appointmentTime) {
      setFormError('Please choose an available time slot.');
      return;
    }
    if (currentStep === 4) {
      if (!formData.firstName || !formData.lastName || !formData.birthDate || !formData.sex || !formData.mobileNumber) {
        setFormError('Please fill in all required patient information fields (*).');
        return;
      }
      if (!formData.hasValidId || !formData.noPreviousConsult) {
        setFormError('Please confirm the dental health screening and ID confirmation boxes.');
        return;
      }
    }
    setCurrentStep(prev => Math.min(prev + 1, 5));
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
    if (!formData.consentUseInfo || !formData.confirmInfoCorrect) {
      setFormError('Please check both consent and confirmation boxes to submit.');
      return;
    }

    setSubmitting(true);
    setFormError('');

    try {
      const fullName = `${formData.firstName} ${formData.middleName ? formData.middleName + ' ' : ''}${formData.lastName}${formData.suffix ? ' ' + formData.suffix : ''}`.trim();
      const combinedServiceNames = formData.selectedServices.map(s => s.service_name).join(', ');

      const payload = {
        patient_name: fullName,
        service_name: combinedServiceNames,
        appointment_date: formData.appointmentDate,
        appointment_time: formData.appointmentTime.split('\u2013')[0].trim(),
        mobile_number: formData.mobileNumber,
        email: formData.email || null,
        birth_date: formData.birthDate,
        sex: formData.sex,
        city: formData.city || null,
        province: formData.province || null,
        complete_address: formData.completeAddress || null,
        hospital_number: formData.hospitalNumber || null,
        emergency_contact: formData.emergencyContact || null,
        status: 'Pending'
      };

      const { error } = await supabase
        .from('appointments')
        .insert([payload]);

      if (error) throw error;

      alert('Dental appointment successfully submitted to Supabase!');
      if (onComplete) onComplete();
    } catch (err) {
      console.error('Error inserting appointment to Supabase:', err);
      setFormError('Failed to submit appointment: ' + (err.message || 'Check database connection.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#f4f7f6] font-sans text-[#13241b] flex flex-col pb-8">
      
      {/* Header with Clickable Logo */}
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
            <h1 className="font-black text-xs sm:text-base tracking-tight text-[#13241b]">DENTAL CARE PORTAL</h1>
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

        <main className={`flex-1 w-full mx-auto ${currentStep === 1 ? 'max-w-none px-3 sm:px-6 xl:px-10 py-4 flex flex-col gap-3' : 'max-w-4xl px-4 py-8 space-y-6'}`}>
        <div className={`bg-white border border-[#d4e2dc] rounded-2xl shadow-2xs space-y-2 ${currentStep === 1 ? 'px-4 py-3 sm:px-5' : 'p-6'}`}>
          <span className="text-[10px] font-black tracking-widest text-[#164e43] uppercase">ONLINE REGISTRATION</span>
          <h2 className="text-2xl sm:text-3xl font-black text-[#13241b] tracking-tight">Register a Dental Appointment</h2>
          <p className="text-xs text-[#607368]">
            Follow the steps below. You can select multiple services under this category.
          </p>
        </div>

        <div className={`bg-white border border-[#d4e2dc] rounded-2xl shadow-2xs ${currentStep === 1 ? 'p-3 sm:p-5' : 'p-5 sm:p-8 space-y-6'}`}>
          <div className="space-y-2">
            <span className="text-xs font-bold text-[#13241b]">Step {currentStep} of 5</span>
            <div className="w-full bg-[#e8f0eb] h-2.5 rounded-full overflow-hidden">
              <div 
                className="bg-[#164e43] h-full transition-all duration-300 rounded-full" 
                style={{ width: `${(currentStep / 5) * 100}%` }}
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
                    <h3 className="text-xl sm:text-2xl font-black">{selectedCategory ? `${selectedCategory} Services` : 'Select Services'}</h3>
                    <p className="text-sm text-[#607368] mt-0.5">Pick one or more services. You can review everything before confirming.</p>
                  </div>
                  <div className="flex gap-2 mb-2 flex-wrap">
                    <input aria-label="Search services" value={serviceSearch} onChange={e => { setServiceSearch(e.target.value); setServicePage(1); }} placeholder="Search services" className="min-w-36 flex-1 border border-[#d4e2dc] bg-white rounded-lg px-4 py-2.5 text-sm outline-none focus:border-[#164e43]" />
                    {categories.map(category => <button key={category} type="button" onClick={() => { setServiceCategory(category); setServicePage(1); }} className={`px-4 py-2 rounded-full text-[13px] font-bold border ${serviceCategory === category ? 'bg-[#164e43] text-white border-[#164e43]' : 'bg-white text-[#40584f] border-[#d4e2dc]'}`}>{category}</button>)}
                  </div>
                  <div className="flex-1 min-h-0">
                    {loadingServices ? <div className="py-12 text-center text-xs font-bold text-[#607368]">Loading services...</div> : filteredServices.length === 0 ? <div className="py-8 text-center text-xs text-gray-500">No active services match your search.</div> : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 min-[1700px]:grid-cols-5 gap-3 sm:gap-4 content-start">
                        {pagedServices.map(service => {
                          const isSelected = formData.selectedServices.some(s => s.id === service.id);
                          return <button type="button" key={service.id} onClick={() => handleToggleService(service)} className={`text-left border rounded-2xl px-5 py-4 h-[124px] flex flex-col justify-between cursor-pointer transition ${isSelected ? 'border-[#164e43] bg-[#eef5f2] ring-1 ring-[#164e43]' : 'bg-white border-[#d4e2dc] hover:border-[#a3c4b8]'}`}>
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
                  <h4 className="font-black text-lg">Your appointment</h4><p className="text-[13px] text-[#607368] mt-1">{formData.selectedServices.length} services selected</p>
                  <div className="mt-4 space-y-3 max-h-48 overflow-y-auto">{formData.selectedServices.map(service => <div key={service.id} className="flex justify-between gap-2"><span>{service.service_name}</span><b>&#8369;{Number(service.price).toLocaleString()}</b></div>)}{formData.selectedServices.length === 0 && <p className="text-[#71827c]">Choose a service to get started.</p>}</div>
                  <div className="mt-4 pt-4 border-t border-[#e7eeea] flex justify-between items-center"><span className="text-[#607368]">Estimated total</span><strong className="text-2xl text-[#164e43]">&#8369;{selectedTotal.toLocaleString()}</strong></div>
                  <button type="button" onClick={handleNext} disabled={formData.selectedServices.length === 0} className="w-full mt-4 bg-[#164e43] text-white py-3 rounded-lg font-bold text-sm disabled:opacity-50">Continue to date &amp; time &#8594;</button>
                  <button type="button" onClick={() => setFormData(prev => ({ ...prev, selectedServices: [] }))} className="w-full mt-3 text-[#607368] text-[13px]">Clear selection</button>
                </aside>
              </div>
              <div className="mt-3"><button type="button" onClick={onCancel} className="w-full sm:w-auto bg-white border border-[#d4e2dc] text-[#13241b] px-5 py-2.5 rounded-lg font-bold text-[13px] hover:bg-[#f5f7f6]">&#8592; Back to Portal</button></div>
            </div>
          )}
          {/* STEP 2: Choose Appointment Date */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <h3 className="text-2xl font-black text-[#13241b]">Choose an appointment date</h3>
              <div className="bg-[#eaf4ef] border border-[#bcd7ca] rounded-2xl p-5 space-y-1 text-xs text-[#164e43]">
                <p className="font-bold">Selected Services:</p>
                <ul className="list-disc list-inside font-bold pt-1">
                  {formData.selectedServices.map(s => <li key={s.id}>{s.service_name}</li>)}
                </ul>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {visibleTimeSlots.map((slot) => {
                  const isSelected = formData.appointmentTime === slot;
                  return (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => handleChange('appointmentTime', slot)}
                      className={`border rounded-xl p-4 font-bold text-xs text-center transition cursor-pointer ${
                        isSelected ? 'border-[#164e43] bg-[#164e43] text-white shadow-xs' : 'border-[#d4e2dc] bg-white text-[#13241b]'
                      }`}
                    >
                      {slot}
                    </button>
                  );
                })}
              </div>
              {visibleTimeSlots.length === 0 && (
                <p className="text-xs font-bold text-gray-500">No time slots fall within the dentist's hours on this date. Please go back and choose another date.</p>
              )}
              <div className="flex gap-3 pt-4 border-t border-[#f0f5f2]">
                <button type="button" onClick={handleBack} className="bg-white border border-[#d4e2dc] text-[#13241b] px-6 py-3 rounded-xl font-bold text-xs cursor-pointer">Back</button>
                <button type="button" onClick={handleNext} className="bg-[#164e43] text-white px-8 py-3 rounded-xl font-bold text-xs cursor-pointer">Continue</button>
              </div>
            </div>
          )}

          {/* STEP 4: Patient Information */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <h3 className="text-2xl font-black text-[#13241b]">Enter the patient's information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block font-bold text-[#13241b] mb-1">First name *</label>
                  <input type="text" required value={formData.firstName} onChange={(e) => handleChange('firstName', e.target.value)} className="w-full border border-[#d4e2dc] rounded-xl p-3 bg-white font-semibold" />
                </div>
                <div>
                  <label className="block font-bold text-[#13241b] mb-1">Last name *</label>
                  <input type="text" required value={formData.lastName} onChange={(e) => handleChange('lastName', e.target.value)} className="w-full border border-[#d4e2dc] rounded-xl p-3 bg-white font-semibold" />
                </div>
                <div>
                  <label className="block font-bold text-[#13241b] mb-1">Birth date *</label>
                  <input type="date" required value={formData.birthDate} onChange={(e) => handleChange('birthDate', e.target.value)} className="w-full border border-[#d4e2dc] rounded-xl p-3 bg-white font-semibold" />
                </div>
                <div>
                  <label className="block font-bold text-[#13241b] mb-1">Sex *</label>
                  <select required value={formData.sex} onChange={(e) => handleChange('sex', e.target.value)} className="w-full border border-[#d4e2dc] rounded-xl p-3 bg-white font-semibold">
                    <option value="">Select</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-[#13241b] mb-1">Mobile number *</label>
                  <input type="tel" required placeholder="09171234567" value={formData.mobileNumber} onChange={(e) => handleChange('mobileNumber', e.target.value)} className="w-full border border-[#d4e2dc] rounded-xl p-3 bg-white font-semibold" />
                </div>
              </div>
              <div className="flex gap-3 pt-4 border-t border-[#f0f5f2]">
                <button type="button" onClick={handleBack} className="bg-white border border-[#d4e2dc] text-[#13241b] px-6 py-3 rounded-xl font-bold text-xs cursor-pointer">Back</button>
                <button type="button" onClick={handleNext} className="bg-[#164e43] text-white px-8 py-3 rounded-xl font-bold text-xs cursor-pointer">Review information</button>
              </div>
            </div>
          )}

          {/* STEP 5: Review & Confirm */}
          {currentStep === 5 && (
            <div className="space-y-6">
              <h3 className="text-2xl font-black text-[#13241b]">Please review your appointment information</h3>
              <div className="bg-[#f8faf9] border border-[#d4e2dc] rounded-2xl p-6 space-y-4 text-xs">
                <div className="flex justify-between border-b border-[#e5ece8] pb-3">
                  <span className="font-bold text-[#607368]">Selected Services</span>
                  <span className="font-black text-[#13241b] text-right">{formData.selectedServices.map(s => s.service_name).join(', ')}</span>
                </div>
                <div className="flex justify-between border-b border-[#e5ece8] pb-3">
                  <span className="font-bold text-[#607368]">Date & Time</span>
                  <span className="font-black text-[#13241b]">{formData.appointmentDate} @ {formData.appointmentTime}</span>
                </div>
                <div className="flex justify-between pb-1">
                  <span className="font-bold text-[#607368]">Patient name</span>
                  <span className="font-black text-[#13241b]">{formData.firstName} {formData.lastName}</span>
                </div>
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
                  {submitting ? 'Submitting to Supabase...' : 'Confirm my appointment'}
                </button>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
