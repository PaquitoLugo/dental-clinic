import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { dialog } from '../components/DialogHost';
import TreatmentRecordModal from '../components/TreatmentRecordModal';
import useTreatmentRecords from '../lib/useTreatmentRecords';
import usePatientContacts from '../data/usePatientContacts';
import { isAccountActive } from '../data/useSessionGuard';
import { recordActivity } from '../lib/activityLog';
import useAttendance from '../lib/useAttendance';
import { formatClockTime, localDateKey } from '../lib/dateUtils';
import SelfProfile from '../components/SelfProfile';

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
  Cancelled: 'bg-gray-200 text-gray-700',
};

const FILTERS = ['Active', 'Pending', 'Accepted', 'In Queue', 'In Treatment', 'Completed', 'Rejected', 'All'];
const COUNTS_TOWARD_CAPACITY = ['Accepted', 'In Queue', 'In Treatment', 'Completed'];
const NO_SHOW_GRACE_MINUTES = 2 * 60;
const ARCHIVED_APPOINTMENT_REASONS = ['Non-appearance', 'Expired / unfinished'];
const INITIAL_ARCHIVE_CLOCK = Date.now();
const UNASSIGNED = '__unassigned__';
const ASSISTANT_WORKING_HOURS = { timeIn: '08:00', timeOut: '17:00' };
const timeToMinutes = (time = '') => {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};

const formatTime = (t) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || '');
  if (!m) return t || '';
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
};

