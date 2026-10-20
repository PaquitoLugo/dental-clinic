import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

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
  saveToothChart, 
  fetchPatientChart, 
  updateAppointmentStatus, 
  user, 
  currentView 
}) {
  // Charting state
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [selectedTooth, setSelectedTooth] = useState(null);
  const [clinicalFinding, setClinicalFinding] = useState('Healthy');
  const [diagnosisNotes, setDiagnosisNotes] = useState('');

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
  const [street, setStreet] = useState('');
  const [regionCode, setRegionCode] = useState('');
  const [cityCode, setCityCode] = useState('');
  const [barangayCode, setBarangayCode] = useState('');

  // PSGC Lists & UI State
  const [regionsList, setRegionsList] = useState([]);
  const [citiesList, setCitiesList] = useState([]);
  const [barangaysList, setBarangaysList] = useState([]);
  const [loadingRegions, setLoadingRegions] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);
  const [loadingBarangays, setLoadingBarangays] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState('');

  // Fetch practitioner profile from Supabase on mount
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
        setStreet(data.street || '');
        setRegionCode(data.region_code || '');
        if (data.region_code) fetchCitiesForRegion(data.region_code, data.city_code);
        if (data.city_code) fetchBarangaysForCity(data.city_code, data.barangay_code);
      }
    }
    fetchDentistProfile();
  }, [user]);

  async function fetchCitiesForRegion(regCode, selectedCity) {
    setLoadingCities(true);
    try {
      const res = await fetch(`https://psgc.cloud/api/regions/${regCode}/cities-municipalities`);
      const data = await res.json();
      setCitiesList(data);
      if (selectedCity) setCityCode(selectedCity);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingCities(false);
    }
  }

  async function fetchBarangaysForCity(citCode, selectedBrgy) {
    setLoadingBarangays(true);
    try {
      const res = await fetch(`https://psgc.cloud/api/cities-municipalities/${citCode}/barangays`);
      const data = await res.json();
      setBarangaysList(data);
      if (selectedBrgy) setBarangayCode(selectedBrgy);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingBarangays(false);
    }
  }

  useEffect(() => {
    async function fetchRegions() {
      setLoadingRegions(true);
      try {
        const res = await fetch("https://psgc.cloud/api/regions");
        const data = await res.json();
        setRegionsList(data);
      } catch (err) {
        console.error("Failed to fetch regions:", err);
      } finally {
        setLoadingRegions(false);
      }
    }
    fetchRegions();
  }, []);

  const handleRegionChange = async (ev) => {
    const code = ev.target.value;
    setRegionCode(code);
    setCityCode('');
    setBarangayCode('');
    setCitiesList([]);
    setBarangaysList([]);
    if (!code) return;
    fetchCitiesForRegion(code);
  };

  const handleCityChange = async (ev) => {
    const code = ev.target.value;
    setCityCode(code);
    setBarangayCode('');
    setBarangaysList([]);
    if (!code) return;
    fetchBarangaysForCity(code);
  };

  const dentistName = `${firstName} ${middleName ? middleName + ' ' : ''}${lastName}`.trim();
  const assignedAppointments = appointments.filter(a => a.assigned_dentist === dentistName || !a.assigned_dentist);

  const totalPatients = assignedAppointments.length;
  const pendingPatients = assignedAppointments.filter(a => a.status === 'Pending' || a.status === 'Checked-in').length;
  const completedPatients = assignedAppointments.filter(a => a.status === 'Completed').length;

  const filteredLogs = assignedAppointments.filter(a => {
    const matchesSearch = a.patient_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesService = filterService === 'All' || a.service_name === filterService;
    const matchesStatus = filterStatus === 'All' || a.status === filterStatus;
    const matchesDate = !filterDate || a.appointment_date === filterDate;
    return matchesSearch && matchesService && matchesStatus && matchesDate;
  });

  const handleToothClick = (toothNum) => setSelectedTooth(toothNum);

  const handleSaveChart = async (e) => {
    e.preventDefault();
    if (!selectedAppointment || !selectedTooth) return;

    await saveToothChart({
      patient_name: selectedAppointment.patient_name,
      tooth_number: selectedTooth,
      clinical_finding: clinicalFinding,
      diagnosis_notes: diagnosisNotes
    });

    alert(`Tooth #${selectedTooth} updated successfully!`);
    setSelectedTooth(null);
    setDiagnosisNotes('');
  };

  // Mark patient procedure as completed in Supabase
  const handleMarkAsDone = async (appointmentId) => {
    const confirmed = window.confirm("Are you sure you want to mark this procedure as completed?");
    if (!confirmed) return;

    if (updateAppointmentStatus) {
      await updateAppointmentStatus(appointmentId, 'Completed');
      alert("Patient procedure marked as Completed!");
    } else {
      alert("Error: updateAppointmentStatus function is missing from props.");
    }
  };

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
          street: street.trim(),
          region_code: regionCode,
          city_code: cityCode,
          barangay_code: barangayCode
        })
        .eq('id', targetId);

      if (error) {
        alert('Failed to update profile: ' + error.message);
      } else {
        setProfileSuccess('Profile updated and synchronized with database!');
        setIsEditingProfile(false);
      }
    } catch (err) {
      console.error(err);
      alert('Unexpected error updating profile.');
    }
  };

  const isMaxYear = Number(birthYear) === MAX_YEAR;
  const isMaxMonth = isMaxYear && Number(birthMonth) === MAX_MONTH;

  return (
    <div className="h-full w-full bg-white border border-[#d4e2dc] rounded-2xl p-6 shadow-2xs flex flex-col overflow-hidden">
      
      {/* 1. DASHBOARD VIEW */}
      {currentView === 'dashboard' && (
        <div className="flex-1 overflow-y-auto space-y-6">
          <div>
            <h2 className="font-black text-2xl text-[#13241b]">Dentist Dashboard</h2>
            <p className="text-xs text-[#607368]">Overview of your patient load and clinical metrics.</p>
          </div>

          <div className="grid grid-cols-3 gap-6">
            <div className="bg-[#f8faf9] border border-[#d4e2dc] rounded-2xl p-6 shadow-2xs">
              <p className="text-xs font-bold text-[#607368] uppercase tracking-wider">Total Patients Assigned</p>
              <h3 className="text-4xl font-black text-[#164e43] mt-3">{totalPatients}</h3>
            </div>
            <div className="bg-[#f8faf9] border border-[#d4e2dc] rounded-2xl p-6 shadow-2xs">
              <p className="text-xs font-bold text-[#607368] uppercase tracking-wider">Pending / Waiting Patients</p>
              <h3 className="text-4xl font-black text-amber-600 mt-3">{pendingPatients}</h3>
            </div>
            <div className="bg-[#f8faf9] border border-[#d4e2dc] rounded-2xl p-6 shadow-2xs">
              <p className="text-xs font-bold text-[#607368] uppercase tracking-wider">Completed Procedures</p>
              <h3 className="text-4xl font-black text-emerald-600 mt-3">{completedPatients}</h3>
            </div>
          </div>

          <div className="border-t border-[#d4e2dc] pt-6">
            <h4 className="font-black text-base text-[#13241b] mb-4">Recent Patient Queue</h4>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#d4e2dc] text-[11px] font-bold text-[#607368] uppercase">
                  <th className="py-3 px-2">Patient Name</th>
                  <th className="py-3 px-2">Service</th>
                  <th className="py-3 px-2">Schedule</th>
                  <th className="py-3 px-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f5f2] text-xs">
                {assignedAppointments.slice(0, 5).map(a => (
                  <tr key={a.id} className="hover:bg-[#f8faf9]">
                    <td className="py-3 px-2 font-bold text-[#13241b]">{a.patient_name}</td>
                    <td className="py-3 px-2 text-[#607368]">{a.service_name}</td>
                    <td className="py-3 px-2">{a.appointment_date} @ {a.appointment_time}</td>
                    <td className="py-3 px-2 text-right">
                      <span className={`px-2.5 py-0.5 rounded-md font-bold text-[11px] ${
                        a.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-[#e3ede6] text-[#164e43]'
                      }`}>
                        {a.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. PATIENT LOGS VIEW (WITH "MARK AS DONE" ACTION BUTTON) */}
      {currentView === 'logs' && (
        <div className="flex-1 overflow-y-auto space-y-4 flex flex-col">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="font-black text-2xl text-[#13241b]">Patient Logs</h2>
              <p className="text-xs text-[#607368]">Search, filter, and complete active facility visits.</p>
            </div>
            <span className="text-xs bg-[#e3ede6] text-[#164e43] px-3 py-1 rounded-full font-bold">
              Showing: {filteredLogs.length} of {assignedAppointments.length}
            </span>
          </div>

          {/* Search & Filters Toolbar */}
          <div className="grid grid-cols-4 gap-3 bg-[#f8faf9] p-4 rounded-2xl border border-[#d4e2dc]">
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
                <option value="Checked-in">Checked-in</option>
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

          {/* Logs Table with "Mark as Done" Column */}
          <div className="flex-1 overflow-y-auto">
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
                      <td className="py-3 px-2 text-[#607368]">{a.contact_number || 'N/A'}</td>
                      <td className="py-3 px-2 font-semibold text-[#164e43]">{a.service_name}</td>
                      <td className="py-3 px-2">{a.appointment_date} @ {a.appointment_time}</td>
                      <td className="py-3 px-2">
                        <span className={`px-2.5 py-0.5 rounded-md font-bold text-[11px] ${
                          a.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-[#e3ede6] text-[#164e43]'
                        }`}>
                          {a.status}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-right">
                        {a.status !== 'Completed' ? (
                          <button
                            onClick={() => handleMarkAsDone(a.id)}
                            className="bg-[#164e43] hover:bg-[#0f362e] text-white px-3.5 py-1.5 rounded-xl font-bold text-[11px] transition cursor-pointer shadow-2xs"
                          >
                            ✓ Mark as Done
                          </button>
                        ) : (
                          <span className="text-gray-400 font-medium italic">Finished</span>
                        )}
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

      {/* 3. DENTAL CHARTING VIEW */}
      {currentView === 'charting' && (
        <div className="h-full grid grid-cols-12 gap-6 overflow-hidden">
          <div className="col-span-4 flex flex-col gap-4 overflow-y-auto pr-2">
            <div>
              <h3 className="font-black text-lg text-[#13241b]">Select Patient for Charting</h3>
              <select 
                className="w-full border border-[#d4e2dc] rounded-xl p-3 text-xs bg-[#f5f7f6] mt-2 font-bold"
                value={selectedAppointment ? selectedAppointment.id : ''}
                onChange={e => {
                  const found = assignedAppointments.find(a => a.id === Number(e.target.value));
                  setSelectedAppointment(found || null);
                }}
              >
                <option value="">-- Choose Patient --</option>
                {assignedAppointments.map(a => (
                  <option key={a.id} value={a.id}>{a.patient_name} ({a.service_name})</option>
                ))}
              </select>
            </div>

            {selectedAppointment && (
              <form onSubmit={handleSaveChart} className="bg-[#f8faf9] border border-[#d4e2dc] rounded-2xl p-4 space-y-4">
                <h4 className="font-bold text-xs text-[#164e43] uppercase">
                  {selectedTooth ? `Editing Tooth #${selectedTooth}` : 'Click a tooth on the arch ➔'}
                </h4>
                <div>
                  <label className="block text-xs font-bold text-[#607368] mb-1">Clinical Finding</label>
                  <select 
                    value={clinicalFinding} 
                    onChange={e => setClinicalFinding(e.target.value)}
                    className="w-full border border-[#d4e2dc] rounded-xl p-2.5 text-xs bg-white"
                  >
                    <option value="Healthy">Healthy (HEA)</option>
                    <option value="Caries">Caries (CAR)</option>
                    <option value="Filled">Filled (FIL)</option>
                    <option value="Missing">Missing (MIS)</option>
                    <option value="Crown">Crown (CRO)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#607368] mb-1">Diagnosis Notes</label>
                  <textarea 
                    rows="3" 
                    value={diagnosisNotes} 
                    onChange={e => setDiagnosisNotes(e.target.value)}
                    placeholder="Add clinical observations..."
                    className="w-full border border-[#d4e2dc] rounded-xl p-2.5 text-xs bg-white"
                  />
                </div>
                <button 
                  type="submit" 
                  disabled={!selectedTooth}
                  className="w-full bg-[#164e43] text-white py-3 rounded-xl font-bold text-xs hover:bg-[#0f362e] transition cursor-pointer disabled:opacity-50"
                >
                  Update Tooth Record
                </button>
              </form>
            )}
          </div>

          <div className="col-span-8 overflow-y-auto border border-[#d4e2dc] rounded-2xl p-4 bg-[#f8faf9]">
            <h4 className="font-black text-sm text-[#13241b] mb-3">FDI Adult Dental Arch (Click tooth to select)</h4>
            <div className="grid grid-cols-8 gap-2">
              {Array.from({ length: 32 }, (_, i) => i + 1).map(toothNum => (
                <button
                  key={toothNum}
                  type="button"
                  onClick={() => handleToothClick(toothNum)}
                  className={`p-4 rounded-xl border font-bold text-xs flex flex-col items-center justify-center transition cursor-pointer ${selectedTooth === toothNum ? 'bg-[#164e43] text-white border-[#164e43]' : 'bg-white border-[#d4e2dc] text-[#13241b] hover:bg-[#e3ede6]'}`}
                >
                  <span>#{toothNum}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 4. PROFILE VIEW */}
      {currentView === 'profile' && (
        <div className="flex-1 overflow-y-auto space-y-6">
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
            <div className="bg-[#f8faf9] border border-[#d4e2dc] rounded-2xl p-6 max-w-2xl space-y-4 text-xs">
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
                <p className="font-semibold text-[#13241b] mt-1">{street ? `${street}, ` : ''}Region: {regionCode || 'N/A'}, City: {cityCode || 'N/A'}</p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleProfileSave} className="bg-[#f8faf9] border border-[#d4e2dc] rounded-2xl p-6 max-w-2xl space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-[#607368] mb-1">First Name *</label>
                  <input type="text" required value={firstName} onChange={e => setFirstName(e.target.value)} className="w-full border border-[#d4e2dc] rounded-xl p-2.5 bg-white" />
                </div>
                <div>
                  <label className="block font-bold text-[#607368] mb-1">Last Name *</label>
                  <input type="text" required value={lastName} onChange={e => setLastName(e.target.value)} className="w-full border border-[#d4e2dc] rounded-xl p-2.5 bg-white" />
                </div>
                <div>
                  <label className="block font-bold text-[#607368] mb-1">Middle Name</label>
                  <input type="text" value={middleName} onChange={e => setMiddleName(e.target.value)} className="w-full border border-[#d4e2dc] rounded-xl p-2.5 bg-white" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#607368] mb-1">Username *</label>
                  <input type="text" required value={username} onChange={e => setUsername(e.target.value)} className="w-full border border-[#d4e2dc] rounded-xl p-2.5 bg-white" />
                </div>
                <div>
                  <label className="block font-bold text-[#607368] mb-1">Email Address *</label>
                  <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full border border-[#d4e2dc] rounded-xl p-2.5 bg-white" />
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#607368] mb-1">Birthdate *</label>
                <div className="grid grid-cols-3 gap-2">
                  <select className="border border-[#d4e2dc] rounded-xl p-2.5 bg-white" value={birthMonth} onChange={e => setBirthMonth(e.target.value)}>
                    <option value="">Month</option>
                    {MONTHS.map((m, i) => (
                      <option key={m} value={i + 1} disabled={isMaxYear && (i + 1) > MAX_MONTH}>{m}</option>
                    ))}
                  </select>
                  <select className="border border-[#d4e2dc] rounded-xl p-2.5 bg-white" value={birthDay} onChange={e => setBirthDay(e.target.value)}>
                    <option value="">Day</option>
                    {DAY_OPTIONS.map((d) => (
                      <option key={d} value={d} disabled={isMaxMonth && d > MAX_DAY}>{d}</option>
                    ))}
                  </select>
                  <select className="border border-[#d4e2dc] rounded-xl p-2.5 bg-white" value={birthYear} onChange={e => setBirthYear(e.target.value)}>
                    <option value="">Year</option>
                    {BIRTH_YEAR_OPTIONS.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="bg-white border border-[#d4e2dc] rounded-2xl p-4 space-y-3">
                <span className="font-bold text-[#164e43] block">Address Information</span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-[#607368] mb-1">No. / Block *</label>
                    <input className="w-full border border-[#d4e2dc] rounded-xl p-2 bg-white" value={street} onChange={e => setStreet(e.target.value)} />
                  </div>
                  <div>
                    <label className="block font-bold text-[#607368] mb-1">Region *</label>
                    <select className="w-full border border-[#d4e2dc] rounded-xl p-2 bg-white" value={regionCode} onChange={handleRegionChange} disabled={loadingRegions}>
                      <option value="">{loadingRegions ? "Loading..." : "Select Region"}</option>
                      {regionsList.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-[#607368] mb-1">City *</label>
                    <select className="w-full border border-[#d4e2dc] rounded-xl p-2 bg-white" value={cityCode} onChange={handleCityChange} disabled={!regionCode || loadingCities}>
                      <option value="">{loadingCities ? "Loading..." : "Select City"}</option>
                      {citiesList.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-[#607368] mb-1">Barangay *</label>
                    <select className="w-full border border-[#d4e2dc] rounded-xl p-2 bg-white" value={barangayCode} onChange={e => setBarangayCode(e.target.value)} disabled={!cityCode || loadingBarangays}>
                      <option value="">{loadingBarangays ? "Loading..." : "Select Barangay"}</option>
                      {barangaysList.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
                    </select>
                  </div>
                </div>
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