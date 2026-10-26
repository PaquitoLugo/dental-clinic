import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { dialog } from '../components/DialogHost';
import PhAddressSelect from '../components/PhAddressSelect';
import ToothChart from '../components/ToothChart';
import TreatmentRecordModal from '../components/TreatmentRecordModal';
import useTreatmentRecords from '../lib/useTreatmentRecords';
import usePatientContacts from '../lib/usePatientContacts';
import { belongsToPatient } from '../lib/patientMatch';
import { isAccountActive } from '../lib/useSessionGuard';
import useAttendance from '../lib/useAttendance';

// "23:38:00" / "13:00" -> "11:38 PM" / "1:00 PM"
const formatApptTime = (t) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || '');
  if (!m) return t || '';
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
};
import { EMPTY_ADDRESS, buildCompleteAddress } from '../lib/phAddress';

const TODAY = new Date();
const MAX_YEAR = TODAY.getFullYear();
const MAX_MONTH = TODAY.getMonth() + 1;
const MAX_DAY = TODAY.getDate() - 1;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const BIRTH_YEAR_OPTIONS = Array.from({ length: 120 }, (_, i) => MAX_YEAR - i);
const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => i + 1);

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
  const [birthMonth, setBirthMonth] = useState('');
  const [birthDay, setBirthDay] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [address, setAddress] = useState(EMPTY_ADDRESS);
  const [profileSuccess, setProfileSuccess] = useState('');

  // Treatment notes / prescriptions the dentist issues before the assistant can mark a visit as done
  const { records: treatmentRecords, refresh: refreshRecords } = useTreatmentRecords();
  const [recordTarget, setRecordTarget] = useState(null);
  const contactFor = usePatientContacts();

  // Tooth chart: which patient the dentist is charting
  const [chartPatients, setChartPatients] = useState([]);
  const [chartPatientId, setChartPatientId] = useState('');

  // Daily Capacity & Scheduler State
  const [maxDailyPatients, setMaxDailyPatients] = useState(() => {
    return localStorage.getItem(`dentist_limit_${user?.id || 2}`) || 10;
  });
  const [limitSavedMsg, setLimitSavedMsg] = useState('');

  // Interactive Calendar & Availability State
  const [calendarYear, setCalendarYear] = useState(TODAY.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(TODAY.getMonth()); // 0 - 11
  const [selectedDateKey, setSelectedDateKey] = useState(new Date().toISOString().split('T')[0]);
  const [timeInInput, setTimeInInput] = useState('08:00');
  const [timeOutInput, setTimeOutInput] = useState('17:00');
  
  const [availabilityMap, setAvailabilityMap] = useState(() => {
    const saved = localStorage.getItem(`dentist_availability_${user?.id || 2}`);
    return saved ? JSON.parse(saved) : {};
  });
  const [scheduleMsg, setScheduleMsg] = useState('');

  const { record: attendanceLog, saving: attendanceSaving, message: attendanceMessage, clockIn, clockOut } = useAttendance(user);

  // Archived accounts can't change their schedule or clock in/out (the session guard also signs them out)
  const requireActiveAccount = async () => {
    if (await isAccountActive(user?.id)) return true;
    await dialog.alert('Your account has been archived, so this action is not allowed.', { title: 'Account archived', variant: 'error' });
    return false;
  };

  const handleSaveLimit = async (e) => {
    e.preventDefault();
    if (!(await requireActiveAccount())) return;
    localStorage.setItem(`dentist_limit_${user?.id || 2}`, maxDailyPatients);
    setLimitSavedMsg('Daily patient capacity limit updated successfully!');
    setTimeout(() => setLimitSavedMsg(''), 4000);
  };

  // Save availability for a specific selected date
  const handleSaveSingleDayAvailability = async (e) => {
    e.preventDefault();
    if (!(await requireActiveAccount())) return;
    if (!selectedDateKey) return;

    const updated = {
      ...availabilityMap,
      [selectedDateKey]: { timeIn: timeInInput, timeOut: timeOutInput, active: true }
    };
    setAvailabilityMap(updated);
    localStorage.setItem(`dentist_availability_${user?.id || 2}`, JSON.stringify(updated));
    setScheduleMsg(`Availability saved for ${selectedDateKey} (${timeInInput} - ${timeOutInput})!`);
    setTimeout(() => setScheduleMsg(''), 4000);
  };

  // Apply availability to all matching weekdays of the current month
  const handleApplyToAllWeekdayInMonth = async (targetDayOfWeek) => {
    if (!(await requireActiveAccount())) return;
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const updated = { ...availabilityMap };
    let count = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(calendarYear, calendarMonth, d);
      if (dt.getDay() === targetDayOfWeek) {
        const yyyy = dt.getFullYear();
        const mm = String(dt.getMonth() + 1).padStart(2, '0');
        const dd = String(dt.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;

        updated[dateStr] = { timeIn: timeInInput, timeOut: timeOutInput, active: true };
        count++;
      }
    }

    setAvailabilityMap(updated);
    localStorage.setItem(`dentist_availability_${user?.id || 2}`, JSON.stringify(updated));
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    setScheduleMsg(`Applied ${timeInInput} - ${timeOutInput} to all ${dayNames[targetDayOfWeek]}s in ${MONTHS[calendarMonth]} (${count} days updated)!`);
    setTimeout(() => setScheduleMsg(''), 4000);
  };

  const handleRemoveAvailability = async (dateStr) => {
    if (!(await requireActiveAccount())) return;
    const updated = { ...availabilityMap };
    delete updated[dateStr];
    setAvailabilityMap(updated);
    localStorage.setItem(`dentist_availability_${user?.id || 2}`, JSON.stringify(updated));
  };

  const handleClockIn = async () => {
    if (await requireActiveAccount()) await clockIn();
  };

  const handleClockOut = async () => {
    if (await requireActiveAccount()) await clockOut();
  };

  const formatAttendanceTime = (value) => value
    ? new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : '—';

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
        setFirstName(data.first_name || (data.full_name ? data.full_name.split(' ')[0] : ''));
        setLastName(data.last_name || (data.full_name ? data.full_name.split(' ').slice(1).join(' ') : ''));
        setMiddleName(data.middle_name || '');
        setUsername(data.username || '');
        setEmail(data.email || '');
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
    const inChair = appointments.filter(a => a.status === 'In Treatment' && (!a.assigned_dentist || a.assigned_dentist === dentistName));
    const match = chartPatients.find((p) => inChair.some((a) => belongsToPatient(a, p)));
    if (match) setChartPatientId(String(match.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentView, chartPatients, appointments]);

  // Patients (verified accounts) for the tooth chart
  useEffect(() => {
    if (currentView !== 'toothchart' && currentView !== 'logs') return;
    supabase.from('staff_users').select('id, full_name, account_status').eq('role', 'patient').order('full_name')
      .then(({ data }) => setChartPatients((data || []).filter((p) => (p.account_status || 'Approved') === 'Approved')));
  }, [currentView]);

  const dentistName = `${firstName} ${middleName ? middleName + ' ' : ''}${lastName}`.trim();
  const assignedAppointments = appointments.filter(a => a.assigned_dentist === dentistName || !a.assigned_dentist);
  const totalPatients = assignedAppointments.length;
  const pendingPatients = assignedAppointments.filter(a => a.status === 'Pending' || a.status === 'Accepted' || a.status === 'In Queue' || a.status === 'In Treatment').length;
  const completedPatients = assignedAppointments.filter(a => a.status === 'Completed').length;

  // The tooth chart can only be edited while the patient is in the chair (appointment status "In Treatment")
  const isPatientInChair = (patient) => assignedAppointments.some(a => a.status === 'In Treatment' && belongsToPatient(a, patient));
  const inChairNames = [...new Set(assignedAppointments.filter(a => a.status === 'In Treatment').map(a => a.patient_name))];
  const chartPatient = chartPatients.find((p) => String(p.id) === chartPatientId);
  const chartPatientInChair = !!chartPatient && isPatientInChair(chartPatient);
  // Re-checked against the database right before saving, so a stale screen can't bypass the rule
  const verifyPatientInChair = async () => {
    if (!chartPatient) return 'Select a patient first.';
    const { data, error } = await supabase.from('appointments').select('id, patient_id, patient_name, assigned_dentist')
      .eq('status', 'In Treatment');
    if (error) return `Could not verify the patient's status: ${error.message}`;
    const ok = (data || []).some((a) => belongsToPatient(a, chartPatient) && (!a.assigned_dentist || a.assigned_dentist === dentistName));
    return ok ? null : 'This patient is not being treated by you right now. Ask the dental assistant to send them to the chair first.';
  };
  const completionRate = totalPatients > 0 ? Math.round((completedPatients / totalPatients) * 100) : 0;

  const filteredLogs = assignedAppointments.filter(a => {
    const matchesSearch = a.patient_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesService = filterService === 'All' || a.service_name === filterService;
    const matchesStatus = filterStatus === 'All' || a.status === filterStatus;
    const matchesDate = !filterDate || a.appointment_date === filterDate;
    return matchesSearch && matchesService && matchesStatus && matchesDate;
  });

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setProfileSuccess('');

    const fullName = `${firstName.trim()} ${middleName ? middleName.trim() + ' ' : ''}${lastName.trim()}`.replace(/\s+/g, " ");
    const birthdateFormatted = birthYear && birthMonth && birthDay 
      ? `${birthYear}-${String(birthMonth).padStart(2, '0')}-${String(birthDay).padStart(2, '0')}` 
      : null;

    const targetId = user?.id || 2;

    try {
      const { error } = await supabase
        .from('staff_users')
        .update({ 
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          middle_name: middleName.trim(),
          full_name: fullName,
          username: username.trim().toLowerCase(),
          email: email.trim(),
          birthdate: birthdateFormatted,
          street: address.street.trim(),
          region_code: address.regionCode,
          region_name: address.regionName,
          province_code: address.provinceCode === '__independent__' ? null : (address.provinceCode || null),
          province_name: address.provinceName || null,
          city_code: address.cityCode,
          city_name: address.cityName,
          barangay_code: address.barangayCode || null,
          barangay_name: address.barangayName,
          complete_address: buildCompleteAddress({ ...address, street: address.street.trim() })
        })
        .eq('id', targetId);

      if (error) {
        dialog.alert('Failed to update profile: ' + error.message, { title: 'Profile not saved', variant: 'error' });
      } else {
        setProfileSuccess('Profile updated and synchronized with database!');
        setIsEditingProfile(false);
      }
    } catch (err) {
      console.error(err);
      dialog.alert('Unexpected error updating profile.', { title: 'Profile not saved', variant: 'error' });
    }
  };

  const isMaxYear = Number(birthYear) === MAX_YEAR;
  const isMaxMonth = isMaxYear && Number(birthMonth) === MAX_MONTH;

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
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="font-black text-2xl text-[#13241b]">Dentist Dashboard & Attendance</h2>
              <p className="text-xs text-[#607368]">Overview of your patient load and daily shift time tracking.</p>
            </div>

            <div className="bg-white border border-[#d4e2dc] px-4 py-3 rounded-2xl flex items-center gap-4 shadow-2xs">
              <div>
                <span className="text-[10px] text-[#607368] font-bold uppercase tracking-wider block">Today's Shift</span>
                <span className="text-xs font-bold text-[#13241b]">
                  In: {formatAttendanceTime(attendanceLog?.clock_in)} | Out: {formatAttendanceTime(attendanceLog?.clock_out)}
                </span>
              </div>
              <div className="flex gap-2">
                <button 
                  type="button" 
                  onClick={handleClockIn}
                  disabled={Boolean(attendanceLog?.clock_in) || attendanceSaving}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs"
                >
                  Time-In
                </button>
                <button 
                  type="button" 
                  onClick={handleClockOut}
                  disabled={!attendanceLog?.clock_in || Boolean(attendanceLog?.clock_out) || attendanceSaving}
                  className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs"
                >
                  Time-Out
                </button>
              </div>
            </div>
          </div>
          {attendanceMessage && <p className="text-[11px] font-semibold text-red-700">{attendanceMessage}</p>}

          <div className="grid grid-cols-3 gap-6">
            <div className="bg-white border border-[#d4e2dc] rounded-2xl p-6 shadow-2xs">
              <p className="text-xs font-bold text-[#607368] uppercase tracking-wider">Total Patients Assigned</p>
              <h3 className="text-4xl font-black text-[#164e43] mt-3">{totalPatients}</h3>
            </div>
            <div className="bg-white border border-[#d4e2dc] rounded-2xl p-6 shadow-2xs">
              <p className="text-xs font-bold text-[#607368] uppercase tracking-wider">Pending / Waiting Patients</p>
              <h3 className="text-4xl font-black text-amber-600 mt-3">{pendingPatients}</h3>
            </div>
            <div className="bg-white border border-[#d4e2dc] rounded-2xl p-6 shadow-2xs">
              <p className="text-xs font-bold text-[#607368] uppercase tracking-wider">Completed Procedures</p>
              <h3 className="text-4xl font-black text-emerald-600 mt-3">{completedPatients}</h3>
            </div>
          </div>

          <div className="bg-white border border-[#d4e2dc] rounded-2xl p-6 shadow-2xs max-w-xl space-y-4">
            <div>
              <h4 className="font-black text-base text-[#13241b]">Clinic Admittance & Daily Capacity Scheduler</h4>
              <p className="text-xs text-[#607368]">Set the maximum number of patient appointments you can admit per day.</p>
            </div>

            {limitSavedMsg && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs p-3 rounded-xl font-bold">
                ✓ {limitSavedMsg}
              </div>
            )}

            <form onSubmit={handleSaveLimit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-[#13241b] mb-1">Max Patients Admitted Per Day</label>
                <input 
                  type="number" 
                  min="1" 
                  max="50"
                  value={maxDailyPatients}
                  onChange={e => setMaxDailyPatients(e.target.value)}
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
          </div>
        </div>
      )}

      {/* 2. SCHEDULER & INTERACTIVE CALENDAR VIEW */}
      {currentView === 'scheduler' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
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

          {scheduleMsg && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs p-3.5 rounded-xl font-bold">
              ✓ {scheduleMsg}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Interactive Calendar Grid */}
            <div className="lg:col-span-2 bg-white border border-[#d4e2dc] rounded-2xl p-6 shadow-2xs space-y-4">
              <div className="text-xs text-[#607368] font-bold">
                💡 <span className="underline">Tip:</span> Click a weekday header (e.g. **Mon**) to set that shift time for all Mondays of the month. Click a specific day box to configure just that date.
              </div>

              <div className="grid grid-cols-7 gap-2 text-center">
                {weekHeaderDays.map(wd => (
                  <button
                    key={wd.label}
                    type="button"
                    onClick={() => handleApplyToAllWeekdayInMonth(wd.index)}
                    title={`Click to set ${timeInInput} - ${timeOutInput} for all ${wd.label}s in ${MONTHS[calendarMonth]}`}
                    className="bg-[#f0f5f2] hover:bg-[#164e43] hover:text-white text-[#164e43] py-2 rounded-xl text-xs font-black transition cursor-pointer shadow-2xs"
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
                        {slot && <span className="text-[10px] bg-emerald-200 text-emerald-800 px-1.5 py-0.5 rounded font-bold">Active</span>}
                      </div>
                      <div className="text-[10px] text-[#607368] font-semibold truncate">
                        {slot ? `${slot.timeIn}` : 'Available?'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Panel: Time-In & Time-Out Config */}
            <div className="bg-white border border-[#d4e2dc] rounded-2xl p-6 shadow-2xs space-y-4 flex flex-col justify-between">
              <div className="space-y-4">
                <h3 className="font-black text-base text-[#13241b]">
                  {selectedDateKey ? `Configuring Date: ${selectedDateKey}` : 'Select a Day on Calendar'}
                </h3>

                <form onSubmit={handleSaveSingleDayAvailability} className="space-y-3 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-[#13241b] mb-1">Time-In</label>
                      <input 
                        type="time"
                        required
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
                        value={timeOutInput}
                        onChange={e => setTimeOutInput(e.target.value)}
                        className="w-full border border-[#d4e2dc] rounded-xl p-3 bg-white font-bold text-[#13241b]"
                      />
                    </div>
                  </div>

                  <button 
                    type="submit"
                    disabled={!selectedDateKey}
                    className="w-full bg-[#164e43] hover:bg-[#0f362e] disabled:opacity-50 text-white py-3 rounded-xl font-bold transition cursor-pointer mt-2"
                  >
                    Save Availability for Date
                  </button>
                </form>

                {selectedDateKey && availabilityMap[selectedDateKey] && (
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

          <div className="grid grid-cols-4 gap-3 bg-white p-4 rounded-2xl border border-[#d4e2dc]">
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
                  filteredLogs.map(a => (
                    <tr key={a.id} className="hover:bg-[#f8faf9]">
                      <td className="py-3 px-2 font-bold text-[#13241b]">{a.patient_name}</td>
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
                        {a.status === 'In Queue' && (
                          <span className="text-[11px] italic text-gray-400">Notes open once the patient is in treatment</span>
                        )}
                        {['In Treatment', 'Completed'].includes(a.status) && (
                          <button
                            type="button"
                            onClick={() => setRecordTarget(a)}
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
                      </td>
                    </tr>
                  ))
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
          canEdit
          issuedBy={user?.name}
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
          <div className="bg-white border border-[#d4e2dc] rounded-2xl p-4 max-w-md">
            <label className="block text-[11px] font-bold text-[#607368] mb-1">Patient</label>
            <select
              value={chartPatientId}
              onChange={(e) => setChartPatientId(e.target.value)}
              className="w-full border border-[#d4e2dc] rounded-xl p-2.5 text-xs bg-white focus:outline-none focus:border-[#164e43]"
            >
              <option value="">Select a verified patient</option>
              {chartPatients.map((p) => <option key={p.id} value={p.id}>{p.full_name}{isPatientInChair(p) ? '  ·  In treatment' : ''}</option>)}
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
            canEdit={chartPatientInChair}
            readOnlyReason={chartPatient && !chartPatientInChair ? 'This patient is not in treatment right now, so the chart is read-only. The dental assistant must send the patient to the chair (status "In Treatment") before you can change any tooth.' : ''}
            beforeSave={verifyPatientInChair}
            editorName={user?.name}
          />
        </div>
      )}

      {/* 4. REPORTS VIEW */}
      {currentView === 'reports' && (
        <div className="space-y-6">
          <div>
            <h2 className="font-black text-2xl text-[#13241b]">Clinical Reports & Analytics</h2>
            <p className="text-xs text-[#607368]">Performance metrics and procedure breakdowns for your practice.</p>
          </div>

          <div className="grid grid-cols-3 gap-6">
            <div className="bg-white border border-[#d4e2dc] rounded-2xl p-6 shadow-2xs">
              <p className="text-xs font-bold text-[#607368] uppercase tracking-wider">Completion Rate</p>
              <h3 className="text-4xl font-black text-[#164e43] mt-3">{completionRate}%</h3>
            </div>
            <div className="bg-white border border-[#d4e2dc] rounded-2xl p-6 shadow-2xs">
              <p className="text-xs font-bold text-[#607368] uppercase tracking-wider">Total Completed</p>
              <h3 className="text-4xl font-black text-emerald-600 mt-3">{completedPatients}</h3>
            </div>
            <div className="bg-white border border-[#d4e2dc] rounded-2xl p-6 shadow-2xs">
              <p className="text-xs font-bold text-[#607368] uppercase tracking-wider">Pending Procedures</p>
              <h3 className="text-4xl font-black text-amber-600 mt-3">{pendingPatients}</h3>
            </div>
          </div>
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
              <div className="grid grid-cols-3 gap-4">
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
                <span className="font-bold text-[#607368] block">Address Information:</span>
                <p className="font-semibold text-[#13241b] mt-1">{buildCompleteAddress(address) || 'N/A'}</p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleProfileSave} className="bg-white border border-[#d4e2dc] rounded-2xl p-6 max-w-2xl space-y-4 text-xs shadow-2xs">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-[#607368] mb-1">First Name *</label>
                  <input type="text" required value={firstName} onChange={e => setFirstName(e.target.value)} className="w-full border border-[#d4e2dc] rounded-xl p-2.5 bg-[#f5f7f6]" />
                </div>
                <div>
                  <label className="block font-bold text-[#607368] mb-1">Last Name *</label>
                  <input type="text" required value={lastName} onChange={e => setLastName(e.target.value)} className="w-full border border-[#d4e2dc] rounded-xl p-2.5 bg-[#f5f7f6]" />
                </div>
                <div>
                  <label className="block font-bold text-[#607368] mb-1">Middle Name</label>
                  <input type="text" value={middleName} onChange={e => setMiddleName(e.target.value)} className="w-full border border-[#d4e2dc] rounded-xl p-2.5 bg-[#f5f7f6]" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#607368] mb-1">Username *</label>
                  <input type="text" required value={username} onChange={e => setUsername(e.target.value)} className="w-full border border-[#d4e2dc] rounded-xl p-2.5 bg-[#f5f7f6]" />
                </div>
                <div>
                  <label className="block font-bold text-[#607368] mb-1">Email Address *</label>
                  <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full border border-[#d4e2dc] rounded-xl p-2.5 bg-[#f5f7f6]" />
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#607368] mb-1">Birthdate *</label>
                <div className="grid grid-cols-3 gap-2">
                  <select className="border border-[#d4e2dc] rounded-xl p-2.5 bg-[#f5f7f6]" value={birthMonth} onChange={e => setBirthMonth(e.target.value)}>
                    <option value="">Month</option>
                    {MONTHS.map((m, i) => (
                      <option key={m} value={i + 1} disabled={isMaxYear && (i + 1) > MAX_MONTH}>{m}</option>
                    ))}
                  </select>
                  <select className="border border-[#d4e2dc] rounded-xl p-2.5 bg-[#f5f7f6]" value={birthDay} onChange={e => setBirthDay(e.target.value)}>
                    <option value="">Day</option>
                    {DAY_OPTIONS.map((d) => (
                      <option key={d} value={d} disabled={isMaxMonth && d > MAX_DAY}>{d}</option>
                    ))}
                  </select>
                  <select className="border border-[#d4e2dc] rounded-xl p-2.5 bg-[#f5f7f6]" value={birthYear} onChange={e => setBirthYear(e.target.value)}>
                    <option value="">Year</option>
                    {BIRTH_YEAR_OPTIONS.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="bg-[#f5f7f6] border border-[#d4e2dc] rounded-2xl p-4 space-y-3">
                <span className="font-bold text-[#164e43] block">Address Information</span>
                <PhAddressSelect value={address} onChange={setAddress} />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="bg-[#164e43] hover:bg-[#0f362e] text-white px-5 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer"
                >
                  Save Changes
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingProfile(false)}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-5 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

    </div>
  );
}
