import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { dialog } from '../components/DialogHost';
import SelfProfile from '../components/SelfProfile';
import ToothChart from '../components/ToothChart';
import TreatmentRecordModal from '../components/TreatmentRecordModal';
import useTreatmentRecords from '../lib/useTreatmentRecords';
import usePatientContacts from '../data/usePatientContacts';
import { belongsToPatient } from '../data/patientMatch';
import { isAccountActive } from '../data/useSessionGuard';
import { recordActivity } from '../lib/activityLog';
import useAttendance from '../lib/useAttendance';
import { formatClockTime, localDateKey } from '../lib/dateUtils';
import { deactivateDentistAvailability, fetchDentistAvailability, saveDentistAvailability } from '../lib/dentistAvailability';

// "23:38:00" / "13:00" -> "11:38 PM" / "1:00 PM"
const formatApptTime = (t) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || '');
  if (!m) return t || '';
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
};
import { EMPTY_ADDRESS, buildCompleteAddress } from '../lib/phAddress';

const TODAY = new Date();
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function DentistModule({ 
  appointments, 
  services, 
  updateAppointmentStatus, 
  user, 
  currentView,
  onViewChange
}) {
  // Patient Logs Filter & Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterService, setFilterService] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterDate, setFilterDate] = useState('');

  // Profile Form State
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [sex, setSex] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [birthDay, setBirthDay] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [address, setAddress] = useState(EMPTY_ADDRESS);
  const [completeAddress, setCompleteAddress] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');

  // Treatment notes / prescriptions the dentist issues before the assistant can mark a visit as done
  const { records: treatmentRecords, refresh: refreshRecords } = useTreatmentRecords();
  const [recordTarget, setRecordTarget] = useState(null);
  const { contactFor, isArchivedPatient } = usePatientContacts();

  // Tooth chart: which patient the dentist is charting
  const [chartPatients, setChartPatients] = useState([]);
  const [chartPatientId, setChartPatientId] = useState('');
  const [chartPatientSearch, setChartPatientSearch] = useState('');
  const dentistName = `${firstName} ${middleName ? middleName + ' ' : ''}${lastName}`.trim();
  const scheduleDentistName = user?.name || dentistName;

  // Daily Capacity & Scheduler State
  const [maxDailyPatients, setMaxDailyPatients] = useState(10);
  const [limitSavedMsg, setLimitSavedMsg] = useState('');
  const [limitSaveError, setLimitSaveError] = useState(false);

  // Interactive Calendar & Availability State
  const [calendarYear, setCalendarYear] = useState(TODAY.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(TODAY.getMonth()); // 0 - 11
  const [selectedDateKey, setSelectedDateKey] = useState(localDateKey());
  const [timeInInput, setTimeInInput] = useState('08:00');
  const [timeOutInput, setTimeOutInput] = useState('17:00');
  
  const [availabilityMap, setAvailabilityMap] = useState({});
  const [attendanceByDate, setAttendanceByDate] = useState({});
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  const [availabilityError, setAvailabilityError] = useState('');
  const [scheduleMsg, setScheduleMsg] = useState('');

  // Time-in / Time-out daily attendance record
  const {
    record: attendanceRecord,
    loading: attendanceLoading,
    saving: attendanceSaving,
    message: attendanceMessage,
    clockIn,
    clockOut,
    cancelClockIn,
    cancelClockOut,
    checkClockedIn,
    checkPendingPatients,
    checkCompletedAppointments,
  } = useAttendance(user, {
    timeIn: availabilityMap[localDateKey()]?.timeIn || '08:00',
    timeOut: availabilityMap[localDateKey()]?.timeOut || '17:00',
  });
  const attendanceLog = {
    timeIn: formatClockTime(attendanceRecord?.clock_in),
    timeOut: formatClockTime(attendanceRecord?.clock_out),
  };
  const dentistOnShift = Boolean(attendanceRecord?.clock_in && !attendanceRecord?.clock_out);

  // Archived accounts can't change their schedule or clock in/out (the session guard also signs them out)
  const requireActiveAccount = async () => {
    if (await isAccountActive(user?.id)) return true;
    await dialog.alert('Your account has been archived, so this action is not allowed.', { title: 'Account archived', variant: 'error' });
    return false;
  };

  const requireOnShift = async () => {
    if (!(await requireActiveAccount())) return false;
    const attendanceIssue = await checkClockedIn();
    if (attendanceIssue) {
      await dialog.alert(attendanceIssue, {
        title: attendanceIssue.startsWith('Attendance verification failed') ? 'Attendance unavailable' : 'Time-in required',
        variant: 'warning',
      });
      return false;
    }
    return true;
  };

  const verifyOnShift = async () => checkClockedIn();

  const handleSaveLimit = async (e) => {
    e.preventDefault();
    if (!(await requireOnShift())) return;
    setLimitSaveError(false);
    const limit = Number(maxDailyPatients);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      setLimitSavedMsg('Daily patient limit must be a whole number from 1 to 50.');
      setLimitSaveError(true);
      return;
    }
    const { error } = await supabase.from('staff_users')
      .update({ max_daily_patients: limit })
      .eq('id', user.id);
    if (error) {
      setLimitSavedMsg(`Could not save daily patient limit: ${error.message}`);
      setLimitSaveError(true);
      return;
    }
    setMaxDailyPatients(String(limit));
    await recordActivity(user, { action: `Updated daily patient limit to ${maxDailyPatients}`, entityType: 'dentist_settings', entityId: user?.id });
    setLimitSavedMsg('Daily patient capacity limit updated successfully!');
    setTimeout(() => setLimitSavedMsg(''), 4000);
  };

  // Save availability for a specific selected date
  const handleSaveSingleDayAvailability = async (e) => {
    e.preventDefault();
    if (!(await requireOnShift())) return;
    if (!selectedDateKey || !scheduleDentistName) return;
    if (selectedDateKey < localDateKey()) {
      setScheduleMsg('Past dates are view-only. You can review your attendance, but cannot change availability.');
      return;
    }

    const updated = {
      ...availabilityMap,
      [selectedDateKey]: { timeIn: timeInInput, timeOut: timeOutInput, active: true }
    };
    try {
      await saveDentistAvailability(scheduleDentistName, selectedDateKey, updated[selectedDateKey]);
      setAvailabilityMap(updated);
    } catch (error) {
      setScheduleMsg(`Could not save availability: ${error.message}`);
      return;
    }
    const logged = await recordActivity(user, {
      action: `Updated availability for ${selectedDateKey}`,
      entityType: 'availability', entityId: selectedDateKey,
      details: { time_in: timeInInput, time_out: timeOutInput }
    });
    setScheduleMsg(logged
      ? `Availability saved for ${selectedDateKey} (${timeInInput} - ${timeOutInput})!`
      : `Availability was saved for ${selectedDateKey}, but its activity log could not be recorded. Apply the pending Supabase migrations.`);
    setTimeout(() => setScheduleMsg(''), 4000);
  };

  // Apply availability to all matching weekdays of the current month
  const handleApplyToAllWeekdayInMonth = async (targetDayOfWeek) => {
    if (!(await requireOnShift())) return;
    if (!scheduleDentistName) return;
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const updated = { ...availabilityMap };
    let count = 0;
    const today = localDateKey();

    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(calendarYear, calendarMonth, d);
      if (dt.getDay() === targetDayOfWeek) {
        const yyyy = dt.getFullYear();
        const mm = String(dt.getMonth() + 1).padStart(2, '0');
        const dd = String(dt.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;

        if (dateStr < today) continue;
        updated[dateStr] = { timeIn: timeInInput, timeOut: timeOutInput, active: true };
        count++;
      }
    }
    if (!count) {
      setScheduleMsg('There are no current or future dates for this weekday in the selected month.');
      return;
    }

    try {
      await Promise.all(Object.entries(updated)
        .filter(([date]) => date.startsWith(`${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-`)
          && date >= today
          && new Date(`${date}T00:00:00`).getDay() === targetDayOfWeek)
        .map(([date, schedule]) => saveDentistAvailability(scheduleDentistName, date, schedule)));
      setAvailabilityMap(updated);
    } catch (error) {
      setScheduleMsg(`Could not save all availability dates: ${error.message}`);
      return;
    }
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const logged = await recordActivity(user, {
      action: `Applied availability to ${dayNames[targetDayOfWeek]}s in ${MONTHS[calendarMonth]}`,
      entityType: 'availability',
      details: { time_in: timeInInput, time_out: timeOutInput, dates_updated: count }
    });
    setScheduleMsg(logged
      ? `Applied ${timeInInput} - ${timeOutInput} to all ${dayNames[targetDayOfWeek]}s in ${MONTHS[calendarMonth]} (${count} days updated)!`
      : `Availability was updated, but its activity log could not be recorded. Apply the pending Supabase migrations.`);
    setTimeout(() => setScheduleMsg(''), 4000);
  };

  const handleRemoveAvailability = async (dateStr) => {
    if (!(await requireOnShift())) return;
    if (!scheduleDentistName) return;
    if (dateStr < localDateKey()) {
      setScheduleMsg('Past dates are view-only. You can review your attendance, but cannot change availability.');
      return;
    }
    const updated = { ...availabilityMap };
    delete updated[dateStr];
    try {
      await deactivateDentistAvailability(scheduleDentistName, dateStr);
      setAvailabilityMap(updated);
      const logged = await recordActivity(user, { action: `Removed availability for ${dateStr}`, entityType: 'availability', entityId: dateStr });
      setScheduleMsg(logged
        ? `Availability removed for ${dateStr}.`
        : `Availability was removed for ${dateStr}, but its activity log could not be recorded. Apply the pending Supabase migrations.`);
    } catch (error) {
      setScheduleMsg(`Could not remove availability: ${error.message}`);
    }
  };

  const handleClockIn = async () => {
    if (!(await requireActiveAccount())) return;
    if (!scheduleDentistName || availabilityError) {
      await dialog.alert(
        availabilityError || 'Could not identify your dentist account to verify working hours.',
        { title: 'Schedule unavailable', variant: 'error' },
      );
      return;
    }
    const today = localDateKey();
    const todayAvailability = availabilityMap[today];
    if (!todayAvailability?.active) {
      const confirmed = await dialog.confirm(
        'Today is not one of your scheduled availability dates. Are you sure you want to time in and mark yourself available for today?',
        { title: 'Unscheduled availability', confirmText: 'Yes, Time In', cancelText: 'No' },
      );
      if (!confirmed) return;
    }

    const didClockIn = await clockIn();
    if (!didClockIn) return;

    const updated = {
      ...availabilityMap,
      [today]: {
        timeIn: todayAvailability?.timeIn || timeInInput,
        timeOut: todayAvailability?.timeOut || timeOutInput,
        active: true,
      },
    };

    try {
      await saveDentistAvailability(scheduleDentistName, today, updated[today]);
      setAvailabilityMap(updated);
      setScheduleMsg(`Today's schedule (${today}) is now marked Available.`);
    } catch (error) {
      await dialog.alert(
        `You have timed in, but today's schedule could not be marked Available: ${error.message}`,
        { title: 'Schedule update failed', variant: 'error' },
      );
    }
  };

  const handleClockOut = async () => {
    if (!(await requireActiveAccount())) return;
    const pendingPatientMessage = await checkPendingPatients();
    if (pendingPatientMessage) {
      await dialog.alert(pendingPatientMessage, { title: 'Patients still in progress', variant: 'warning' });
      return;
    }
    if (!(await dialog.confirm('Are you sure you want to record your time-out?', { title: 'Confirm time-out', confirmText: 'Time-Out' }))) return;
    await clockOut();
  };

  const handleCancelClockIn = async () => {
    if (!(await requireActiveAccount())) return;
    const completedAppointmentMessage = await checkCompletedAppointments();
    if (completedAppointmentMessage) {
      await dialog.alert(completedAppointmentMessage, { title: 'Time-in cannot be cancelled', variant: 'warning' });
      return;
    }
    if (!(await dialog.confirm('Cancel your time-in for today?', { title: 'Cancel time-in', confirmText: 'Cancel Time-In' }))) return;
    await cancelClockIn();
  };

  const handleCancelClockOut = async () => {
    if (!(await requireActiveAccount())) return;
    if (!(await dialog.confirm('Cancel your time-out and return to an active shift?', { title: 'Cancel time-out', confirmText: 'Cancel Time-Out' }))) return;
    await cancelClockOut();
  };

  // Fetch practitioner profile and PSGC data from Supabase on mount
  useEffect(() => {
    async function fetchDentistProfile() {
      const targetId = user?.id || 2;
      const { data, error } = await supabase
        .from('staff_users')
        .select('*')
        .eq('id', targetId)
        .single();

      if (data && !error) {
        setMaxDailyPatients(String(Number(data.max_daily_patients) || 10));
        setFirstName(data.first_name || (data.full_name ? data.full_name.split(' ')[0] : ''));
        setLastName(data.last_name || (data.full_name ? data.full_name.split(' ').slice(1).join(' ') : ''));
        setMiddleName(data.middle_name || '');
        setUsername(data.username || '');
        setEmail(data.email || '');
        setMobileNumber(data.mobile_number || '');
        setSex(data.sex || '');
        setCompleteAddress(data.complete_address || '');
        if (data.birthdate) {
          const [yr, mth, dy] = data.birthdate.split('-');
          setBirthYear(yr);
          setBirthMonth(String(Number(mth)));
          setBirthDay(String(Number(dy)));
        }
        setAddress({
          street: data.street || '',
          regionCode: data.region_code || '', regionName: data.region_name || '',
          provinceCode: data.province_code || '', provinceName: data.province_name || '',
          cityCode: data.city_code || '', cityName: data.city_name || '',
          barangayCode: data.barangay_code || '', barangayName: data.barangay_name || '',
        });
      }
    }
    fetchDentistProfile();
  }, [user]);

  // Pre-select the patient who is currently in the chair when the tooth chart opens
  useEffect(() => {
    if (currentView !== 'toothchart' || chartPatientId || chartPatients.length === 0) return;
    const inChair = appointments.filter(a => a.status === 'In Treatment' && a.assigned_dentist === dentistName);
    const match = chartPatients.find((p) => inChair.some((a) => belongsToPatient(a, p)));
    if (match) setChartPatientId(String(match.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentView, chartPatients, appointments, dentistName]);

  // Only list verified patients who have an appointment assigned to this dentist.
  useEffect(() => {
    if (currentView !== 'toothchart' && currentView !== 'logs') return;
    let active = true;
    const loadAssignedPatients = async () => {
      const { data, error } = await supabase.from('staff_users')
        .select('id, full_name, account_status, archived_at')
        .eq('role', 'patient')
        .order('full_name');
      if (!active) return;
      if (error) {
        console.error('Could not load assigned dentist patients:', error.message);
        setChartPatients([]);
        return;
      }
      const verifiedPatients = (data || []).filter((patient) =>
        !patient.archived_at && (patient.account_status || 'Approved') === 'Approved'
      );
      setChartPatients(verifiedPatients.filter((patient) =>
        appointments.some((appointment) =>
          appointment.assigned_dentist === dentistName && belongsToPatient(appointment, patient)
        )
      ));
    };
    loadAssignedPatients();
    return () => { active = false; };
  }, [currentView, appointments, dentistName]);

  useEffect(() => {
    if (!scheduleDentistName) return undefined;
    let active = true;
    const loadSchedule = async () => {
      try {
        const schedule = await fetchDentistAvailability(scheduleDentistName, null);
        if (active) {
          setAvailabilityMap(schedule);
          setAvailabilityError('');
        }
      } catch (error) {
        if (active) {
          setAvailabilityError(`Could not load dentist availability: ${error.message}`);
          setScheduleMsg(`Could not load dentist availability: ${error.message}`);
        }
      } finally {
        if (active) setAvailabilityLoading(false);
      }
    };
    loadSchedule();
    return () => { active = false; };
  }, [scheduleDentistName, user?.id]);

  useEffect(() => {
    if (!user?.id) return undefined;
    let active = true;
    const monthStart = new Date(calendarYear, calendarMonth, 1);
    const nextMonthStart = new Date(calendarYear, calendarMonth + 1, 1);
    const formatDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    supabase.from('staff_attendance')
      .select('attendance_date, clock_in, clock_out')
      .eq('staff_user_id', user.id)
      .gte('attendance_date', formatDate(monthStart))
      .lt('attendance_date', formatDate(nextMonthStart))
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setScheduleMsg(`Could not load attendance history: ${error.message}`);
          return;
        }
        setAttendanceByDate(Object.fromEntries((data || []).map((entry) => [entry.attendance_date, entry])));
      })
      .catch((error) => {
        if (active) setScheduleMsg(`Could not load attendance history: ${error.message}`);
      });
    return () => { active = false; };
  }, [calendarYear, calendarMonth, user?.id]);
  const assignedAppointments = appointments.filter(a => a.assigned_dentist === dentistName);
  const totalPatients = assignedAppointments.length;
  const completedPatients = assignedAppointments.filter(a => a.status === 'Completed').length;

  // The tooth chart can only be edited while the patient is in the chair (appointment status "In Treatment")
  const isPatientInChair = (patient) => assignedAppointments.some(a => a.status === 'In Treatment' && belongsToPatient(a, patient));
  const inChairNames = [...new Set(assignedAppointments.filter(a => a.status === 'In Treatment').map(a => a.patient_name))];
  const chartPatient = chartPatients.find((p) => String(p.id) === chartPatientId);
  const filteredChartPatients = chartPatients.filter((patient) =>
    (patient.full_name || '').toLowerCase().includes(chartPatientSearch.trim().toLowerCase())
  );
  const chartPatientInChair = !!chartPatient && isPatientInChair(chartPatient);
  // Re-checked against the database right before saving, so a stale screen can't bypass the rule
  const verifyPatientInChair = async () => {
    const attendanceIssue = await checkClockedIn();
    if (attendanceIssue) return attendanceIssue;
    if (!chartPatient) return 'Select a patient first.';
    const { data, error } = await supabase.from('appointments').select('id, patient_id, patient_name, assigned_dentist')
      .eq('status', 'In Treatment')
      .eq('assigned_dentist', dentistName);
    if (error) return `Could not verify the patient's status: ${error.message}`;
    const ok = (data || []).some((a) => belongsToPatient(a, chartPatient));
    return ok ? null : 'This patient is not being treated by you right now. Ask the dental assistant to send them to the chair first.';
  };
  const completionRate = totalPatients > 0 ? Math.round((completedPatients / totalPatients) * 100) : 0;
  const reportEndDate = new Date();
  reportEndDate.setHours(0, 0, 0, 0);
  const reportDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(reportEndDate);
    date.setDate(date.getDate() - (6 - index));
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const dayAppointments = assignedAppointments.filter((appointment) => appointment.appointment_date === key);
    return {
      key,
      label: date.toLocaleDateString('en-US', { weekday: 'short' }),
      completed: dayAppointments.filter((appointment) => appointment.status === 'Completed').length,
      active: dayAppointments.filter((appointment) => ['Pending', 'Accepted', 'In Queue', 'In Treatment'].includes(appointment.status)).length,
    };
  });
  const reportChartMax = Math.max(1, ...reportDays.map((day) => day.completed + day.active));
  const reportActivePatients = assignedAppointments.filter((appointment) =>
    ['Pending', 'Accepted', 'In Queue', 'In Treatment'].includes(appointment.status)
  ).length;

  const filteredLogs = assignedAppointments.filter(a => {
    const matchesSearch = a.patient_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesService = filterService === 'All' || a.service_name === filterService;
    const matchesStatus = filterStatus === 'All' || a.status === filterStatus;
    const matchesDate = !filterDate || a.appointment_date === filterDate;
    return matchesSearch && matchesService && matchesStatus && matchesDate;
  });

  const handleProfileUpdated = async (profile) => {
    await recordActivity(user, { action: 'Updated dentist profile', entityType: 'staff_user', entityId: profile.id });
    setFirstName(profile.first_name || '');
    setMiddleName(profile.middle_name || '');
    setLastName(profile.last_name || '');
    setUsername(profile.username || '');
    setEmail(profile.email || '');
    setMobileNumber(profile.mobile_number || '');
    setSex(profile.sex || '');
    setCompleteAddress(profile.complete_address || '');
    if (profile.birthdate) {
      const [year, month, day] = profile.birthdate.split('-');
      setBirthYear(year);
      setBirthMonth(String(Number(month)));
      setBirthDay(String(Number(day)));
    }
    setAddress({
      ...EMPTY_ADDRESS,
      street: profile.street || '',
      regionCode: profile.region_code || '',
      regionName: profile.region_name || '',
      provinceCode: profile.province_code || '',
      provinceName: profile.province_name || '',
      cityCode: profile.city_code || '',
      cityName: profile.city_name || '',
      barangayCode: profile.barangay_code || '',
      barangayName: profile.barangay_name || '',
    });
    setProfileSuccess('Profile updated successfully.');
    setIsEditingProfile(false);
  };

  // Calendar generation helpers
  const firstDayIndex = new Date(calendarYear, calendarMonth, 1).getDay();
  const adjustedFirstDayIndex = (firstDayIndex + 6) % 7;
  const totalDaysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();

  const calendarCells = [];
  for (let i = 0; i < adjustedFirstDayIndex; i++) {
    calendarCells.push(null);
  }
  for (let d = 1; d <= totalDaysInMonth; d++) {
    const dt = new Date(calendarYear, calendarMonth, d);
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    calendarCells.push({ dayNum: d, dateStr: `${yyyy}-${mm}-${dd}` });
  }

  const weekHeaderDays = [
    { label: 'Mon', index: 1 },
    { label: 'Tue', index: 2 },
    { label: 'Wed', index: 3 },
    { label: 'Thu', index: 4 },
    { label: 'Fri', index: 5 },
    { label: 'Sat', index: 6 },
    { label: 'Sun', index: 0 }
  ];

  return (
    <div className="h-full w-full bg-[#F7F8F5] border border-[#d4e2dc] rounded-2xl p-6 shadow-2xs flex flex-col overflow-y-auto">
      
      {/* 1. DASHBOARD VIEW */}
      {currentView === 'dashboard' && (
        <div className="flex-1 space-y-5">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <div>
              <h2 className="font-black text-2xl text-[#13241b]">Dentist Dashboard & Attendance</h2>
              <p className="text-xs text-[#607368]">Overview of your patient load and daily shift time tracking.</p>
            </div>

            <div className="bg-white border border-[#d4e2dc] px-4 py-3 rounded-2xl flex items-center gap-4 shadow-2xs">
              <div>
                <span className="text-[10px] text-[#607368] font-bold uppercase tracking-wider block">Today's Shift</span>
                <span className="text-xs font-bold text-[#13241b]">
                  In: {attendanceLog.timeIn || '—'} | Out: {attendanceLog.timeOut || '—'}
                </span>
              </div>
              <div className="flex gap-2">
                <button 
                  type="button" 
                  onClick={handleClockIn}
                  disabled={attendanceLoading || availabilityLoading || Boolean(availabilityError) || attendanceSaving || attendanceLog.timeIn !== null}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs"
                >
                  Time-In
                </button>
                <button 
                  type="button" 
                  onClick={handleClockOut}
                  disabled={attendanceLoading || attendanceSaving || attendanceLog.timeIn === null || attendanceLog.timeOut !== null}
                  className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs"
                >
                  Time-Out
                </button>
                {attendanceRecord?.clock_out ? (
                  <button type="button" onClick={handleCancelClockOut} disabled={attendanceLoading || attendanceSaving} className="border border-amber-300 text-amber-800 hover:bg-amber-50 disabled:opacity-50 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer">
                    Cancel Time-Out
                  </button>
                ) : attendanceRecord?.clock_in ? (
                  <button type="button" onClick={handleCancelClockIn} disabled={attendanceLoading || attendanceSaving} className="border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer">
                    Cancel Time-In
                  </button>
                ) : null}
              </div>
            </div>
          </div>
          {attendanceMessage && <p role="alert" className="text-xs font-semibold text-red-700">{attendanceMessage}</p>}
          {!attendanceLoading && !attendanceMessage && !dentistOnShift && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
              Time in to your shift before saving clinical notes, editing tooth charts, or changing clinic settings.
            </p>
          )}

          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            {[
              ['Total appointments', totalPatients, 'text-[#164e43]'],
              ['Active / waiting', reportActivePatients, 'text-amber-600'],
              ['Completed procedures', completedPatients, 'text-emerald-600'],
              ['Completion rate', `${completionRate}%`, 'text-[#164e43]'],
            ].map(([label, value, color]) => (
              <div key={label} className="bg-white border border-[#d4e2dc] rounded-2xl p-5 shadow-2xs">
                <p className="text-xs font-bold text-[#607368] uppercase tracking-wider">{label}</p>
                <h3 className={`text-3xl font-black mt-2 ${color}`}>{value}</h3>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)] gap-4">
            <section className="min-h-[330px] bg-white border border-[#d4e2dc] rounded-2xl p-5 shadow-2xs flex flex-col">
              <div className="flex flex-wrap justify-between items-start gap-2">
                <div>
                  <h3 className="font-black text-lg text-[#13241b]">Weekly treatment report</h3>
                  <p className="text-xs text-[#607368] mt-1">Completed and active appointments for the last 7 days.</p>
                </div>
                <div className="flex gap-4 text-[11px] font-semibold text-[#607368]">
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#164e43]" />Completed</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-amber-400" />Active</span>
                </div>
              </div>
              <div className="mt-5 flex flex-1 items-end gap-2 sm:gap-4 border-b border-l border-[#e5ece8] px-2 pb-2 pt-5">
                {reportDays.map((day) => (
                  <div key={day.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
                    <div className="flex h-full w-full max-w-14 items-end justify-center gap-1">
                      <div
                        title={`${day.completed} completed`}
                        className="w-1/2 min-w-2 rounded-t bg-[#164e43] transition-all"
                        style={{ height: `${day.completed ? Math.max((day.completed / reportChartMax) * 100, 5) : 2}%` }}
                      />
                      <div
                        title={`${day.active} active`}
                        className="w-1/2 min-w-2 rounded-t bg-amber-400 transition-all"
                        style={{ height: `${day.active ? Math.max((day.active / reportChartMax) * 100, 5) : 2}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-semibold text-[#607368]">{day.label}</span>
                    <span className="text-[9px] text-[#8a9992]">{day.completed + day.active}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-right text-[10px] text-[#8a9992]">Bars show appointments per day · number below each bar is the daily total</p>
            </section>

            <section className="bg-white border border-[#d4e2dc] rounded-2xl p-5 shadow-2xs space-y-4">
              <div>
                <h3 className="font-black text-base text-[#13241b]">Clinic admittance &amp; daily capacity</h3>
                <p className="text-xs text-[#607368] mt-1">Set the maximum number of patient appointments you can admit per day.</p>
              </div>

              {limitSavedMsg && (
                <div role={limitSaveError ? 'alert' : 'status'} className={`${limitSaveError ? 'bg-red-50 border-red-200 text-red-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'} border text-xs p-3 rounded-xl font-bold`}>
                  {limitSaveError ? '!' : '✓'} {limitSavedMsg}
                </div>
              )}

              <form onSubmit={handleSaveLimit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-[#13241b] mb-1">Max Patients Admitted Per Day</label>
                <input 
                  type="number" 
                  min="1" 
                  max="50"
                  step="1"
                  value={maxDailyPatients}
                  onChange={e => setMaxDailyPatients(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  className="w-full border border-[#d4e2dc] rounded-xl p-3 bg-white font-bold text-[#13241b]"
                />
              </div>
              <button 
                type="submit" 
                className="bg-[#164e43] text-white px-5 py-2.5 rounded-xl font-bold hover:bg-[#0f362e] transition cursor-pointer"
              >
                Save Capacity Limit
              </button>
            </form>
            </section>
          </div>
        </div>
      )}

      {/* 2. SCHEDULER & INTERACTIVE CALENDAR VIEW */}
      {currentView === 'scheduler' && (
        <div className="space-y-6">
          <div className="flex flex-wrap justify-between items-start gap-3">
            <div>
              <h2 className="font-black text-2xl text-[#13241b]">Practitioner Availability Calendar</h2>
              <p className="text-xs text-[#607368]">Click any date cell to configure hours, or click weekday headers to apply schedule for the whole month.</p>
            </div>
            <div className="flex items-center gap-3 bg-white border border-[#d4e2dc] px-4 py-2 rounded-2xl shadow-2xs">
              <button 
                type="button" 
                onClick={() => {
                  if (calendarMonth === 0) { setCalendarMonth(11); setCalendarYear(calendarYear - 1); }
                  else { setCalendarMonth(calendarMonth - 1); }
                }}
                className="font-black text-[#164e43] px-2 py-1 hover:bg-[#f5f7f6] rounded-lg cursor-pointer"
              >
                ‹
              </button>
              <span className="font-black text-xs text-[#13241b]">{MONTHS[calendarMonth]} {calendarYear}</span>
              <button 
                type="button" 
                onClick={() => {
                  if (calendarMonth === 11) { setCalendarMonth(0); setCalendarYear(calendarYear + 1); }
                  else { setCalendarMonth(calendarMonth + 1); }
                }}
                className="font-black text-[#164e43] px-2 py-1 hover:bg-[#f5f7f6] rounded-lg cursor-pointer"
              >
                ›
              </button>
            </div>
          </div>

          {availabilityError && (
            <div role="alert" className="bg-red-50 border border-red-200 text-red-800 text-xs p-3.5 rounded-xl font-bold">
              {availabilityError}
            </div>
          )}
          {scheduleMsg && !availabilityError && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs p-3.5 rounded-xl font-bold">
              ✓ {scheduleMsg}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Interactive Calendar Grid */}
            <div className="min-w-0 lg:col-span-2 bg-white border border-[#d4e2dc] rounded-2xl p-4 sm:p-6 shadow-2xs space-y-4">
              <div className="text-xs text-[#607368] font-bold">
                💡 <span className="underline">Tip:</span> Click a weekday header to schedule current or future dates. Past dates are view-only and show attendance as Present or Absent.
              </div>

              <div className="-mx-1 overflow-x-auto pb-2">
                <div className="min-w-[560px] space-y-3 px-1">
                  <div className="grid grid-cols-7 gap-2 text-center">
                    {weekHeaderDays.map(wd => (
                      <button
                        key={wd.label}
                        type="button"
                        onClick={() => handleApplyToAllWeekdayInMonth(wd.index)}
                        disabled={!calendarCells.some((cell) => cell
                          && cell.dateStr >= localDateKey()
                          && new Date(`${cell.dateStr}T00:00:00`).getDay() === wd.index)}
                        title={`Click to set ${timeInInput} - ${timeOutInput} for all ${wd.label}s in ${MONTHS[calendarMonth]}`}
                        className="bg-[#f0f5f2] hover:bg-[#164e43] hover:text-white text-[#164e43] py-2 rounded-xl text-xs font-black transition cursor-pointer shadow-2xs disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {wd.label} ↻
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-2">
                    {calendarCells.map((cell, idx) => {
                  if (!cell) {
                    return <div key={`empty-${idx}`} className="h-20 bg-gray-50 rounded-xl opacity-40"></div>;
                  }
                  const slot = availabilityMap[cell.dateStr];
                  const isSelected = selectedDateKey === cell.dateStr;
                  const isPastDate = cell.dateStr < localDateKey();
                  const attendance = attendanceByDate[cell.dateStr];
                  const attendanceStatus = isPastDate && (slot || attendance)
                    ? attendance?.clock_in ? 'Present' : 'Absent'
                    : null;

                  return (
                    <div
                      key={cell.dateStr}
                      onClick={() => {
                        setSelectedDateKey(cell.dateStr);
                        if (slot) {
                          setTimeInInput(slot.timeIn);
                          setTimeOutInput(slot.timeOut);
                        }
                      }}
                      className={`h-20 p-2 rounded-xl border flex flex-col justify-between transition cursor-pointer shadow-2xs ${
                        isSelected ? 'border-[#164e43] bg-[#e3ede6] ring-2 ring-[#164e43]' :
                        slot ? 'border-emerald-300 bg-emerald-50' : 'border-[#d4e2dc] bg-white hover:bg-[#f8faf9]'
                      }`}
                    >
                      <div className="flex justify-between items-center text-xs font-black">
                        <span className={slot ? 'text-emerald-800' : 'text-[#13241b]'}>{cell.dayNum}</span>
                        {attendanceStatus
                          ? <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${attendanceStatus === 'Present' ? 'bg-emerald-200 text-emerald-800' : 'bg-red-100 text-red-700'}`}>{attendanceStatus}</span>
                          : slot && <span className="text-[10px] bg-emerald-200 text-emerald-800 px-1.5 py-0.5 rounded font-bold">Active</span>}
                      </div>
                      <div className="text-[10px] text-[#607368] font-semibold truncate">
                        {slot ? `${slot.timeIn}` : isPastDate ? 'No schedule' : 'Available?'}
                      </div>
                    </div>
                  );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Panel: Time-In & Time-Out Config */}
            <div className="bg-white border border-[#d4e2dc] rounded-2xl p-6 shadow-2xs space-y-4 flex flex-col justify-between">
              <div className="space-y-4">
                <h3 className="font-black text-base text-[#13241b]">
                  {selectedDateKey ? `Configuring Date: ${selectedDateKey}` : 'Select a Day on Calendar'}
                </h3>
                {selectedDateKey && selectedDateKey < localDateKey() && (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
                    Past dates are view-only. Attendance: {attendanceByDate[selectedDateKey]?.clock_in ? 'Present' : availabilityMap[selectedDateKey] ? 'Absent' : 'No schedule'}.
                  </p>
                )}

                <form onSubmit={handleSaveSingleDayAvailability} className="space-y-3 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-[#13241b] mb-1">Time-In</label>
                      <input 
                        type="time"
                        required
                        disabled={!selectedDateKey || selectedDateKey < localDateKey()}
                        value={timeInInput}
                        onChange={e => setTimeInInput(e.target.value)}
                        className="w-full border border-[#d4e2dc] rounded-xl p-3 bg-white font-bold text-[#13241b]"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-[#13241b] mb-1">Time-Out</label>
                      <input 
                        type="time"
                        required
                        disabled={!selectedDateKey || selectedDateKey < localDateKey()}
                        value={timeOutInput}
                        onChange={e => setTimeOutInput(e.target.value)}
                        className="w-full border border-[#d4e2dc] rounded-xl p-3 bg-white font-bold text-[#13241b]"
                      />
                    </div>
                  </div>

                  <button 
                    type="submit"
                    disabled={!selectedDateKey || selectedDateKey < localDateKey()}
                    className="w-full bg-[#164e43] hover:bg-[#0f362e] disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-xl font-bold transition cursor-pointer mt-2"
                  >
                    Save Availability for Date
                  </button>
                </form>

                {selectedDateKey && selectedDateKey >= localDateKey() && availabilityMap[selectedDateKey] && (
                  <button
                    type="button"
                    onClick={() => handleRemoveAvailability(selectedDateKey)}
                    className="w-full bg-red-50 hover:bg-red-600 hover:text-white text-red-600 py-2.5 rounded-xl font-bold transition cursor-pointer text-xs"
                  >
                    Clear Availability on this Date
                  </button>
                )}
              </div>

              <div className="border-t border-[#d4e2dc] pt-4">
                <span className="text-[11px] font-bold text-[#607368] block mb-2">Configured Dates Summary</span>
                <div className="max-h-36 overflow-y-auto space-y-1.5">
                  {Object.keys(availabilityMap).length > 0 ? (
                    Object.entries(availabilityMap).map(([dKey, slot]) => (
                      <div key={dKey} className="text-[11px] bg-[#f8faf9] border border-[#d4e2dc] p-2 rounded-xl flex justify-between items-center">
                        <span className="font-bold text-[#13241b]">{dKey}</span>
                        <span className="text-[#607368]">{slot.timeIn} - {slot.timeOut}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-[11px] text-gray-400 italic text-center">No dates set yet.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. PATIENT LOGS VIEW */}
      {currentView === 'logs' && (
        <div className="space-y-4 flex flex-col">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="font-black text-2xl text-[#13241b]">Patient Logs</h2>
              <p className="text-xs text-[#607368]">Search and filter patient visits. Write each visit's treatment notes or prescription here; the dental assistant can only mark a visit as done after you issue them.</p>
            </div>
            <span className="text-xs bg-[#e3ede6] text-[#164e43] px-3 py-1 rounded-full font-bold">
              Showing: {filteredLogs.length} of {assignedAppointments.length}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 bg-white p-4 rounded-2xl border border-[#d4e2dc]">
            <div>
              <label className="block text-[11px] font-bold text-[#607368] mb-1">Search Patient</label>
              <input 
                type="text"
                placeholder="Search by name..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full border border-[#d4e2dc] rounded-xl p-2.5 text-xs bg-white focus:outline-none focus:border-[#164e43]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[#607368] mb-1">Filter by Service</label>
              <select 
                value={filterService}
                onChange={e => setFilterService(e.target.value)}
                className="w-full border border-[#d4e2dc] rounded-xl p-2.5 text-xs bg-white focus:outline-none"
              >
                <option value="All">All Services</option>
                {services.map(s => (
                  <option key={s.id} value={s.service_name}>{s.service_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[#607368] mb-1">Filter by Status</label>
              <select 
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="w-full border border-[#d4e2dc] rounded-xl p-2.5 text-xs bg-white focus:outline-none"
              >
                <option value="All">All Statuses</option>
                <option value="Pending">Pending</option>
                <option value="Accepted">Accepted</option>
                <option value="Rejected">Rejected</option>
                <option value="In Queue">In Queue</option>
                <option value="In Treatment">In Treatment</option>
                <option value="Completed">Completed</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[#607368] mb-1">Filter by Date</label>
              <div className="flex gap-2">
                <input 
                  type="date"
                  value={filterDate}
                  onChange={e => setFilterDate(e.target.value)}
                  className="w-full border border-[#d4e2dc] rounded-xl p-2 text-xs bg-white focus:outline-none"
                />
                {filterDate && (
                  <button 
                    onClick={() => setFilterDate('')}
                    className="bg-gray-200 text-gray-700 px-3 rounded-xl text-xs font-bold hover:bg-gray-300 cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="overflow-y-auto bg-white border border-[#d4e2dc] rounded-2xl p-4">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#d4e2dc] text-[11px] font-bold text-[#607368] uppercase">
                  <th className="py-3 px-2">Patient Name</th>
                  <th className="py-3 px-2">Contact</th>
                  <th className="py-3 px-2">Service</th>
                  <th className="py-3 px-2">Date & Time</th>
                  <th className="py-3 px-2">Status</th>
                  <th className="py-3 px-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f5f2] text-xs">
                {filteredLogs.length > 0 ? (
                  filteredLogs.map(a => {
                    const patientArchived = isArchivedPatient(a);
                    return (
                    <tr key={a.id} className={patientArchived ? 'bg-gray-100 text-gray-500' : 'hover:bg-[#f8faf9]'}>
                      <td className={`py-3 px-2 font-bold ${patientArchived ? 'text-gray-500' : 'text-[#13241b]'}`}>
                        {a.patient_name}
                        {patientArchived && <span className="ml-2 rounded bg-gray-200 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gray-600">Archived by admin · unavailable</span>}
                      </td>
                      <td className="py-3 px-2 text-[#607368]">{contactFor(a) || 'N/A'}</td>
                      <td className="py-3 px-2 font-semibold text-[#164e43]">{a.service_name}</td>
                      <td className="py-3 px-2">{a.appointment_date} @ {formatApptTime(a.appointment_time)}</td>
                      <td className="py-3 px-2">
                        <span className={`px-2.5 py-0.5 rounded-md font-bold text-[11px] ${
                          a.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : a.status === 'Rejected' ? 'bg-red-100 text-red-700' : 'bg-[#e3ede6] text-[#164e43]'
                        }`}>
                          {a.status}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-right whitespace-nowrap space-x-3">
                        {patientArchived ? (
                          <span className="text-[11px] font-semibold text-gray-500">Unavailable</span>
                        ) : a.status === 'In Queue' && (
                          <span className="text-[11px] italic text-gray-400">Notes open once the patient is in treatment</span>
                        )}
                        {!patientArchived && ['In Treatment', 'Completed'].includes(a.status) && (
                          <button
                            type="button"
                            onClick={() => setRecordTarget(a)}
                            title={!dentistOnShift ? 'Time in before editing clinical notes.' : ''}
                            className={`px-3 py-1.5 rounded-xl font-bold text-[11px] cursor-pointer transition ${
                              treatmentRecords[String(a.id)]
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                                : a.status === 'Completed'
                                  ? 'bg-white text-amber-700 border border-amber-300 hover:bg-amber-50'
                                  : 'bg-[#164e43] text-white hover:bg-[#0f362e]'
                            }`}
                          >
                            {treatmentRecords[String(a.id)] ? '✓ Notes issued · Edit' : a.status === 'Completed' ? 'Add missing notes' : 'Write notes / prescription'}
                          </button>
                        )}
                        {!patientArchived && (
                          <button
                            type="button"
                            onClick={() => {
                              const patient = chartPatients.find((p) => belongsToPatient(a, p));
                              if (patient) setChartPatientId(String(patient.id));
                              if (onViewChange) onViewChange('toothchart');
                            }}
                            className="text-[11px] font-bold text-[#164e43] hover:underline cursor-pointer"
                          >
                            View tooth chart
                          </button>
                        )}
                      </td>
                    </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="6" className="py-8 text-center text-gray-400 font-medium">
                      No patient logs match your search or filter criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {recordTarget && (
        <TreatmentRecordModal
          appointment={recordTarget}
          record={treatmentRecords[String(recordTarget.id)]}
          canEdit={dentistOnShift}
          issuedBy={user?.name}
          activityUser={user}
          beforeSave={verifyOnShift}
          onClose={() => setRecordTarget(null)}
          onSaved={refreshRecords}
        />
      )}

      {/* TOOTH CHART VIEW */}
      {currentView === 'toothchart' && (
        <div className="space-y-4">
          <div>
            <h2 className="font-black text-2xl text-[#13241b]">Patient Tooth Charts</h2>
            <p className="text-xs text-[#607368]">Record the status of each tooth. Patients can view their own chart (read-only) from their account.</p>
          </div>
          <div className="bg-white border border-[#d4e2dc] rounded-2xl p-4 max-w-md space-y-3">
            <label className="block text-[11px] font-bold text-[#607368] mb-1">Patient</label>
            <input
              type="search"
              value={chartPatientSearch}
              onChange={(event) => setChartPatientSearch(event.target.value)}
              placeholder="Search patients by name…"
              aria-label="Search patients by name"
              className="w-full border border-[#d4e2dc] rounded-xl p-2.5 text-xs bg-white focus:outline-none focus:border-[#164e43]"
            />
            <select
              value={chartPatientId}
              onChange={(e) => setChartPatientId(e.target.value)}
              aria-label="Select patient tooth chart"
              className="w-full border border-[#d4e2dc] rounded-xl p-2.5 text-xs bg-white focus:outline-none focus:border-[#164e43]"
            >
              <option value="">{filteredChartPatients.length ? 'Select a verified patient' : 'No patients match your search'}</option>
              {filteredChartPatients.map((p) => <option key={p.id} value={p.id}>{p.full_name}{isPatientInChair(p) ? '  ·  In treatment' : ''}</option>)}
            </select>
            <p className="text-[11px] text-[#607368] mt-2">
              {inChairNames.length > 0
                ? `In your chair now: ${inChairNames.join(', ')}`
                : 'No patient is in your chair right now. Charts can be edited only while a patient is In Treatment.'}
            </p>
          </div>
          <ToothChart
            patientId={chartPatientId ? Number(chartPatientId) : null}
            patientName={chartPatient?.full_name}
            canEdit={chartPatientInChair && dentistOnShift}
            readOnlyReason={chartPatient && (!attendanceRecord?.clock_in || attendanceRecord?.clock_out)
              ? 'Time in to your shift before editing patient tooth charts.'
              : chartPatient && !chartPatientInChair
                ? 'This patient is not in treatment right now, so the chart is read-only. The dental assistant must send the patient to the chair (status "In Treatment") before you can change any tooth.'
                : ''}
            beforeSave={verifyPatientInChair}
            editorName={user?.name}
            activityUser={user}
          />
        </div>
      )}

      {/* 5. PROFILE VIEW */}
      {currentView === 'profile' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="font-black text-2xl text-[#13241b]">Dentist Profile</h2>
              <p className="text-xs text-[#607368]">Manage your licensed practitioner details.</p>
            </div>
            {!isEditingProfile && (
              <button
                onClick={() => setIsEditingProfile(true)}
                className="bg-[#164e43] hover:bg-[#0f362e] text-white px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Edit Profile
              </button>
            )}
          </div>

          {profileSuccess && (
            <div className="bg-green-50 border border-green-200 text-green-700 text-xs p-3 rounded-xl font-bold">
              ✓ {profileSuccess}
            </div>
          )}

          {!isEditingProfile ? (
            <div className="bg-white border border-[#d4e2dc] rounded-2xl p-6 max-w-2xl space-y-4 text-xs shadow-2xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <span className="font-bold text-[#607368] block">First Name:</span>
                  <p className="font-black text-sm text-[#13241b] mt-1">{firstName || 'N/A'}</p>
                </div>
                <div>
                  <span className="font-bold text-[#607368] block">Last Name:</span>
                  <p className="font-black text-sm text-[#13241b] mt-1">{lastName || 'N/A'}</p>
                </div>
                <div>
                  <span className="font-bold text-[#607368] block">Middle Name:</span>
                  <p className="font-black text-sm text-[#13241b] mt-1">{middleName || 'N/A'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-[#d4e2dc] pt-3">
                <div>
                  <span className="font-bold text-[#607368] block">Username:</span>
                  <p className="font-semibold text-[#13241b] mt-1">{username || 'N/A'}</p>
                </div>
                <div>
                  <span className="font-bold text-[#607368] block">Email Address:</span>
                  <p className="font-semibold text-[#13241b] mt-1">{email || 'N/A'}</p>
                </div>
              </div>

              <div className="border-t border-[#d4e2dc] pt-3">
                <span className="font-bold text-[#607368] block">Birthdate:</span>
                <p className="font-semibold text-[#13241b] mt-1">
                  {birthMonth && birthDay && birthYear ? `${MONTHS[Number(birthMonth) - 1]} ${birthDay}, ${birthYear}` : 'N/A'}
                </p>
              </div>

              <div className="border-t border-[#d4e2dc] pt-3">
                <span className="font-bold text-[#607368] block">Mobile number and sex:</span>
                <p className="font-semibold text-[#13241b] mt-1">{mobileNumber || 'N/A'} · {sex || 'N/A'}</p>
              </div>

              <div className="border-t border-[#d4e2dc] pt-3">
                <span className="font-bold text-[#607368] block">Address Information:</span>
                <p className="font-semibold text-[#13241b] mt-1">{completeAddress || buildCompleteAddress(address) || 'N/A'}</p>
              </div>
            </div>
          ) : (
            <SelfProfile
              user={user}
              role="dentist"
              onSaved={handleProfileUpdated}
              onCancel={() => setIsEditingProfile(false)}
              beforeSave={async () => (await requireOnShift()) ? '' : 'Time-in is required before editing your profile.'}
            />
          )}
        </div>
      )}

    </div>
  );
}
