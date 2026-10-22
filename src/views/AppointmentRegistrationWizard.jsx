import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function AppointmentRegistrationWizard({ selectedCategory, onCancel, onComplete }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [services, setServices] = useState([]);
  const [loadingServices, setLoadingServices] = useState(true);

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

  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const availableTimeSlots = [
    '8:00 AM – 9:00 AM',
    '9:00 AM – 10:00 AM',
    '10:00 AM – 11:00 AM',
    '11:00 AM – 12:00 PM',
    '1:00 PM – 2:00 PM'
  ];

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
        appointment_time: formData.appointmentTime.split('–')[0].trim(),
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
    <div className="min-h-screen w-full bg-[#f4f7f6] font-sans text-[#13241b] flex flex-col pb-12">
      
      {/* Header with Clickable Logo */}
      <header className="bg-white border-b border-[#e1ebd7] px-6 py-4 flex items-center justify-between sticky top-0 z-40 shadow-2xs">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-3 text-left cursor-pointer hover:opacity-85 transition bg-transparent border-none p-0"
        >
          <div className="w-10 h-10 rounded-full bg-[#164e43] flex items-center justify-center text-white font-black text-xl shadow-xs">
            🦷
          </div>
          <div>
            <h1 className="font-black text-base tracking-tight text-[#13241b]">DENTAL CARE PORTAL</h1>
            <p className="text-[10px] font-bold text-[#607368] uppercase tracking-wider">Patient Scheduler & Charting System</p>
          </div>
        </button>

        <button
          type="button"
          onClick={onCancel}
          className="bg-white border border-[#d4e2dc] text-[#164e43] px-4 py-2 rounded-xl font-bold text-xs hover:bg-[#f5f7f6] transition cursor-pointer shadow-2xs"
        >
          ← Cancel / Back to Home
        </button>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8 space-y-6">
        <div className="bg-white border border-[#d4e2dc] rounded-2xl p-6 shadow-2xs space-y-2">
          <span className="text-[10px] font-black tracking-widest text-[#164e43] uppercase">ONLINE REGISTRATION</span>
          <h2 className="text-3xl font-black text-[#13241b] tracking-tight">Register a Dental Appointment</h2>
          <p className="text-xs text-[#607368]">
            Follow the steps below. You can select multiple services under this category[cite: 19].
          </p>
        </div>

        <div className="bg-white border border-[#d4e2dc] rounded-2xl p-8 shadow-2xs space-y-6">
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
              ⚠️ {formError}
            </div>
          )}

          {/* STEP 1: Multi-select Category Services */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-2xl font-black text-[#13241b]">
                    {selectedCategory ? `${selectedCategory} Services` : 'Select Services'}
                  </h3>
                  <p className="text-xs text-[#607368] italic mt-1">Click cards to select or deselect multiple services.</p>
                </div>
                <span className="text-xs bg-[#e3ede6] text-[#164e43] font-black px-3 py-1 rounded-full">
                  {formData.selectedServices.length} Selected
                </span>
              </div>

              {loadingServices ? (
                <div className="py-12 text-center text-xs font-bold text-[#607368]">
                  Loading category services from Supabase...
                </div>
              ) : services.length === 0 ? (
                <div className="py-8 text-center text-xs font-bold text-gray-500">
                  No active services found in this category.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {services.map((service) => {
                    const isSelected = formData.selectedServices.some(s => s.id === service.id);
                    return (
                      <div 
                        key={service.id}
                        onClick={() => handleToggleService(service)}
                        className={`border rounded-2xl p-6 flex flex-col justify-between space-y-4 cursor-pointer transition ${
                          isSelected ? 'border-[#164e43] bg-[#f0f5f2] shadow-xs ring-2 ring-[#164e43]' : 'border-[#d4e2dc] hover:border-[#a3c4b8]'
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="flex justify-between items-start">
                            <span className="text-2xl">🦷</span>
                            <span className="text-xs font-black text-[#164e43]">
                              ₱{parseFloat(service.price).toLocaleString()}
                            </span>
                          </div>
                          <h4 className="font-black text-lg text-[#13241b]">{service.service_name}</h4>
                          <p className="text-xs font-semibold text-[#4b5563] leading-relaxed">
                            {service.service_description || 'Standard dental consultation and procedure.'}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleService(service);
                          }}
                          className={`w-full py-3 rounded-xl font-bold text-xs transition cursor-pointer ${
                            isSelected ? 'bg-[#164e43] text-white' : 'bg-gray-100 text-[#13241b] hover:bg-gray-200'
                          }`}
                        >
                          {isSelected ? '✓ Selected (Click to Deselect)' : '+ Select this service'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-[#f0f5f2]">
                <button
                  type="button"
                  onClick={onCancel}
                  className="bg-white border border-[#d4e2dc] text-[#13241b] px-6 py-3 rounded-xl font-bold text-xs hover:bg-[#f5f7f6] transition cursor-pointer"
                >
                  ← Back to Portal
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={formData.selectedServices.length === 0}
                  className="bg-[#164e43] text-white px-8 py-3 rounded-xl font-bold text-xs hover:bg-[#0f362e] transition disabled:opacity-50 cursor-pointer"
                >
                  Continue ({formData.selectedServices.length})
                </button>
              </div>
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
              <div className="space-y-2 max-w-md">
                <label className="block text-xs font-bold text-[#13241b]">Appointment date *</label>
                <input 
                  type="date"
                  required
                  value={formData.appointmentDate}
                  onChange={(e) => handleChange('appointmentDate', e.target.value)}
                  className="w-full border border-[#d4e2dc] rounded-xl p-3 text-xs bg-white font-bold text-[#13241b] focus:outline-none focus:border-[#164e43]"
                />
              </div>
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
                {availableTimeSlots.map((slot) => {
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