export default function AssistantModule({ appointments = [], updateAppointmentStatus, refreshData, dentists = [], currentView = 'queue', onViewChange, user, onProfileUpdated }) {
  const [filter, setFilter] = useState('Active');
  const [doctorFilter, setDoctorFilter] = useState('All');
  const [busyId, setBusyId] = useState(null);
  const [overrides, setOverrides] = useState({}); // doctor assigned here before the shared list refreshes
  const [fetchedDentists, setFetchedDentists] = useState([]);
  const [dentistLimits, setDentistLimits] = useState({});
  const { records, refresh: refreshRecords } = useTreatmentRecords();
  const { contactFor, isArchivedPatient } = usePatientContacts();
  const [viewing, setViewing] = useState(null);
  const [archiveGraceClock, setArchiveGraceClock] = useState(INITIAL_ARCHIVE_CLOCK);
  const autoArchiveRunning = useRef(false);
  const currentUser = useRef(user);
  const refreshDataRef = useRef(refreshData);
  useEffect(() => {
    currentUser.current = user;
    refreshDataRef.current = refreshData;
  }, [user, refreshData]);
  const {
    record: attendanceRecord,
    loading: attendanceLoading,
    saving: attendanceSaving,
    message: attendanceMessage,
    clockIn,
    clockOut,
    cancelClockIn,
    cancelClockOut,
    checkPendingPatients,
  } = useAttendance(user, ASSISTANT_WORKING_HOURS);
  const attendanceLog = {
    timeIn: formatClockTime(attendanceRecord?.clock_in),
    timeOut: formatClockTime(attendanceRecord?.clock_out),
  };
  const todayKey = localDateKey();
  const currentMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const isArchiveView = currentView === 'archive';
  useEffect(() => {
    const intervalId = window.setInterval(() => setArchiveGraceClock(Date.now()), 1_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const archiveMissedAppointments = async () => {
      if (autoArchiveRunning.current) return;
      autoArchiveRunning.current = true;
      try {
        const { data, error } = await supabase.from('appointments')
          .select('id, patient_name, appointment_date, appointment_time, status')
          .in('status', ['Pending', 'Accepted', 'In Queue'])
          .is('no_show_restored_at', null)
          .lte('appointment_date', localDateKey());
        if (error) throw error;

        let archivedAny = false;
        const nowDate = localDateKey();
        const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
        for (const appointment of data || []) {
          const expired = appointment.appointment_date < nowDate ||
            (appointment.appointment_date === nowDate &&
              timeToMinutes(appointment.appointment_time) + NO_SHOW_GRACE_MINUTES <= nowMinutes);
          if (!expired) continue;

          const archivedAt = new Date().toISOString();
          const archiveReason = appointment.status === 'In Queue' ? 'Expired / unfinished' : 'Non-appearance';
          const { data: archived, error: archiveError } = await supabase.from('appointments')
            .update({
              status: 'Cancelled',
              cancellation_reason: archiveReason,
              cancelled_at: archivedAt,
              archived_from_status: appointment.status,
            })
            .eq('id', appointment.id)
            .eq('status', appointment.status)
            .select('id')
            .maybeSingle();
          if (archiveError) throw archiveError;
          if (!archived) continue;

          archivedAny = true;
          await recordActivity(currentUser.current, {
            action: `Archived expired appointment for ${appointment.patient_name}`,
            entityType: 'appointment',
            entityId: appointment.id,
            details: {
              previous_status: appointment.status,
              status: 'Cancelled',
              appointment_date: appointment.appointment_date,
              appointment_time: appointment.appointment_time,
              cancellation_reason: archiveReason,
            },
          });
        }
        if (archivedAny) await refreshDataRef.current();
      } catch (error) {
        console.error('Could not automatically archive missed appointments:', error);
      } finally {
        autoArchiveRunning.current = false;
      }
    };

    archiveMissedAppointments();
    const intervalId = window.setInterval(archiveMissedAppointments, 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const requireActiveAccount = async () => {
    if (await isAccountActive(user?.id)) return true;
    await dialog.alert('Your account has been archived, so this action is not allowed.', { title: 'Account archived', variant: 'error' });
    return false;
  };

  const handleClockIn = async () => {
    if (!(await requireActiveAccount())) return;
    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
    if (nowMinutes < timeToMinutes(ASSISTANT_WORKING_HOURS.timeIn) || nowMinutes >= timeToMinutes(ASSISTANT_WORKING_HOURS.timeOut)) {
      await dialog.alert(`Time-in is only allowed during working hours (${ASSISTANT_WORKING_HOURS.timeIn}–${ASSISTANT_WORKING_HOURS.timeOut}).`, {
        title: 'Outside working hours',
        variant: 'warning',
      });
      return;
    }
    await clockIn();
  };

  const handleClockOut = async () => {
    if (!(await requireActiveAccount())) return;
    const pendingPatientMessage = await checkPendingPatients();
    if (pendingPatientMessage) {
      await dialog.alert(pendingPatientMessage, { title: 'Patients still in progress', variant: 'warning' });
      return;
    }
    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
    if (nowMinutes < timeToMinutes(ASSISTANT_WORKING_HOURS.timeIn) || nowMinutes >= timeToMinutes(ASSISTANT_WORKING_HOURS.timeOut)) {
      await dialog.alert(`Time-out is only allowed during working hours (${ASSISTANT_WORKING_HOURS.timeIn}–${ASSISTANT_WORKING_HOURS.timeOut}).`, {
        title: 'Outside working hours',
        variant: 'warning',
      });
      return;
    }
    if (!(await dialog.confirm('Are you sure you want to record your time-out?', { title: 'Confirm time-out', confirmText: 'Time-Out' }))) return;
    await clockOut();
  };

  const handleCancelClockIn = async () => {
    if (!(await requireActiveAccount())) return;
    if (!(await dialog.confirm('Cancel your time-in for today?', { title: 'Cancel time-in', confirmText: 'Cancel Time-In' }))) return;
    await cancelClockIn();
  };

  const handleCancelClockOut = async () => {
    if (!(await requireActiveAccount())) return;
    if (!(await dialog.confirm('Cancel your time-out and return to an active shift?', { title: 'Cancel time-out', confirmText: 'Cancel Time-Out' }))) return;
    await cancelClockOut();
  };

  // Doctors come from the shared context; fall back to a direct query if it has none
  useEffect(() => {
    if (dentists.length > 0) return;
    supabase.from('staff_users').select('id, full_name, max_daily_patients').eq('role', 'dentist').is('archived_at', null)
      .then(({ data, error }) => {
        if (error) {
          console.error('Could not load dentist capacity settings:', error.message);
          return;
        }
        const rows = data || [];
        setFetchedDentists(rows);
        setDentistLimits(Object.fromEntries(rows.map((dentist) => [dentist.full_name, Number(dentist.max_daily_patients) || null])));
      });
  }, [dentists.length]);

  useEffect(() => {
    if (!dentists.length) return;
    let active = true;
    supabase.from('staff_users').select('full_name, max_daily_patients').eq('role', 'dentist').is('archived_at', null)
      .then(({ data, error }) => {
        if (error) {
          console.error('Could not load dentist capacity settings:', error.message);
          return;
        }
        if (active) {
          setDentistLimits(Object.fromEntries((data || []).map((dentist) => [dentist.full_name, Number(dentist.max_daily_patients) || null])));
        }
      });
    return () => { active = false; };
  }, [dentists.length]);

  const doctorOf = (a) => overrides[a.id] ?? a.assigned_dentist ?? '';

  const doctors = useMemo(() => {
    const base = (dentists.length ? dentists : fetchedDentists).filter((d) => d.full_name);
    const known = new Set(base.map((d) => d.full_name));
    const extra = [...new Set(appointments.map((a) => a.assigned_dentist).filter(Boolean))]
      .filter((n) => !known.has(n)).map((n) => ({ id: null, full_name: n }));
    return [...base, ...extra];
  }, [dentists, fetchedDentists, appointments]);

  const hasUnassigned = appointments.some((a) => !doctorOf(a) && !['Completed', 'Rejected', 'Cancelled'].includes(a.status));

  // Who is in the chair / waiting, per doctor
  const board = doctors.map((d) => {
    const mine = appointments.filter((a) => doctorOf(a) === d.full_name && a.appointment_date === todayKey);
    const inChair = mine.find((a) => a.status === 'In Treatment') || null;
    const waiting = mine
      .filter((a) => a.status === 'In Queue')
      // earliest appointment date first, then queue number (a patient booked for a later day never jumps the line)
      .sort((a, b) => String(a.appointment_date).localeCompare(String(b.appointment_date)) || (Number(a.queue_number) || 0) - (Number(b.queue_number) || 0));
    return { doctor: d, inChair, waiting, pending: mine.filter((a) => a.status === 'Pending').length };
  });

  const visible = appointments
    .filter((a) => {
      if (isArchiveView) return a.status === 'Cancelled' && ARCHIVED_APPOINTMENT_REASONS.includes(a.cancellation_reason);
      if (doctorFilter === UNASSIGNED && doctorOf(a)) return false;
      if (doctorFilter !== 'All' && doctorFilter !== UNASSIGNED && doctorOf(a) !== doctorFilter) return false;
      if (filter === 'All') return true;
      if (filter === 'Active') return !['Completed', 'Rejected', 'Cancelled'].includes(a.status);
      return a.status === filter;
    })
    .sort((a, b) => `${a.appointment_date} ${a.appointment_time}`.localeCompare(`${b.appointment_date} ${b.appointment_time}`));

  // Queue numbers run 1, 2, 3... per doctor per day
  const nextQueueNumber = (a) =>
    Math.max(0, ...appointments
      .filter((x) => x.appointment_date === a.appointment_date && doctorOf(x) === doctorOf(a))
      .map((x) => Number(x.queue_number) || 0)) + 1;

  const dailyLimitFor = (doctorName) => {
    return dentistLimits[doctorName] || null;
  };

  const missedAppointment = (a) => a.appointment_date < todayKey ||
    (a.appointment_date === todayKey &&
      timeToMinutes(a.appointment_time) + NO_SHOW_GRACE_MINUTES <= currentMinutes);

  const run = async (a, status, { confirmText, queue, extra = {} } = {}) => {
    if (['In Queue', 'In Treatment'].includes(status) && a.appointment_date !== todayKey) {
      await dialog.alert('Appointments can only be checked in and moved to treatment on their scheduled date.', { title: 'Wrong appointment date', variant: 'warning' });
      return;
    }
    if (status === 'Cancelled' && extra.cancellation_reason === 'Non-appearance' && !missedAppointment(a)) {
      await dialog.alert('An appointment can only be archived as a non-appearance two hours after its scheduled time.', { title: 'Appointment not missed', variant: 'warning' });
      return;
    }
    if (confirmText && !(await dialog.confirm(confirmText, { title: 'Please confirm', confirmText: 'Yes, continue' }))) return;
    setBusyId(a.id);
    try {
      const updated = await updateAppointmentStatus(a.id, status, queue ?? a.queue_number, extra);
      if (updated !== false) await recordActivity(user, {
        action: `${status} appointment for ${a.patient_name}`,
        entityType: 'appointment', entityId: a.id,
        details: { previous_status: a.status, status, appointment_date: a.appointment_date, ...extra }
      });
    } finally {
      setBusyId(null);
    }
  };

  const restoreNoShow = async (appointment) => {
    const restoreCutoff = new Date(archiveGraceClock - NO_SHOW_GRACE_MINUTES * 60_000).toISOString();
    if (!appointment.cancelled_at || new Date(appointment.cancelled_at).getTime() < archiveGraceClock - NO_SHOW_GRACE_MINUTES * 60_000) {
      await dialog.alert('The 2-hour restore window for this archived appointment has ended.', { title: 'Restore window ended', variant: 'warning' });
      return;
    }
    if (!(await requireActiveAccount())) return;
    if (!(await dialog.confirm(`Restore ${appointment.patient_name}'s appointment to the queue?`, {
      title: 'Restore appointment',
      confirmText: 'Restore',
    }))) return;

    setBusyId(appointment.id);
    try {
      const restoredStatus = appointment.cancellation_reason === 'Expired / unfinished'
        ? 'Accepted'
        : appointment.archived_from_status || 'Accepted';
      const { data, error } = await supabase.from('appointments')
        .update({
          status: restoredStatus,
          cancellation_reason: null,
          cancelled_at: null,
          archived_from_status: null,
          no_show_restored_at: new Date(archiveGraceClock).toISOString(),
        })
        .eq('id', appointment.id)
        .eq('status', 'Cancelled')
        .in('cancellation_reason', ARCHIVED_APPOINTMENT_REASONS)
        .gte('cancelled_at', restoreCutoff)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('This appointment is no longer archived. Refresh the list and try again.');

      await recordActivity(user, {
        action: `Restored archived appointment for ${appointment.patient_name}`,
        entityType: 'appointment',
        entityId: appointment.id,
        details: {
          previous_status: 'Cancelled',
          status: restoredStatus,
          appointment_date: appointment.appointment_date,
          appointment_time: appointment.appointment_time,
        },
      });
      await refreshData();
    } catch (error) {
      await dialog.alert(`Could not restore the appointment: ${error.message}`, { title: 'Restore failed', variant: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const assignDoctor = async (a, name) => {
    if (!name) return;
    const { error } = await supabase.from('appointments').update({ assigned_dentist: name }).eq('id', a.id);
    if (error) { await dialog.alert(`Could not assign the doctor: ${error.message}`, { title: 'Not assigned', variant: 'error' }); return; }
    await recordActivity(user, {
      action: `Assigned ${name} to ${a.patient_name}'s appointment`,
      entityType: 'appointment', entityId: a.id,
      details: { assigned_dentist: name }
    });
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
    if (a.appointment_date !== todayKey) {
      await dialog.alert('Appointments can only be checked in and moved to treatment on their scheduled date.', { title: 'Wrong appointment date', variant: 'warning' });
      return;
    }
    const doc = doctorOf(a);
    if (!doc) { await dialog.alert('Assign a doctor to this appointment first.', { title: 'No doctor assigned', variant: 'warning' }); return; }

    const localBusy = appointments.find((x) => x.id !== a.id && x.appointment_date === todayKey && doctorOf(x) === doc && x.status === 'In Treatment');
    if (localBusy) { await dialog.alert(`${doc} is already treating ${localBusy.patient_name}. Mark that visit as done first.`, { title: 'Chair occupied', variant: 'warning' }); return; }

    setBusyId(a.id);
    const { data } = await supabase.from('appointments').select('id, patient_name')
      .eq('assigned_dentist', doc).eq('appointment_date', todayKey).eq('status', 'In Treatment').neq('id', a.id).limit(1);
    setBusyId(null);
    if (data && data.length > 0) {
      await dialog.alert(`${doc} is already treating ${data[0].patient_name}. Mark that visit as done first.`, { title: 'Chair occupied', variant: 'warning' });
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
      await dialog.alert(`The dentist has not issued treatment notes or a prescription for ${a.patient_name} yet. The visit can be marked as done after they do.`, { title: 'Doctor\'s notes required', variant: 'warning' });
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
        return (
          <>
            <button
              disabled={disabled || a.appointment_date !== todayKey}
              title={a.appointment_date !== todayKey ? 'Check-in is only available on the scheduled date.' : ''}
              onClick={() => run(a, 'In Queue', { queue: a.queue_number || nextQueueNumber(a) })}
              className={`${btn} bg-[#e3ede6] text-[#164e43] hover:bg-[#164e43] hover:text-white`}
            >
              Check In
            </button>
            {missedAppointment(a) && (
              <button
                disabled={disabled}
                onClick={() => run(a, 'Cancelled', {
                  confirmText: `Archive ${a.patient_name}'s missed appointment as a non-appearance?`,
                  extra: {
                    cancellation_reason: 'Non-appearance',
                    cancelled_at: new Date().toISOString(),
                    archived_from_status: a.status,
                  },
                })}
                className={`${btn} bg-white border border-red-200 text-red-700 hover:bg-red-50`}
              >
                No-show / Archive
              </button>
            )}
          </>
        );
      case 'In Queue': {
        const doc = doctorOf(a);
        const busyWith = doc && appointments.find((x) => x.id !== a.id && x.appointment_date === todayKey && doctorOf(x) === doc && x.status === 'In Treatment');
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
          : <span className="text-gray-400 italic text-[11px]">{a.status === 'Cancelled' ? 'Archived' : a.status === 'Rejected' ? 'Rejected' : 'Finished'}</span>;
    }
  };

  const pendingTotal = appointments.filter((a) => a.status === 'Pending').length;
  const todayAppointments = appointments.filter((a) =>
    a.appointment_date === todayKey && !['Rejected', 'Cancelled'].includes(a.status)
  );
  const currentPatients = appointments.filter((a) => a.appointment_date === todayKey && a.status === 'In Treatment');
  const todayQueue = appointments
    .filter((a) => a.appointment_date === todayKey && a.status === 'In Queue')
    .sort((a, b) => (Number(a.queue_number) || Number.MAX_SAFE_INTEGER) - (Number(b.queue_number) || Number.MAX_SAFE_INTEGER) ||
      String(a.appointment_time).localeCompare(String(b.appointment_time)));
  const nextSessionDate = appointments
    .filter((a) => a.appointment_date > todayKey && ['Accepted', 'In Queue', 'In Treatment'].includes(a.status))
    .map((a) => a.appointment_date)
    .sort()[0];
  const nextSessionCount = nextSessionDate
    ? appointments.filter((a) => a.appointment_date === nextSessionDate && ['Accepted', 'In Queue', 'In Treatment'].includes(a.status)).length
    : 0;
  const noShowArchiveCount = appointments.filter((a) =>
    a.status === 'Cancelled' && a.cancellation_reason === 'Non-appearance'
  ).length;
  const archivedAppointmentCount = appointments.filter((a) =>
    a.status === 'Cancelled' && ARCHIVED_APPOINTMENT_REASONS.includes(a.cancellation_reason)
  ).length;

  return (
    <div className="h-full w-full">
      {currentView === 'profile' ? (
        <SelfProfile user={user} role="assistant" onSaved={onProfileUpdated} />
      ) : (
      <div className="h-full w-full bg-white border border-[#d4e2dc] rounded-2xl p-6 shadow-2xs flex flex-col overflow-hidden">
      {!isArchiveView && <section className="mb-4 space-y-3">
        <div>
          <h2 className="font-black text-xl text-[#13241b]">Assistant Dashboard</h2>
          <p className="text-xs text-[#607368]">Today’s patient flow and upcoming appointments · {todayKey}</p>
        </div>
        {onViewChange && (
          <button type="button" onClick={() => onViewChange('archive')} className="rounded-xl border border-[#d4e2dc] bg-white px-4 py-2 text-xs font-bold text-[#164e43] hover:bg-[#f5f7f6]">
            🗄️ Appointment Archive ({archivedAppointmentCount})
          </button>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-2">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-amber-800">Currently admitted</p>
            <p className="mt-1 truncate text-sm font-black text-[#13241b]" title={currentPatients.map((a) => a.patient_name).join(', ')}>
              {currentPatients.length ? currentPatients.map((a) => a.patient_name).join(', ') : 'None'}
            </p>
            {currentPatients.length > 1 && <p className="text-[10px] text-amber-800">{currentPatients.length} patients in treatment</p>}
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-blue-800">Next patient</p>
            <p className="mt-1 truncate text-sm font-black text-[#13241b]" title={todayQueue[0]?.patient_name || ''}>{todayQueue[0]?.patient_name || 'None waiting'}</p>
            {todayQueue[0] && <p className="text-[10px] text-blue-800">Queue #{todayQueue[0].queue_number || '—'}</p>}
          </div>
          <div className="rounded-xl border border-[#d4e2dc] bg-[#f8faf9] p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#607368]">In queue today</p>
            <p className="mt-1 text-2xl font-black text-[#164e43]">{todayQueue.length}</p>
          </div>
          <div className="rounded-xl border border-[#d4e2dc] bg-[#f8faf9] p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#607368]">Appointments today</p>
            <p className="mt-1 text-2xl font-black text-[#164e43]">{todayAppointments.length}</p>
          </div>
          <div className="rounded-xl border border-[#d4e2dc] bg-[#f8faf9] p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#607368]">Next session</p>
            <p className="mt-1 text-sm font-black text-[#164e43]">{nextSessionDate || 'No future bookings'}</p>
            {nextSessionDate && <p className="text-[10px] text-[#607368]">{nextSessionCount} appointment{nextSessionCount === 1 ? '' : 's'}</p>}
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-red-800">No-show archive</p>
            <p className="mt-1 text-2xl font-black text-red-700">{noShowArchiveCount}</p>
          </div>
        </div>
      </section>}
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <div>
          <h3 className="font-black text-xl text-[#13241b]">{isArchiveView ? 'Appointment Archive' : 'Patient Queue & Check-in'}</h3>
          <p className="text-xs text-[#607368] mt-1">
            {isArchiveView
              ? 'Review no-show and expired appointments. Restoring an expired appointment returns it to Accepted.'
              : 'Each doctor treats one patient at a time. Pick a doctor to see only their patients.'}
          </p>
        </div>
        {!isArchiveView && <div className="flex flex-wrap items-center gap-3">
          <div className="bg-white border border-[#d4e2dc] px-4 py-2 rounded-2xl flex items-center gap-3 shadow-2xs">
            <div>
              <span className="text-[10px] text-[#607368] font-bold uppercase tracking-wider block">Today's Shift</span>
              <span className="text-xs font-bold text-[#13241b]">In: {attendanceLog.timeIn || '—'} | Out: {attendanceLog.timeOut || '—'}</span>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={handleClockIn} disabled={attendanceLoading || attendanceSaving || attendanceLog.timeIn !== null} className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs">Time-In</button>
              <button type="button" onClick={handleClockOut} disabled={attendanceLoading || attendanceSaving || attendanceLog.timeIn === null || attendanceLog.timeOut !== null} className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs">Time-Out</button>
              {attendanceRecord?.clock_out ? (
                <button type="button" onClick={handleCancelClockOut} disabled={attendanceLoading || attendanceSaving} className="border border-amber-300 text-amber-800 hover:bg-amber-50 disabled:opacity-50 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer">Cancel Time-Out</button>
              ) : attendanceRecord?.clock_in ? (
                <button type="button" onClick={handleCancelClockIn} disabled={attendanceLoading || attendanceSaving} className="border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer">Cancel Time-In</button>
              ) : null}
            </div>
          </div>
          <span className="bg-[#e3ede6] text-[#164e43] text-xs font-bold px-4 py-1.5 rounded-full border border-[#d4e2dc]">
            Showing {visible.length} of {appointments.length}
          </span>
        </div>}
      </div>
      {!isArchiveView && attendanceMessage && <p role="alert" className="mb-3 text-xs font-semibold text-red-700">{attendanceMessage}</p>}

      {/* Doctor board: who is in the chair, who is waiting */}
      {!isArchiveView && <div className="flex gap-3 overflow-x-auto pb-3 mb-3">
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
      </div>}

      {!isArchiveView && <div className="flex gap-2 flex-wrap mb-3">
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
      </div>}

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
              <th className="py-3 px-3 text-right">{isArchiveView ? 'Archive Action' : 'Action'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f5f2] text-xs">
            {visible.map((a) => {
              const doc = doctorOf(a);
              const open = !['Completed', 'Rejected', 'Cancelled'].includes(a.status);
              const patientArchived = isArchivedPatient(a);
              return (
                <tr key={a.id} className={patientArchived ? 'bg-gray-100 text-gray-500' : 'hover:bg-[#f8faf9]'}>
                  <td className="py-3 px-3 font-black text-[#164e43] text-sm">{a.queue_number ? `#${a.queue_number}` : '--'}</td>
                  <td className="py-3 px-3">
                    <div className={`font-bold ${patientArchived ? 'text-gray-500' : 'text-[#13241b]'}`}>{a.patient_name}</div>
                    {patientArchived && <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Archived by admin · unavailable</span>}
                    <div className="text-[#607368]">{contactFor(a) || 'N/A'}</div>
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
                    {a.status === 'Cancelled' && a.cancellation_reason && <div className="mt-1 text-[10px] text-[#607368]">Reason: {a.cancellation_reason}</div>}
                  </td>
                  <td className="py-3 px-3 text-right space-x-1.5 whitespace-nowrap">
                    {patientArchived
                      ? <span className="text-[10px] font-semibold text-gray-500">Unavailable</span>
                      : isArchiveView ? (() => {
                      const restoreDeadline = a.cancelled_at
                        ? new Date(a.cancelled_at).getTime() + NO_SHOW_GRACE_MINUTES * 60_000
                        : 0;
                      const canRestore = restoreDeadline >= archiveGraceClock;
                      return canRestore
                        ? <button type="button" disabled={busyId === a.id} onClick={() => restoreNoShow(a)} className="px-2.5 py-1 rounded-lg font-bold text-[11px] bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white disabled:opacity-50">Restore</button>
                        : <span className="text-[10px] font-semibold text-gray-400">Restore period ended</span>;
                    })() : actions(a)}
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr><td colSpan="7" className="py-8 text-center text-gray-400 font-medium">{isArchiveView ? 'No no-show appointments are archived.' : 'No appointments in this list.'}</td></tr>
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
      )}
    </div>
  );
}
