import React, { useState } from 'react';

export default function PatientModule({ services, dentists, createAppointment, appointments }) {
  const [patientName, setPatientName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [email, setEmail] = useState('');
  const [selectedService, setSelectedService] = useState('');
  const [selectedDentist, setSelectedDentist] = useState('');
  const [appointmentDate, setAppointmentDate] = useState('');
  const [appointmentTime, setAppointmentTime] = useState('');
  const [notes, setNotes] = useState('');
  const [successMsg, setSuccessMsg] = useState(false);

  const todayDateStr = new Date().toISOString().split('T')[0];

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
    setSelectedService('');
    setSelectedDentist('');
    setAppointmentDate('');
    setAppointmentTime('');
    setNotes('');
    setTimeout(() => setSuccessMsg(false), 5000);
  };

  return (
    <div className="h-full w-full grid grid-cols-12 gap-6 overflow-hidden">
      
      {/* Booking Form */}
      <div className="col-span-5 bg-white border border-[#d4e2dc] rounded-2xl p-6 shadow-2xs overflow-y-auto">
        <h3 className="font-black text-xl text-[#13241b] mb-1">Schedule Your Dental Appointment</h3>
        <p className="text-xs text-[#607368] mb-6">Select a treatment, pick your preferred dentist, and choose your schedule.</p>

        {successMsg && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-xs p-4 rounded-xl mb-4 font-bold">
            ✓ Appointment request submitted successfully!
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#607368] mb-1">Full Name</label>
            <input 
              type="text" 
              required 
              value={patientName} 
              onChange={e => setPatientName(e.target.value)} 
              placeholder="e.g. Maria Santos"
              className="w-full border border-[#d4e2dc] rounded-xl p-3 text-xs bg-[#f5f7f6] focus:outline-none focus:border-[#164e43]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#607368] mb-1">Contact Number</label>
              <input 
                type="text" 
                required 
                value={contactNumber} 
                onChange={e => setContactNumber(e.target.value)} 
                placeholder="0917XXXXXXX"
                className="w-full border border-[#d4e2dc] rounded-xl p-3 text-xs bg-[#f5f7f6] focus:outline-none focus:border-[#164e43]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#607368] mb-1">Email (Optional)</label>
              <input 
                type="email" 
                value={email} 
                onChange={e => setEmail(e.target.value)} 
                placeholder="patient@email.com"
                className="w-full border border-[#d4e2dc] rounded-xl p-3 text-xs bg-[#f5f7f6] focus:outline-none focus:border-[#164e43]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#607368] mb-1">Select Service</label>
              <select 
                required 
                value={selectedService} 
                onChange={e => setSelectedService(e.target.value)}
                className="w-full border border-[#d4e2dc] rounded-xl p-3 text-xs bg-[#f5f7f6] font-bold focus:outline-none"
              >
                <option value="">-- Choose Treatment --</option>
                {services.map(s => (
                  <option key={s.id} value={s.service_name}>
                    {s.service_name} - ₱{parseFloat(s.price).toLocaleString()}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#607368] mb-1">Select Dentist</label>
              <select 
                required 
                value={selectedDentist} 
                onChange={e => setSelectedDentist(e.target.value)}
                className="w-full border border-[#d4e2dc] rounded-xl p-3 text-xs bg-[#f5f7f6] font-bold focus:outline-none"
              >
                <option value="">-- Choose Dentist --</option>
                {dentists.map(d => (
                  <option key={d.id} value={d.full_name}>
                    {d.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#607368] mb-1">Appointment Date *</label>
              <input 
                type="date"
                required
                min={todayDateStr}
                value={appointmentDate}
                onChange={e => setAppointmentDate(e.target.value)}
                className="w-full border border-[#d4e2dc] rounded-xl p-3 text-xs bg-[#f5f7f6] focus:outline-none focus:border-[#164e43]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#607368] mb-1">Appointment Time *</label>
              <input 
                type="time"
                required
                value={appointmentTime}
                onChange={e => setAppointmentTime(e.target.value)}
                className="w-full border border-[#d4e2dc] rounded-xl p-3 text-xs bg-[#f5f7f6] focus:outline-none focus:border-[#164e43]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#607368] mb-1">Special Notes / Concerns</label>
            <textarea 
              rows="2" 
              value={notes} 
              onChange={e => setNotes(e.target.value)} 
              placeholder="e.g. Sensitive lower molar"
              className="w-full border border-[#d4e2dc] rounded-xl p-3 text-xs bg-[#f5f7f6] focus:outline-none"
            />
          </div>

          <button type="submit" className="w-full bg-[#164e43] text-white py-3.5 rounded-xl font-bold text-xs shadow-2xs hover:bg-[#0f362e] transition cursor-pointer">
            Confirm & Submit Request
          </button>
        </form>
      </div>

      {/* Booking History Table */}
      <div className="col-span-7 bg-white border border-[#d4e2dc] rounded-2xl p-6 shadow-2xs flex flex-col overflow-hidden">
        <h3 className="font-black text-xl text-[#13241b] mb-4">Live Appointment Schedule</h3>
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#d4e2dc] text-[11px] font-bold text-[#607368] uppercase">
                <th className="py-3 px-2">Patient</th>
                <th className="py-3 px-2">Service</th>
                <th className="py-3 px-2">Dentist</th>
                <th className="py-3 px-2">Date & Time</th>
                <th className="py-3 px-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f5f2] text-xs">
              {appointments.map(a => (
                <tr key={a.id} className="hover:bg-[#f8faf9]">
                  <td className="py-3 px-2 font-bold text-[#13241b]">{a.patient_name}</td>
                  <td className="py-3 px-2 text-[#607368]">{a.service_name}</td>
                  <td className="py-3 px-2 font-semibold text-[#164e43]">{a.assigned_dentist || 'Unassigned'}</td>
                  <td className="py-3 px-2 text-[#607368]">{a.appointment_date} @ {a.appointment_time}</td>
                  <td className="py-3 px-2 text-right">
                    <span className="bg-[#e3ede6] text-[#164e43] px-2.5 py-0.5 rounded-md font-bold text-[11px]">
                      {a.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}