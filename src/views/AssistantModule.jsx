import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import TreatmentRecordModal from '../components/TreatmentRecordModal';
import useTreatmentRecords from '../lib/useTreatmentRecords';

// Appointment lifecycle handled by the dental assistant:
//   Pending -> Accepted (or Rejected) -> In Queue -> In Treatment -> Completed
// Rule: each doctor can have only ONE patient In Treatment at a time; different doctors work in parallel.
const STATUS_STYLE = {
  Pending: 'bg-gray-100 text-gray-700',
  Accepted: 'bg-emerald-100 text-emerald-700',
  'In Queue': 'bg-blue-100 text-blue-700',
  'In Treatment': 'bg-amber-100 text-amber-700',
  Completed: 'bg-green-100 text-green-700',
  Rejected: 'bg-red-100 text-red-700',
};

const FILTERS = ['Active', 'Pending', 'Accepted', 'In Queue', 'In Treatment', 'Completed', 'Rejected', 'All'];
const COUNTS_TOWARD_CAPACITY = ['Accepted', 'In Queue', 'In Treatment', 'Completed'];
const UNASSIGNED = '__unassigned__';

const formatTime = (t) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || '');
  if (!m) return t || '';
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
};

export default function AssistantModule({ appointments = [], updateAppointmentStatus, dentists = [] }) {
  const [filter, setFilter] = useState('Active');
  const [doctorFilter, setDoctorFilter] = useState('All');
  const [busyId, setBusyId] = useState(null);
  const [overrides, setOverrides] = useState({}); // doctor assigned here before the shared list refreshes
  const [fetchedDentists, setFetchedDentists] = useState([]);
  const { records, refresh: refreshRecords } = useTreatmentRecords();
  const [viewing, setViewing] = useState(null);

  // Doctors come from the shared context; fall back to a direct query if it has none
  useEffect(() => {
    if (dentists.length > 0) return;
    supabase.from('staff_users').select('id, full_name').eq('role', 'dentist').is('archived_at', null)
      .then(({ data }) => setFetchedDentists(data || []));
  }, [dentists.length]);

  const doctorOf = (a) => overrides[a.id] ?? a.assigned_dentist ?? '';

  const doctors = useMemo(() => {
    const base = (dentists.length ? dentists : fetchedDentists).filter((d) => d.full_name);
    const known = new Set(base.map((d) => d.full_name));
    const extra = [...new Set(appointments.map((a) => a.assigned_dentist).filter(Boolean))]
      .filter((n) => !known.has(n)).map((n) => ({ id: null, full_name: n }));
    return [...base, ...extra];
  }, [dentists, fetchedDentists, appointments]);

  const hasUnassigned = appointments.some((a) => !doctorOf(a) && !['Completed', 'Rejected'].includes(a.status));

  // Who is in the chair / waiting, per doctor
  const board = doctors.map((d) => {
    const mine = appointments.filter((a) => doctorOf(a) === d.full_name);
    const inChair = mine.find((a) => a.status === 'In Treatment') || null;
    const waiting = mine
      .filter((a) => a.status === 'In Queue')
      .sort((a, b) => (Number(a.queue_number) || 0) - (Number(b.queue_number) || 0));
    return { doctor: d, inChair, waiting, pending: mine.filter((a) => a.status === 'Pending').length };
  });

  const visible = appointments
    .filter((a) => {
      if (doctorFilter === UNASSIGNED && doctorOf(a)) return false;
      if (doctorFilter !== 'All' && doctorFilter !== UNASSIGNED && doctorOf(a) !== doctorFilter) return false;
      if (filter === 'All') return true;
      if (filter === 'Active') return !['Completed', 'Rejected'].includes(a.status);
      return a.status === filter;
    })
    .sort((a, b) => `${a.appointment_date} ${a.appointment_time}`.localeCompare(`${b.appointment_date} ${b.appointment_time}`));

  // Queue numbers run 1, 2, 3... per doctor per day
  const nextQueueNumber = (a) =>
    Math.max(0, ...appointments
      .filter((x) => x.appointment_date === a.appointment_date && doctorOf(x) === doctorOf(a))
      .map((x) => Number(x.queue_number) || 0)) + 1;

  const dailyLimitFor = (doctorName) => {
    const id = doctors.find((d) => d.full_name === doctorName)?.id;
    return id ? Number(localStorage.getItem(`dentist_limit_${id}`)) || null : null;
  };

  const run = async (a, status, { confirmText, queue } = {}) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusyId(a.id);
    try {
      await updateAppointmentStatus(a.id, status, queue ?? a.queue_number);
    } finally {
      setBusyId(null);
    }
  };

  const assignDoctor = async (a, name) => {
    if (!name) return;
    const { error } = await supabase.from('appointments').update({ assigned_dentist: name }).eq('id', a.id);
    if (error) { window.alert(`Could not assign the doctor: ${error.message}`); return; }
    setOverrides((prev) => ({ ...prev, [a.id]: name }));
  };

  const accept = (a) => {
    const doc = doctorOf(a);
    const limit = dailyLimitFor(doc);
    const accepted = appointments.filter(
      (x) => x.appointment_date === a.appointment_date && x.id !== a.id && doctorOf(x) === doc && COUNTS_TOWARD_CAPACITY.includes(x.status)
    ).length;
    return run(a, 'Accepted', {
      confirmText: limit && accepted >= limit
        ? `${doc || 'The doctor'}'s daily limit of ${limit} patients is already reached for ${a.appointment_date}. Accept anyway?`
        : `Accept ${a.patient_name}'s appointment on ${a.appointment_date}?`,
    });
  };

  // Only one patient per doctor in the chair. Checked locally and again against the database.
  const sendToChair = async (a) => {
    const doc = doctorOf(a);
    if (!doc) { window.alert('Assign a doctor to this appointment first.'); return; }

    const localBusy = appointments.find((x) => x.id !== a.id && doctorOf(x) === doc && x.status === 'In Treatment');
    if (localBusy) { window.alert(`${doc} is already treating ${localBusy.patient_name}. Mark that visit as done first.`); return; }

    setBusyId(a.id);
    const { data } = await supabase.from('appointments').select('id, patient_name')
      .eq('assigned_dentist', doc).eq('status', 'In Treatment').neq('id', a.id).limit(1);
    setBusyId(null);
    if (data && data.length > 0) {
      window.alert(`${doc} is already treating ${data[0].patient_name}. Mark that visit as done first.`);
      return;
    }
    return run(a, 'In Treatment');
  };

  // A visit can only be completed once the dentist has issued notes / a prescription.
  const markDone = async (a) => {
    setBusyId(a.id);
    const { data, error } = await supabase
      .from('treatment_records').select('id').eq('appointment_id', String(a.id)).limit(1);
    setBusyId(null);
    if (error || !data || data.length === 0) {
      refreshRecords();
      window.alert(`The dentist has not issued treatment notes or a prescription for ${a.patient_name} yet. The visit can be marked as done after they do.`);
      return;
    }
    return run(a, 'Completed', { confirmText: `Mark ${a.patient_name}'s treatment as done?` });
  };

  const actions = (a) => {
    const btn = 'px-2.5 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer disabled:opacity-50';
    const disabled = busyId === a.id;
    switch (a.status) {
      case 'Pending':
        return (
          <>
            <button disabled={disabled} onClick={() => accept(a)} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>Accept</button>
            <button disabled={disabled} onClick={() => run(a, 'Rejected', { confirmText: `Reject ${a.patient_name}'s appointment request?` })} className={`${btn} bg-white border border-red-200 text-red-700 hover:bg-red-50`}>Reject</button>
          </>
        );
      case 'Accepted':
        return <button disabled={disabled} onClick={() => run(a, 'In Queue', { queue: a.queue_number || nextQueueNumber(a) })} className={`${btn} bg-[#e3ede6] text-[#164e43] hover:bg-[#164e43] hover:text-white`}>Check In</button>;
      case 'In Queue': {
        const doc = doctorOf(a);
        const busyWith = doc && appointments.find((x) => x.id !== a.id && doctorOf(x) === doc && x.status === 'In Treatment');
        return busyWith ? (
          <button disabled title={`${doc} is treating ${busyWith.patient_name}`} className={`${btn} bg-gray-100 text-gray-400 cursor-not-allowed`}>Chair occupied</button>
        ) : (
          <button disabled={disabled} onClick={() => sendToChair(a)} className={`${btn} bg-amber-50 text-amber-700 hover:bg-amber-600 hover:text-white`}>Send to Chair</button>
        );
      }
      case 'In Treatment': {
        const hasRecord = !!records[String(a.id)];
        return hasRecord ? (
          <>
            <button onClick={() => setViewing(a)} className={`${btn} bg-white border border-[#d4e2dc] text-[#164e43] hover:bg-[#f5f7f6]`}>View notes</button>
            <button disabled={disabled} onClick={() => markDone(a)} className={`${btn} bg-green-50 text-green-700 hover:bg-green-600 hover:text-white`}>Mark as Done</button>
          </>
        ) : (
          <>
            <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg">Waiting for doctor's notes</span>
            <button disabled title="The dentist must issue treatment notes or a prescription first" className={`${btn} bg-gray-100 text-gray-400 cursor-not-allowed`}>Mark as Done</button>
          </>
        );
      }
      default:
        return a.status === 'Completed' && records[String(a.id)]
          ? <button onClick={() => setViewing(a)} className={`${btn} bg-white border border-[#d4e2dc] text-[#164e43] hover:bg-[#f5f7f6]`}>View notes</button>
          : <span className="text-gray-400 italic text-[11px]">{a.status === 'Rejected' ? 'Rejected' : 'Finished'}</span>;
    }
  };

  const pendingTotal = appointments.filter((a) => a.status === 'Pending').length;

  return (
    <div className="h-full w-full bg-white border border-[#d4e2dc] rounded-2xl p-6 shadow-2xs flex flex-col overflow-hidden">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="font-black text-xl text-[#13241b]">Patient Queue &amp; Check-in</h3>
          <p className="text-xs text-[#607368] mt-1">Each doctor treats one patient at a time. Pick a doctor to see only their patients.</p>
        </div>
        <span className="bg-[#e3ede6] text-[#164e43] text-xs font-bold px-4 py-1.5 rounded-full border border-[#d4e2dc]">
          Showing {visible.length} of {appointments.length}
        </span>
      </div>

      {/* Doctor board: who is in the chair, who is waiting */}
      <div className="flex gap-3 overflow-x-auto pb-3 mb-3">
        <button
          type="button"
          onClick={() => setDoctorFilter('All')}
          className={`shrink-0 text-left rounded-2xl border px-4 py-3 min-w-[150px] cursor-pointer transition ${doctorFilter === 'All' ? 'border-[#164e43] bg-[#e3ede6] ring-2 ring-[#164e43]' : 'border-[#d4e2dc] bg-white hover:bg-[#f8faf9]'}`}
        >
          <div className="text-xs font-black text-[#13241b]">All doctors</div>
          <div className="text-[11px] text-[#607368] mt-1">{doctors.length} doctor{doctors.length === 1 ? '' : 's'}{pendingTotal ? ` · ${pendingTotal} pending` : ''}</div>
        </button>

        {board.map(({ doctor, inChair, waiting, pending }) => (
          <button
            key={doctor.full_name}
            type="button"
            onClick={() => setDoctorFilter(doctor.full_name)}
            className={`shrink-0 text-left rounded-2xl border px-4 py-3 min-w-[230px] cursor-pointer transition ${doctorFilter === doctor.full_name ? 'border-[#164e43] bg-[#e3ede6] ring-2 ring-[#164e43]' : 'border-[#d4e2dc] bg-white hover:bg-[#f8faf9]'}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-black text-[#13241b] truncate">{doctor.full_name}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${inChair ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{inChair ? 'In chair' : 'Free'}</span>
            </div>
            <div className="text-[11px] text-[#607368] mt-1 truncate">
              {inChair ? `Now: ${inChair.patient_name}` : 'No patient in the chair'}
            </div>
            <div className="text-[11px] text-[#607368]">
              {waiting.length} waiting{waiting[0] ? ` · next #${waiting[0].queue_number || '-'} ${waiting[0].patient_name}` : ''}{pending ? ` · ${pending} pending` : ''}
            </div>
          </button>
        ))}

        {hasUnassigned && (
          <button
            type="button"
            onClick={() => setDoctorFilter(UNASSIGNED)}
            className={`shrink-0 text-left rounded-2xl border px-4 py-3 min-w-[150px] cursor-pointer transition ${doctorFilter === UNASSIGNED ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-500' : 'border-amber-200 bg-amber-50/50 hover:bg-amber-50'}`}
          >
            <div className="text-xs font-black text-amber-800">No doctor assigned</div>
            <div className="text-[11px] text-amber-700 mt-1">Assign a doctor to continue</div>
          </button>
        )}
      </div>

      <div className="flex gap-2 flex-wrap mb-3">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold border cursor-pointer ${filter === f ? 'bg-[#164e43] text-white border-[#164e43]' : 'bg-white text-[#40584f] border-[#d4e2dc]'}`}
          >
            {f}{f === 'Pending' && pendingTotal ? ` (${pendingTotal})` : ''}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#d4e2dc] text-[11px] font-bold text-[#607368] uppercase">
              <th className="py-3 px-3">Queue #</th>
              <th className="py-3 px-3">Patient Name</th>
              <th className="py-3 px-3">Doctor</th>
              <th className="py-3 px-3">Requested Service</th>
              <th className="py-3 px-3">Date &amp; Time</th>
              <th className="py-3 px-3">Status</th>
              <th className="py-3 px-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f5f2] text-xs">
            {visible.map((a) => {
              const doc = doctorOf(a);
              const open = !['Completed', 'Rejected'].includes(a.status);
              return (
                <tr key={a.id} className="hover:bg-[#f8faf9]">
                  <td className="py-3 px-3 font-black text-[#164e43] text-sm">{a.queue_number ? `#${a.queue_number}` : '--'}</td>
                  <td className="py-3 px-3">
                    <div className="font-bold text-[#13241b]">{a.patient_name}</div>
                    <div className="text-[#607368]">{a.contact_number || a.mobile_number || 'N/A'}</div>
                  </td>
                  <td className="py-3 px-3">
                    {doc ? (
                      <span className="font-semibold text-[#164e43]">{doc}</span>
                    ) : open ? (
                      <select defaultValue="" onChange={(e) => assignDoctor(a, e.target.value)} className="border border-amber-300 bg-amber-50 text-amber-800 rounded-lg px-2 py-1 text-[11px] font-bold cursor-pointer">
                        <option value="">Assign doctor…</option>
                        {doctors.map((d) => <option key={d.full_name} value={d.full_name}>{d.full_name}</option>)}
                      </select>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="py-3 px-3 font-semibold text-[#13241b]">{a.service_name}</td>
                  <td className="py-3 px-3 text-[#607368]">{a.appointment_date} @ {formatTime(a.appointment_time)}</td>
                  <td className="py-3 px-3">
                    <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${STATUS_STYLE[a.status] || 'bg-gray-100 text-gray-700'}`}>{a.status}</span>
                  </td>
                  <td className="py-3 px-3 text-right space-x-1.5 whitespace-nowrap">{actions(a)}</td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr><td colSpan="7" className="py-8 text-center text-gray-400 font-medium">No appointments in this list.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {viewing && (
        <TreatmentRecordModal
          appointment={viewing}
          record={records[String(viewing.id)]}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}
