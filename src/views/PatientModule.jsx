import React, { useState } from 'react';

export default function PatientModule({ services, dentists, createAppointment, appointments, user, currentView, onViewChange }) {
  const [patientName, setPatientName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [email, setEmail] = useState('');
  
  // Category & Service States (No Custom Option for Patients)
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedService, setSelectedService] = useState('');

  const [selectedDentist, setSelectedDentist] = useState('');
  const [appointmentDate, setAppointmentDate] = useState('');
  const [appointmentTime, setAppointmentTime] = useState('');
  const [notes, setNotes] = useState('');
  const [successMsg, setSuccessMsg] = useState(false);
  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceCategory, setServiceCategory] = useState('All services');

  const mockServices = [
    {
      name: 'Simple Tooth Extraction',
      category: 'Surgery',
      description: 'Removal of a visible, fully erupted tooth under local anesthesia.',
      price: '₱300'
    },
    {
      name: 'Wisdom Tooth Removal',
      category: 'Surgery',
      description: 'Surgical removal of impacted or partially erupted third molars.',
      price: '₱[PRICE]'
    }
  ];

  const activeServices = services.filter(service => service.is_active);
  const serviceCategories = [...new Set(activeServices.map(service => service.category).filter(Boolean))];
  const visibleServices = activeServices.filter(service =>
    (serviceCategory === 'All services' || service.category === serviceCategory) &&
    (service.service_name || '').toLowerCase().includes(serviceSearch.toLowerCase())
  );

  const todayDateStr = new Date().toISOString().split('T')[0];

  // Unique categories derived from available active services in database
  const categories = [...new Set(services.map(s => s.category))];

  // Filter services by selected category
  const filteredServices = services.filter(s => s.category === selectedCategory);

  const handleCategoryChange = (e) => {
    setSelectedCategory(e.target.value);
    setSelectedService('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!patientName || !selectedService || !selectedDentist || !appointmentDate || !appointmentTime) return;

    await createAppointment({
      patient_name: patientName,
      contact_number: contactNumber,
      email,
      service_name: selectedService,
      assigned_dentist: selectedDentist,
      appointment_date: appointmentDate,
      appointment_time: appointmentTime,
      notes,
      status: 'Pending'
    });

    setSuccessMsg(true);
    setPatientName('');
    setContactNumber('');
    setEmail('');
    setSelectedCategory('');
    setSelectedService('');
    setSelectedDentist('');
    setAppointmentDate('');
    setAppointmentTime('');
    setNotes('');
    setTimeout(() => setSuccessMsg(false), 5000);
  };

  const normalizedPatientName = (user?.name || '').trim().toLowerCase();
  const patientAppointments = appointments.filter(
    appointment => normalizedPatientName && (appointment.patient_name || '').trim().toLowerCase() === normalizedPatientName
  );

  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      {currentView === 'services' && (
        <section className="services-page">
          <header className="services-header">
            <div>
              <h2>Our Dental Services</h2>
              <p>Browse the catalog by category, then book the service you need.</p>
            </div>
            <label className="services-search">
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                placeholder="Search services"
                value={serviceSearch}
                onChange={event => setServiceSearch(event.target.value)}
                aria-label="Search services"
              />
            </label>
          </header>

          <div className="services-filters" aria-label="Filter services by category">
            {['All services', ...serviceCategories].map(category => (
              <button
                key={category}
                type="button"
                onClick={() => setServiceCategory(category)}
                className={serviceCategory === category ? 'active' : ''}
              >
                {category}
              </button>
            ))}
          </div>

          <div className="services-grid">
            {visibleServices.map(service => (
              <article className="service-card" key={service.id}>
                <span className="service-category">{service.category}</span>
                <h3>{service.service_name}</h3>
                <p className="service-description">{service.service_description || 'Contact the clinic for more details about this service.'}</p>
                <footer>
                  <div>
                    <span className="starting-label">Starting at</span>
                    <strong>₱{Number(service.price).toLocaleString('en-PH')}</strong>
                  </div>
                  <button type="button" onClick={() => onViewChange('book')}>Book this service</button>
                </footer>
              </article>
            ))}
            {visibleServices.length === 0 && <p className="services-empty">No services match your search.</p>}
          </div>
        </section>
      )}

      {currentView === 'book' && (
        <div className="h-full grid grid-cols-12 gap-6 overflow-hidden">
          <div className="col-span-6 bg-white border border-[#d4e2dc] rounded-2xl p-6 shadow-2xs overflow-y-auto">
            <h3 className="font-black text-xl text-[#13241b] mb-1">Schedule Your Dental Appointment</h3>
            <p className="text-xs text-[#607368] mb-6">Select a service category, choose from our catalog, and pick your dentist.</p>

            {successMsg && (
              <div className="bg-green-50 border border-green-200 text-green-700 text-xs p-4 rounded-xl mb-4 font-bold">
                ✓ Appointment request submitted successfully!
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#607368] mb-1">Full Name *</label>
                <input type="text" required value={patientName} onChange={e => setPatientName(e.target.value)} placeholder="e.g. Maria Santos" className="w-full border border-[#d4e2dc] rounded-xl p-3 text-xs bg-[#f5f7f6]" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#607368] mb-1">Contact Number *</label>
                  <input type="text" required value={contactNumber} onChange={e => setContactNumber(e.target.value)} placeholder="0917XXXXXXX" className="w-full border border-[#d4e2dc] rounded-xl p-3 text-xs bg-[#f5f7f6]" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#607368] mb-1">Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="patient@email.com" className="w-full border border-[#d4e2dc] rounded-xl p-3 text-xs bg-[#f5f7f6]" />
                </div>
              </div>

              {/* Step 1: Choose Category */}
              <div>
                <label className="block text-xs font-bold text-[#164e43] mb-1">1. Select Service Category *</label>
                <select required value={selectedCategory} onChange={handleCategoryChange} className="w-full border border-[#d4e2dc] rounded-xl p-3 text-xs bg-[#f5f7f6] font-bold">
                  <option value="">-- Choose Category First --</option>
                  {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>

              {/* Step 2: Choose Service from Catalog */}
              {selectedCategory && (
                <div>
                  <label className="block text-xs font-bold text-[#164e43] mb-1">2. Select Offered Service *</label>
                  <select required value={selectedService} onChange={e => setSelectedService(e.target.value)} className="w-full border border-[#d4e2dc] rounded-xl p-3 text-xs bg-[#f5f7f6] font-bold">
                    <option value="">-- Choose Treatment --</option>
                    {filteredServices.map(s => <option key={s.id} value={s.service_name}>{s.service_name} - ₱{parseFloat(s.price).toLocaleString()}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-[#607368] mb-1">Select Dentist *</label>
                <select required value={selectedDentist} onChange={e => setSelectedDentist(e.target.value)} className="w-full border border-[#d4e2dc] rounded-xl p-3 text-xs bg-[#f5f7f6] font-bold">
                  <option value="">-- Choose Dentist --</option>
                  {dentists.map(d => <option key={d.id} value={d.full_name}>{d.full_name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#607368] mb-1">Appointment Date *</label>
                  <input type="date" required min={todayDateStr} value={appointmentDate} onChange={e => setAppointmentDate(e.target.value)} className="w-full border border-[#d4e2dc] rounded-xl p-3 text-xs bg-[#f5f7f6]" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#607368] mb-1">Appointment Time *</label>
                  <input type="time" required value={appointmentTime} onChange={e => setAppointmentTime(e.target.value)} className="w-full border border-[#d4e2dc] rounded-xl p-3 text-xs bg-[#f5f7f6]" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#607368] mb-1">Special Notes / Concerns</label>
                <textarea rows="2" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Sensitive lower molar" className="w-full border border-[#d4e2dc] rounded-xl p-3 text-xs bg-[#f5f7f6]" />
              </div>

              <button type="submit" className="w-full bg-[#164e43] text-white py-3.5 rounded-xl font-bold text-xs hover:bg-[#0f362e] transition cursor-pointer">
                Confirm & Submit Request
              </button>
            </form>
          </div>

          <div className="col-span-6 bg-white border border-[#d4e2dc] rounded-2xl p-6 shadow-2xs flex flex-col overflow-hidden">
            <h3 className="font-black text-xl text-[#13241b] mb-4">Live Appointment Schedule</h3>
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#d4e2dc] text-[11px] font-bold text-[#607368] uppercase">
                    <th className="py-3 px-2">Patient</th>
                    <th className="py-3 px-2">Service</th>
                    <th className="py-3 px-2">Dentist</th>
                    <th className="py-3 px-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f5f2] text-xs">
                  {patientAppointments.map(a => (
                    <tr key={a.id} className="hover:bg-[#f8faf9]">
                      <td className="py-3 px-2 font-bold">{a.patient_name}</td>
                      <td className="py-3 px-2 text-[#607368]">{a.service_name}</td>
                      <td className="py-3 px-2 font-semibold text-[#164e43]">{a.assigned_dentist}</td>
                      <td className="py-3 px-2 text-right"><span className="bg-[#e3ede6] text-[#164e43] px-2 py-0.5 rounded font-bold text-[11px]">{a.status}</span></td>
                    </tr>
                  ))}
                  {patientAppointments.length === 0 && (
                    <tr>
                      <td colSpan="4" className="py-8 text-center text-gray-400 font-medium">
                        No appointments to display.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {currentView === 'history' && (
        <div className="h-full bg-white border border-[#d4e2dc] rounded-2xl p-6 shadow-2xs flex flex-col overflow-hidden">
          <h3 className="font-black text-xl text-[#13241b] mb-4">My Appointment Records</h3>
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#d4e2dc] text-[11px] font-bold text-[#607368] uppercase">
                  <th className="py-3 px-3">Service</th>
                  <th className="py-3 px-3">Assigned Dentist</th>
                  <th className="py-3 px-3">Schedule</th>
                  <th className="py-3 px-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f5f2] text-xs">
                {patientAppointments.map(a => (
                  <tr key={a.id} className="hover:bg-[#f8faf9]">
                    <td className="py-3 px-3 font-bold text-[#13241b]">{a.service_name}</td>
                    <td className="py-3 px-3 font-semibold text-[#164e43]">{a.assigned_dentist}</td>
                    <td className="py-3 px-3 text-[#607368]">{a.appointment_date} @ {a.appointment_time}</td>
                    <td className="py-3 px-3 text-right"><span className="bg-[#e3ede6] text-[#164e43] px-2.5 py-0.5 rounded font-bold">{a.status}</span></td>
                  </tr>
                ))}
                {patientAppointments.length === 0 && (
                  <tr>
                    <td colSpan="4" className="py-8 text-center text-gray-400 font-medium">
                      You don’t have any appointment records yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
