import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import AppointmentRegistrationWizard from './AppointmentRegistrationWizard';
import ToothChart from '../components/ToothChart';
import TreatmentRecordModal from '../components/TreatmentRecordModal';
import useTreatmentRecords from '../lib/useTreatmentRecords';

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
  const [appointmentError, setAppointmentError] = useState('');

  // The signed-in patient's own account record (used for booking and the tooth chart)
  const [profile, setProfile] = useState(null);
  useEffect(() => {
    if (!user?.id) return;
    supabase.from('staff_users').select('*').eq('id', user.id).single()
      .then(({ data }) => { if (data) setProfile(data); });
  }, [user?.id]);

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

  const getServiceDuration = (serviceName) => {
    const service = services.find(item => item.service_name === serviceName);
    const duration = Number(service?.duration_mins);
    return Number.isFinite(duration) && duration > 0 ? duration : 30;
  };

  const hasScheduleConflict = () => {
    const [hours, minutes] = appointmentTime.split(':').map(Number);
    const startMinutes = hours * 60 + minutes;
    const endMinutes = startMinutes + getServiceDuration(selectedService);

    return appointments.some(appointment => {
      if (
        appointment.status === 'Pending' ||
        appointment.appointment_date !== appointmentDate ||
        appointment.assigned_dentist !== selectedDentist
      ) return false;

      const [existingHours, existingMinutes] = (appointment.appointment_time || '').split(':').map(Number);
      if (!Number.isFinite(existingHours) || !Number.isFinite(existingMinutes)) return false;

      const existingStart = existingHours * 60 + existingMinutes;
      const existingEnd = existingStart + getServiceDuration(appointment.service_name);
      return startMinutes < existingEnd && existingStart < endMinutes;
    });
  };

  const handleCategoryChange = (e) => {
    setSelectedCategory(e.target.value);
    setSelectedService('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!patientName || !selectedService || !selectedDentist || !appointmentDate || !appointmentTime) return;

    if (hasScheduleConflict()) {
      setAppointmentError('That time overlaps another appointment for this dentist. Please choose a different time.');
      return;
    }
    setAppointmentError('');

    await createAppointment({
      patient_name: patientName,
      contact_number: contactNumber,
      email,
      service_name: selectedService,
      service_price: Number(services.find(service => service.service_name === selectedService)?.price || 0),
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
  const { records: myRecords } = useTreatmentRecords(patientAppointments.map(a => a.id));
  const [viewingRecord, setViewingRecord] = useState(null);
  const liveAppointments = appointments.filter(
    appointment => appointment.status !== 'Pending' && appointment.status !== 'Completed' && appointment.status !== 'Rejected'
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
        <div className="h-full">
          <AppointmentRegistrationWizard
            embedded
            patient={profile || { full_name: user?.name, name: user?.name }}
            createAppointment={createAppointment}
            existingAppointments={appointments}
            onComplete={() => onViewChange('history')}
          />
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
                  <th className="py-3 px-3">Doctor's Notes</th>
                  <th className="py-3 px-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f5f2] text-xs">
                {patientAppointments.map(a => (
                  <tr key={a.id} className="hover:bg-[#f8faf9]">
                    <td className="py-3 px-3 font-bold text-[#13241b]">{a.service_name}</td>
                    <td className="py-3 px-3 font-semibold text-[#164e43]">{a.assigned_dentist}</td>
                    <td className="py-3 px-3 text-[#607368]">{a.appointment_date} @ {a.appointment_time}</td>
                    <td className="py-3 px-3">
                      {myRecords[String(a.id)] ? (
                        <button type="button" onClick={() => setViewingRecord(a)} className="text-[11px] font-bold text-[#164e43] hover:underline cursor-pointer">View notes &amp; prescription</button>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right"><span className="bg-[#e3ede6] text-[#164e43] px-2.5 py-0.5 rounded font-bold">{a.status}</span></td>
                  </tr>
                ))}
                {patientAppointments.length === 0 && (
                  <tr>
                    <td colSpan="5" className="py-8 text-center text-gray-400 font-medium">
                      You don’t have any appointment records yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {viewingRecord && (
        <TreatmentRecordModal
          appointment={viewingRecord}
          record={myRecords[String(viewingRecord.id)]}
          onClose={() => setViewingRecord(null)}
        />
      )}

      {currentView === 'toothchart' && (
        <div className="h-full overflow-y-auto space-y-4">
          <div>
            <h3 className="font-black text-xl text-[#13241b]">My Tooth Chart</h3>
            <p className="text-xs text-[#607368]">The current status of each of your teeth, as recorded by your dentist.</p>
          </div>
          <ToothChart patientId={user?.id} patientName={user?.name} canEdit={false} />
        </div>
      )}
    </div>
  );
}
