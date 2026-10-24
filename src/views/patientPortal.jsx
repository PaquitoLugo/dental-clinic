import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Custom Interactive Patient Availability Calendar Component
function PatientAvailabilityCalendar({ selectedDentistId, selectedDate, onSelectDate }) {
  const TODAY = new Date();
  const [calendarYear, setCalendarYear] = useState(TODAY.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(TODAY.getMonth()); // 0-11

  // Retrieve saved availability from localStorage for the selected dentist
  const savedAvailability = JSON.parse(localStorage.getItem(`dentist_availability_${selectedDentistId || 2}`) || {});

  // Calendar math (Monday start)
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
    const dateStr = `${yyyy}-${mm}-${dd}`;
    calendarCells.push({ dayNum: d, dateStr });
  }

  return (
    <div className="bg-white border border-[#d4e2dc] rounded-2xl p-6 shadow-2xs space-y-4">
      {/* Header controls for Month Navigation */}
      <div className="flex justify-between items-center">
        <div>
          <h4 className="font-black text-base text-[#13241b]">Choose an Available Date</h4>
          <p className="text-xs text-[#607368]">Green active blocks indicate practitioner working hours.</p>
        </div>
        <div className="flex items-center gap-3 bg-[#f5f7f6] border border-[#d4e2dc] px-3 py-1.5 rounded-xl shadow-2xs">
          <button 
            type="button" 
            onClick={() => {
              if (calendarMonth === 0) { setCalendarMonth(11); setCalendarYear(calendarYear - 1); }
              else { setCalendarMonth(calendarMonth - 1); }
            }}
            className="font-black text-[#164e43] px-2 hover:bg-white rounded-lg cursor-pointer"
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
            className="font-black text-[#164e43] px-2 hover:bg-white rounded-lg cursor-pointer"
          >
            ›
          </button>
        </div>
      </div>

      {/* Weekday Headers */}
      <div className="grid grid-cols-7 gap-2 text-center">
        {WEEK_DAYS.map(wd => (
          <div key={wd} className="bg-[#f0f5f2] text-[#164e43] py-2 rounded-xl text-xs font-black">
            {wd}
          </div>
        ))}
      </div>

      {/* Calendar Grid Cells */}
      <div className="grid grid-cols-7 gap-2">
        {calendarCells.map((cell, idx) => {
          if (!cell) {
            return <div key={`empty-${idx}`} className="h-20 bg-gray-50 rounded-xl opacity-35"></div>;
          }

          const slot = savedAvailability[cell.dateStr];
          const isActive = slot && slot.active;
          const isSelected = selectedDate === cell.dateStr;
          const isPast = new Date(cell.dateStr) < new Date(new Date().setHours(0,0,0,0));

          return (
            <div
              key={cell.dateStr}
              onClick={() => {
                if (isPast) {
                  alert("Cannot select past dates.");
                  return;
                }
                if (!isActive) {
                  alert("The doctor is not available on this date.");
                  return;
                }
                onSelectDate(cell.dateStr, slot);
              }}
              className={`h-20 p-2 rounded-xl border flex flex-col justify-between transition shadow-2xs ${
                isPast ? 'bg-gray-100 border-gray-200 opacity-40 cursor-not-allowed' :
                isSelected ? 'border-[#164e43] bg-[#164e43] text-white ring-2 ring-[#164e43] cursor-pointer' :
                isActive ? 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100 cursor-pointer text-[#13241b]' :
                'border-[#d4e2dc] bg-white opacity-60 cursor-not-allowed'
              }`}
            >
              <div className="flex justify-between items-center text-xs font-black">
                <span className={isSelected ? 'text-white' : isActive ? 'text-emerald-900' : 'text-gray-400'}>
                  {cell.dayNum}
                </span>
                {isActive && (
                  <span className={`text-[9px] px-1 py-0.5 rounded font-bold ${
                    isSelected ? 'bg-white text-[#164e43]' : 'bg-emerald-200 text-emerald-800'
                  }`}>
                    Active
                  </span>
                )}
              </div>
              <div className={`text-[10px] font-semibold truncate ${isSelected ? 'text-emerald-100' : 'text-[#607368]'}`}>
                {isActive ? `${slot.timeIn}` : 'Closed'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PatientPortal({ onRegisterClick, onCheckAppointmentClick, onLoginClick }) {
  const [dbServices, setDbServices] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // States required for dentist availability and booking validation
  const [dentistsList, setDentistsList] = useState([]);
  const [selectedDentist, setSelectedDentist] = useState('');
  const [appointmentDate, setAppointmentDate] = useState('');
  const [appointmentTime, setAppointmentTime] = useState('');

  // Fetch active dental services directly from Supabase
  useEffect(() => {
    async function fetchPortalServices() {
      setLoading(true);
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('is_active', true);

      if (!error && data) {
        setDbServices(data);
      } else {
        console.error('Error loading dental portal services:', error?.message);
      }
      setLoading(false);
    }

    fetchPortalServices();
  }, []);

  // Fetch list of dentists/staff from Supabase
  useEffect(() => {
    async function fetchDentists() {
      const { data, error } = await supabase
        .from('staff_users')
        .select('*');
      if (data && !error) {
        setDentistsList(data);
      }
    }
    fetchDentists();
  }, []);

  // Retrieve selected dentist ID
  const dentistObj = dentistsList?.find(d => d.full_name === selectedDentist || `${d.first_name || ''} ${d.last_name || ''}`.trim() === selectedDentist);
  const dentistId = dentistObj?.id || 2;
  const savedAvailability = JSON.parse(localStorage.getItem(`dentist_availability_${dentistId}`) || '{}');

  // Get time bounds for the selected date
  const getActiveTimeRange = (dateStr) => {
    if (savedAvailability[dateStr]) {
      return {
        timeIn: savedAvailability[dateStr].timeIn,   // e.g. "08:00"
        timeOut: savedAvailability[dateStr].timeOut // e.g. "17:00"
      };
    }
    return { timeIn: "08:00", timeOut: "17:00" };
  };

  // Group dental services strictly by category from Supabase
  const servicesByCategory = dbServices.reduce((acc, service) => {
    const category = service.category || 'General Dental Services';
    if (!acc[category]) acc[category] = [];
    acc[category].push(service);
    return acc;
  }, {});

  // Category card metadata
  const categoryMeta = {
    'Preventive': {
      icon: '🪥',
      desc: 'Routine oral prophylaxis scaling, deep cleaning, fluoride treatments, and dental sealants.',
      descTag: 'Para sa regular na pagpapalinis, oral evaluation, at proteksyon laban sa pagkasira ng ngipin.'
    },
    'Restorative': {
      icon: '🦷',
      desc: 'Composite fillings, root canal therapy, inlay/onlay restorations, and structural tooth repair.',
      descTag: 'Para sa pasta, gamot sa ugat, at pag-aayos ng mga basag o sirang ngipin.'
    },
    'Prosthodontics': {
      icon: '😁',
      desc: 'Complete removable dentures, partial dentures, porcelain crowns, and fixed bridges.',
      descTag: 'Para sa pustiso at pagpapalit ng mga bawas o kulang na ngipin.'
    },
    'Surgical': {
      icon: '🩺',
      desc: 'Simple tooth extractions, complicated surgical extractions, wisdom tooth odontectomy, and minor oral surgery.',
      descTag: 'Para sa bunot ng ngipin at operasyon sa impacted wisdom tooth.'
    },
    'Orthodontics': {
      icon: '✨',
      desc: 'Traditional metal brackets, ceramic braces adjustment, archwire replacements, and alignment retainers.',
      descTag: 'Para sa pagpapagaling ng sungki, pagpapakabit ng braces, at pag-adjust ng ngipin.'
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#f4f7f6] font-sans text-[#13241b] flex flex-col overflow-y-auto">
      
      {/* TOP HEADER BAR */}
      <header className="w-full bg-white border-b border-[#d4e2dc] px-8 py-4 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#164e43] text-white flex items-center justify-center font-bold text-lg shadow-2xs">
            🦷
          </div>
          <div>
            <h1 className="font-black text-sm leading-tight text-[#13241b]">
              DENTAL CARE PORTAL
            </h1>
            <p className="text-[10px] text-[#607368] font-bold uppercase tracking-wider">
              PATIENT SCHEDULER & CHARTING SYSTEM
            </p>
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={() => {
              if (typeof onLoginClick === 'function') {
                onLoginClick();
              } else if (onCheckAppointmentClick) {
                onCheckAppointmentClick();
              }
            }}
            className="bg-white border border-[#d4e2dc] text-[#164e43] hover:bg-[#f5f7f6] px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs"
          >
            Staff / Manager Login
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 space-y-6 pb-20">
        
        {/* Hero Action Banner */}
        <div className="bg-white border border-[#d4e2dc] rounded-2xl p-8 shadow-2xs space-y-6">
          <div>
            <h2 className="text-3xl font-black text-[#13241b] tracking-tight uppercase">
              Dental Clinic Online Appointment
            </h2>
            <p className="text-xs text-[#607368] font-medium mt-2">
              Select a dental service category, choose your preferred date and time slot, and register your consultation.
            </p>
          </div>

          <div className="flex flex-wrap gap-4 pt-2">
            <button
              type="button"
              onClick={() => onRegisterClick(null)}
              className="bg-[#164e43] text-white px-6 py-3.5 rounded-xl font-extrabold text-xs shadow-xs hover:bg-[#0f362e] transition cursor-pointer"
            >
              Register an appointment
            </button>

            <button
              type="button"
              onClick={onCheckAppointmentClick}
              className="bg-white border border-[#d4e2dc] text-[#13241b] px-6 py-3.5 rounded-xl font-bold text-xs hover:bg-[#f5f7f6] transition cursor-pointer"
            >
              Check my appointment
            </button>
          </div>
        </div>

        {/* Dental Patient Reminders Box */}
        <div className="bg-[#fffbeb] border-l-4 border-l-amber-500 border border-amber-200/60 rounded-2xl p-6 shadow-2xs space-y-3">
          <h3 className="font-black text-sm text-[#13241b] uppercase tracking-wider">
            Reminders (Mga Paalala):
          </h3>
          <p className="text-xs text-[#4b5563] leading-relaxed">
            Please arrive 10 minutes prior to your scheduled dental appointment time. If you have active tooth pain, swelling, or facial trauma requiring immediate emergency attention, please contact our clinic front desk immediately.
          </p>
          <p className="text-xs text-[#6b7280] italic leading-relaxed pt-1">
            Mangyaring dumating 10 minuto bago ang nakatakdang oras ng appointment. Kung mayroong matinding sakit ng ngipin o pamamaga na nangangailangan ng agarang atensyon, tumawag agad sa aming clinic desk.
          </p>
        </div>

        {/* Practitioner Selection & Interactive Calendar Grid */}
        <div className="bg-white border border-[#d4e2dc] rounded-2xl p-8 shadow-2xs space-y-6">
          <div>
            <h3 className="font-black text-sm text-[#13241b] uppercase tracking-wider">
              Choose Dentist & Available Schedule
            </h3>
            <p className="text-xs text-[#607368] mt-1">Select your practitioner first to reveal their live interactive shift calendar.</p>
          </div>

          <div className="space-y-2">
            <label className="block font-bold text-[#13241b] text-xs">Select Practitioner *</label>
              <select
                value={selectedDentist}
                onChange={(e) => {
                  setSelectedDentist(e.target.value);
                  setAppointmentDate('');
                  setAppointmentTime('');
                }}
                className="w-full border border-[#d4e2dc] rounded-xl p-3 bg-white font-bold text-[#13241b] text-xs">
                <option value="">-- Choose Practitioner --</option>
                {dentistsList
                  .filter(d => d.role === 'dentist')
                  .map(d => {
                    const name = d.full_name || `${d.first_name || ''} ${d.last_name || ''}`.trim();
                    return <option key={d.id} value={name}>{name}</option>;
                  })}
              </select>
          </div>

          {selectedDentist ? (
            <div className="space-y-4 pt-2">
              <PatientAvailabilityCalendar 
                selectedDentistId={dentistObj?.id}
                selectedDate={appointmentDate}
                onSelectDate={(dateStr, slot) => {
                  setAppointmentDate(dateStr);
                }}
              />

              {appointmentDate && (
                <div className="bg-[#f8faf9] border border-[#d4e2dc] p-4 rounded-2xl space-y-2 text-xs">
                  <div className="font-black text-[#13241b]">Selected Date: {appointmentDate}</div>
                  <div>
                    <label className="block font-bold text-[#13241b] mb-1">Appointment Time *</label>
                    <input 
                      type="time"
                      value={appointmentTime}
                      onChange={(e) => {
                        const chosenTime = e.target.value;
                        const { timeIn, timeOut } = getActiveTimeRange(appointmentDate);
                        if (chosenTime < timeIn || chosenTime > timeOut) {
                          alert(`Selected time is outside the dentist's working hours (${timeIn} - ${timeOut}) for this date.`);
                          setAppointmentTime('');
                          return;
                        }
                        setAppointmentTime(chosenTime);
                      }}
                      className="w-full border border-[#d4e2dc] rounded-xl p-3 bg-white font-bold text-[#13241b]"
                    />
                    <p className="text-[10px] text-[#607368] mt-1">
                      * Must fall within dentist's shift hours for this date.
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-6 bg-[#f8faf9] border border-[#d4e2dc] rounded-xl text-center text-xs text-gray-400 font-medium italic">
              Please select a practitioner above to view their interactive availability calendar.
            </div>
          )}
        </div>

        {/* Categorized Card Modules Grid */}
        <div className="bg-white border border-[#d4e2dc] rounded-2xl p-8 shadow-2xs space-y-6">
          <div>
            <h3 className="text-xs font-bold text-[#607368] uppercase tracking-wider">
              Anong serbisyong dental ang kailangan mo?
            </h3>
          </div>

          {loading ? (
            <div className="py-8 text-center text-xs font-bold text-[#607368]">
              Loading dental service catalog from Supabase...
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {Object.entries(servicesByCategory).map(([categoryName, catServices]) => {
                const meta = categoryMeta[categoryName] || {
                  icon: '🦷',
                  desc: 'Specialized dental care services.',
                  descTag: 'Serbisyong dental.'
                };
                return (
                  <div key={categoryName} className="border border-[#d4e2dc] rounded-2xl p-6 bg-[#f8faf9] space-y-4 shadow-2xs">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{meta.icon}</span>
                      <h4 className="font-black text-base text-[#13241b]">{categoryName}</h4>
                    </div>
                    <p className="text-xs text-[#607368]">{meta.desc}</p>
                    <p className="text-[11px] text-[#6b7280] italic">{meta.descTag}</p>
                    <div className="border-t border-[#d4e2dc] pt-3 space-y-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#164e43]">
                        Enclosed Services ({catServices.length}):
                      </span>
                      <ul className="space-y-1 text-xs">
                        {catServices.map(s => (
                          <li key={s.id} className="flex justify-between items-center bg-white p-2 rounded-xl border border-[#d4e2dc]">
                            <span className="font-bold text-[#13241b]">{s.service_name}</span>
                            <span className="font-extrabold text-[#164e43]">₱{s.price}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-[#fffbeb] border-l-4 border-l-amber-500 border border-amber-200/60 rounded-2xl p-6 shadow-2xs space-y-2">
          <h3 className="font-black text-lg text-[#13241b]">
            Need help booking your appointment?
          </h3>
          <p className="text-xs text-[#4b5563]">
            Ask our dental clinic desk or call our direct hotlines for booking assistance. Do not share your reference code publicly.
          </p>
        </div>

      </main>
    </div>
  );
}