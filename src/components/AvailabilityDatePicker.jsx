import React, { useState, useMemo } from 'react';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEK_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const toDateKey = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

// "08:00" -> "8:00 AM"
export const formatTime = (t) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

/**
 * Patient-facing replica of the dentist's Availability Calendar.
 * Only dates the dentist has marked available are shown and clickable.
 *  - availabilityMap: { 'YYYY-MM-DD': { timeIn, timeOut, active } }
 *  - value / onChange: selected date key ('YYYY-MM-DD')
 */
export default function AvailabilityDatePicker({ availabilityMap = {}, value, onChange, availabilityTimeRange = '' }) {
  const today = new Date();
  const todayKey = toDateKey(today.getFullYear(), today.getMonth(), today.getDate());

  const isAvailable = (dateKey) =>
    dateKey >= todayKey && !!availabilityMap[dateKey] && availabilityMap[dateKey].active !== false;

  const initialMonth = useMemo(() => {
    const seed = value || Object.keys(availabilityMap).filter(isAvailable).sort()[0];
    if (seed) { const [y, m] = seed.split('-').map(Number); return { y, m: m - 1 }; }
    return { y: today.getFullYear(), m: today.getMonth() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [year, setYear] = useState(initialMonth.y);
  const [month, setMonth] = useState(initialMonth.m);

  const firstDayIndex = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDayIndex; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push({ dayNum: d, dateStr: toDateKey(year, month, d) });

  const availableCountThisMonth = cells.filter((c) => c && isAvailable(c.dateStr)).length;
  const hasAnyAvailability = Object.keys(availabilityMap).some(isAvailable);

  const prevMonth = () => (month === 0 ? (setMonth(11), setYear(year - 1)) : setMonth(month - 1));
  const nextMonth = () => (month === 11 ? (setMonth(0), setYear(year + 1)) : setMonth(month + 1));
  const canGoPrev = year > today.getFullYear() || (year === today.getFullYear() && month > today.getMonth());

  return (
    <div className="bg-[#F7F8F5] border border-[#d4e2dc] rounded-2xl p-5 space-y-4">
      <div className="flex justify-between items-center gap-3">
        <div className="text-xs text-[#607368] font-bold">
          Select one of the highlighted dates. Only days when the dentist is available are shown.
          {availabilityTimeRange && ` Appointment times: ${availabilityTimeRange}.`}
        </div>
        <div className="flex items-center gap-3 bg-white border border-[#d4e2dc] px-4 py-2 rounded-2xl shadow-2xs shrink-0">
          <button type="button" onClick={prevMonth} disabled={!canGoPrev} className="font-black text-[#164e43] px-2 py-1 hover:bg-[#f5f7f6] rounded-lg cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">‹</button>
          <span className="font-black text-xs text-[#13241b] min-w-[100px] text-center">{MONTHS[month]} {year}</span>
          <button type="button" onClick={nextMonth} className="font-black text-[#164e43] px-2 py-1 hover:bg-[#f5f7f6] rounded-lg cursor-pointer">›</button>
        </div>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="min-w-[340px] space-y-2">
          <div className="grid grid-cols-7 gap-2 text-center">
            {WEEK_HEADERS.map((label) => (
              <div key={label} className="bg-[#f0f5f2] text-[#164e43] py-2 rounded-xl text-xs font-black">{label}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-2">
            {cells.map((cell, idx) => {
          if (!cell) return <div key={`empty-${idx}`} className="h-20 bg-gray-50 rounded-xl opacity-40" />;
          const slot = availabilityMap[cell.dateStr];
          if (!isAvailable(cell.dateStr)) {
            return <div key={cell.dateStr} aria-hidden="true" className="h-20 bg-gray-50 rounded-xl opacity-40" />;
          }
          const isSelected = value === cell.dateStr;
          return (
            <button
              key={cell.dateStr}
              type="button"
              onClick={() => onChange(cell.dateStr)}
              className={`h-20 p-2 rounded-xl border flex flex-col justify-between text-left transition cursor-pointer shadow-2xs ${
                isSelected ? 'border-[#164e43] bg-[#e3ede6] ring-2 ring-[#164e43]' : 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100'
              }`}
            >
              <div className="flex justify-between items-center text-xs font-black w-full">
                <span className="text-emerald-800">{cell.dayNum}</span>
                <span className="text-[10px] bg-emerald-200 text-emerald-800 px-1.5 py-0.5 rounded font-bold">{isSelected ? 'Selected' : 'Open'}</span>
              </div>
              <div className="text-[10px] text-[#607368] font-semibold truncate">
                {availabilityTimeRange || `${formatTime(slot.timeIn)} – ${formatTime(slot.timeOut)}`}
              </div>
            </button>
          );
            })}
          </div>
        </div>
      </div>

      {!hasAnyAvailability && (
        <div className="text-center text-xs font-bold text-[#607368] bg-white border border-[#d4e2dc] rounded-xl py-4">
          The dentist has not opened any upcoming dates yet. Please check back later.
        </div>
      )}
      {hasAnyAvailability && availableCountThisMonth === 0 && (
        <div className="text-center text-xs font-bold text-[#607368] bg-white border border-[#d4e2dc] rounded-xl py-3">
          No available dates in {MONTHS[month]}. Try the next month ›
        </div>
      )}
    </div>
  );
}