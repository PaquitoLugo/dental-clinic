import React from 'react';

export default function AssistantModule({ appointments, updateAppointmentStatus }) {
  
  const handleStatusChange = async (id, status, currentQueue) => {
    const nextQueue = status === 'In Queue' ? (currentQueue || Math.floor(Math.random() * 90) + 10) : currentQueue;
    await updateAppointmentStatus(id, status, nextQueue);
  };

  return (
    <div className="h-full w-full bg-white border border-[#d4e2dc] rounded-2xl p-6 shadow-2xs flex flex-col overflow-hidden">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="font-black text-xl text-[#13241b]">Dental Assistant Queue Management Board</h3>
          <p className="text-xs text-[#607368] mt-1">Check-in patients, assign queue numbers, and manage appointment progression.</p>
        </div>
        <span className="bg-[#e3ede6] text-[#164e43] text-xs font-bold px-4 py-1.5 rounded-full border border-[#d4e2dc]">
          Active Appointments: {appointments.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#d4e2dc] text-[11px] font-bold text-[#607368] uppercase">
              <th className="py-3 px-3">Queue #</th>
              <th className="py-3 px-3">Patient Name</th>
              <th className="py-3 px-3">Contact</th>
              <th className="py-3 px-3">Requested Service</th>
              <th className="py-3 px-3">Date & Time</th>
              <th className="py-3 px-3">Status</th>
              <th className="py-3 px-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f5f2] text-xs">
            {appointments.map(a => (
              <tr key={a.id} className="hover:bg-[#f8faf9]">
                <td className="py-3 px-3 font-black text-[#164e43] text-sm">
                  {a.queue_number ? `#${a.queue_number}` : '--'}
                </td>
                <td className="py-3 px-3 font-bold text-[#13241b]">{a.patient_name}</td>
                <td className="py-3 px-3 text-[#607368]">{a.contact_number}</td>
                <td className="py-3 px-3 font-semibold text-[#13241b]">{a.service_name}</td>
                <td className="py-3 px-3 text-[#607368]">{a.appointment_date} @ {a.appointment_time}</td>
                <td className="py-3 px-3">
                  <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${
                    a.status === 'Completed' ? 'bg-green-100 text-green-700' :
                    a.status === 'In Treatment' ? 'bg-amber-100 text-amber-700' :
                    a.status === 'In Queue' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                  }`}>
                    {a.status}
                  </span>
                </td>
                <td className="py-3 px-3 text-right space-x-1.5">
                  <button 
                    onClick={() => handleStatusChange(a.id, 'In Queue', a.queue_number)}
                    className="bg-[#e3ede6] text-[#164e43] hover:bg-[#164e43] hover:text-white px-2.5 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer"
                  >
                    Check In
                  </button>
                  <button 
                    onClick={() => handleStatusChange(a.id, 'In Treatment', a.queue_number)}
                    className="bg-amber-50 text-amber-700 hover:bg-amber-600 hover:text-white px-2.5 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer"
                  >
                    Chair
                  </button>
                  <button 
                    onClick={() => handleStatusChange(a.id, 'Completed', a.queue_number)}
                    className="bg-green-50 text-green-700 hover:bg-green-600 hover:text-white px-2.5 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer"
                  >
                    Complete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}