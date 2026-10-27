import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { recordActivity } from '../lib/activityLog';

// FDI two-digit notation (ISO 3950), adult dentition, viewed as the dentist faces the patient:
// the patient's right side is on the left of the screen.
const UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
const SUPERNUMERARY_TYPES = ['Mesiodens', 'Distomolar', 'Paramolar', 'Supplemental tooth', 'Other'];
const SUPERNUMERARY_LOCATIONS = ['Upper midline', 'Upper right', 'Upper left', 'Lower right', 'Lower left'];
const QUADRANT_LOCATIONS = SUPERNUMERARY_LOCATIONS.slice(1);
const FIXED_SUPERNUMERARY_LOCATIONS = { Mesiodens: 'Upper midline' };
const locationsForSupernumeraryType = (type) =>
  FIXED_SUPERNUMERARY_LOCATIONS[type]
    ? [FIXED_SUPERNUMERARY_LOCATIONS[type]]
    : ['Distomolar', 'Paramolar'].includes(type)
      ? QUADRANT_LOCATIONS
      : SUPERNUMERARY_LOCATIONS;
const defaultLocationForSupernumeraryType = (type, currentLocation = '') => {
  const locations = locationsForSupernumeraryType(type);
  return locations.includes(currentLocation) ? currentLocation : locations[0];
};

export const TOOTH_STATUSES = {
  healthy:         { label: 'Healthy',          fill: '#ffffff', stroke: '#164e43' },
  cavity:          { label: 'Cavity / Decay',   fill: '#f87171', stroke: '#b91c1c' },
  filled:          { label: 'Filled',           fill: '#60a5fa', stroke: '#1d4ed8' },
  crown:           { label: 'Crown',            fill: '#fbbf24', stroke: '#b45309' },
  root_canal:      { label: 'Root Canal',       fill: '#a78bfa', stroke: '#6d28d9' },
  implant:         { label: 'Implant',          fill: '#94a3b8', stroke: '#334155' },
  impacted:        { label: 'Impacted',         fill: '#fb923c', stroke: '#c2410c' },
  needs_treatment: { label: 'Needs Treatment',  fill: '#f472b6', stroke: '#be185d' },
  missing:         { label: 'Missing / Extracted', fill: 'none', stroke: '#6b7280' },
};

const toothKind = (n) => {
  const d = n % 10;
  if (d <= 2) return 'incisor';
  if (d === 3) return 'canine';
  if (d <= 5) return 'premolar';
  return 'molar';
};

const toothName = (n) => {
  const q = Math.floor(n / 10);
  const side = q === 1 || q === 4 ? 'Right' : 'Left';
  const arch = q <= 2 ? 'Upper' : 'Lower';
  const kind = { incisor: n % 10 === 1 ? 'Central Incisor' : 'Lateral Incisor', canine: 'Canine', premolar: n % 10 === 4 ? '1st Premolar' : '2nd Premolar', molar: { 6: '1st Molar', 7: '2nd Molar', 8: '3rd Molar (Wisdom)' }[n % 10] }[toothKind(n)];
  return `${arch} ${side} ${kind}`;
};

const formatDateTime = (iso) =>
  new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

const chartWriteError = (action, error) => {
  const message = error?.message || 'Unknown database error.';
  const guidance = message.toLowerCase().includes('row-level security')
    ? ' Apply pending Supabase migrations with supabase db push, and confirm the patient has an In Treatment appointment assigned to this dentist.'
    : '';
  return `${action}: ${message}.${guidance}`;
};

const timeAgo = (iso) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.round(days / 30);
  return months < 12 ? `${months} mo ago` : `${Math.round(months / 12)} yr ago`;
};

const RECENT_DAYS = 7;

// One tooth drawn upright for the upper arch (roots on top). Lower teeth are flipped vertically.
function ToothShape({ number, status, selected, flipped, onClick }) {
  const kind = toothKind(number);
  const s = TOOTH_STATUSES[status] || TOOTH_STATUSES.healthy;
  const w = { incisor: 22, canine: 22, premolar: 26, molar: 34 }[kind];
  const cx = 22;
  const left = cx - w / 2;
  const right = cx + w / 2;
  const crown = `M ${left} 30 Q ${left} 26 ${left + 4} 26 L ${right - 4} 26 Q ${right} 26 ${right} 30 L ${right} 44 Q ${right} 56 ${right - 5} 58 Q ${cx} 62 ${left + 5} 58 Q ${left} 56 ${left} 44 Z`;
  const roots = kind === 'molar'
    ? `M ${left + 3} 28 L ${left + 5} 4 L ${left + 12} 28 Z M ${right - 12} 28 L ${right - 5} 4 L ${right - 3} 28 Z`
    : `M ${cx - w / 3} 28 L ${cx} 3 L ${cx + w / 3} 28 Z`;
  const missing = status === 'missing';

  return (
    <g
      transform={flipped ? 'translate(0,66) scale(1,-1)' : undefined}
      onClick={onClick}
      style={{ cursor: 'pointer' }}
    >
      <rect x="0" y="0" width="44" height="66" fill="transparent" />
      <path d={roots} fill={missing ? 'none' : '#f3e9d8'} stroke={missing ? '#9ca3af' : '#c7b79b'} strokeWidth="1" strokeDasharray={missing ? '3 2' : undefined} />
      <path d={crown} fill={s.fill} stroke={selected ? '#164e43' : s.stroke} strokeWidth={selected ? 2.6 : 1.4} strokeDasharray={missing ? '4 3' : undefined} />
      {status === 'implant' && (<path d={`M ${cx - 6} 36 H ${cx + 6} M ${cx - 6} 42 H ${cx + 6} M ${cx - 6} 48 H ${cx + 6}`} stroke="#334155" strokeWidth="1.5" />)}
      {status === 'root_canal' && (<path d={`M ${cx} 8 V 28`} stroke="#6d28d9" strokeWidth="2" />)}
      {status === 'filled' && (<circle cx={cx} cy="40" r="4" fill="#1d4ed8" opacity="0.7" />)}
      {missing && (<path d={`M ${left + 4} 34 L ${right - 4} 54 M ${right - 4} 34 L ${left + 4} 54`} stroke="#6b7280" strokeWidth="2" />)}
    </g>
  );
}

function Arch({ numbers, chart, selected, onSelect, flipped, recent }) {
  return (
    <svg viewBox={`0 0 ${numbers.length * 46} 90`} className="w-full" role="group" aria-label={flipped ? 'Lower teeth' : 'Upper teeth'}>
      {numbers.map((n, i) => {
        const x = i * 46 + 1;
        const midGap = i === 8 ? 4 : 0;
        const label = (
          <text x={22} y={flipped ? 12 : 86} textAnchor="middle" fontSize="11" fontWeight="700" fill={selected === n ? '#164e43' : '#607368'}>{n}</text>
        );
        return (
          <g key={n} transform={`translate(${x + midGap},${flipped ? 20 : 0})`}>
            <ToothShape number={n} status={chart[n]?.status || 'healthy'} selected={selected === n} flipped={flipped} onClick={() => onSelect(n)} />
            {recent.has(String(n)) && <circle cx={37} cy={flipped ? -12 : 76} r={3.5} fill="#f59e0b"><title>Changed in the last {RECENT_DAYS} days</title></circle>}
            {flipped ? (
              <text x={22} y={-8} textAnchor="middle" fontSize="11" fontWeight="700" fill={selected === n ? '#164e43' : '#607368'}>{n}</text>
            ) : (
              <text x={22} y={80} textAnchor="middle" fontSize="11" fontWeight="700" fill={selected === n ? '#164e43' : '#607368'}>{n}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function SupernumeraryChartRow({ teeth, selected, onSelect, recent }) {
  if (teeth.length === 0) return null;
  const groups = SUPERNUMERARY_LOCATIONS.map((location) => ({
    location,
    teeth: teeth.filter((tooth) => tooth.tooth_location === location),
  })).filter((group) => group.teeth.length > 0);

  return (
    <section className="border-t border-dashed border-[#d4e2dc] pt-3" aria-label="Supernumerary teeth in chart">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h4 className="text-[10px] font-black uppercase tracking-wider text-[#607368]">Additional teeth · select a tooth to chart its status</h4>
        <span className="rounded-full bg-[#e3ede6] px-2 py-0.5 text-[10px] font-bold text-[#164e43]">{teeth.length}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {groups.map(({ location, teeth: locationTeeth }) => (
          <div key={location} className="min-w-0 rounded-xl border border-[#e5ece8] bg-[#f8faf9] p-2">
            <p className="truncate text-center text-[9px] font-bold uppercase tracking-wide text-[#607368]">{location}</p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {locationTeeth.map((tooth) => {
                const status = TOOTH_STATUSES[tooth.status] || TOOTH_STATUSES.healthy;
                const missing = tooth.status === 'missing';
                return (
                  <button
                    key={tooth.tooth_number}
                    type="button"
                    onClick={() => onSelect(tooth.tooth_number)}
                    aria-label={`${tooth.tooth_number}, ${tooth.tooth_type || 'supernumerary tooth'}, ${location}, ${status.label}`}
                    aria-pressed={String(selected) === String(tooth.tooth_number)}
                    className={`flex min-w-14 flex-col items-center rounded-lg border px-2 py-1.5 transition hover:bg-white ${
                      String(selected) === String(tooth.tooth_number)
                        ? 'border-[#164e43] bg-[#eaf4ef] ring-2 ring-[#164e43]'
                        : 'border-transparent bg-transparent'
                    }`}
                  >
                    <svg viewBox="0 0 44 66" className="h-12 w-10" aria-hidden="true">
                      <path
                        d="M 15 28 L 18 6 L 22 27 L 26 6 L 29 28"
                        fill={missing ? 'none' : '#f3e9d8'}
                        stroke={missing ? '#9ca3af' : '#c7b79b'}
                        strokeWidth="1.5"
                        strokeDasharray={missing ? '3 2' : undefined}
                      />
                      <path
                        d="M 12 30 Q 12 26 16 26 L 28 26 Q 32 26 32 30 L 32 44 Q 32 56 27 59 Q 22 62 17 59 Q 12 56 12 44 Z"
                        fill={status.fill}
                        stroke={String(selected) === String(tooth.tooth_number) ? '#164e43' : status.stroke}
                        strokeWidth={String(selected) === String(tooth.tooth_number) ? 2.6 : 1.8}
                        strokeDasharray={missing ? '4 3' : undefined}
                      />
                      {missing && <path d="M 16 34 L 28 52 M 28 34 L 16 52" stroke="#6b7280" strokeWidth="2" />}
                      {tooth.status === 'implant' && <path d="M 16 36 H 28 M 16 42 H 28 M 16 48 H 28" stroke="#334155" strokeWidth="1.5" />}
                    </svg>
                    <span className="mt-1 text-[10px] font-black text-[#164e43]">{tooth.tooth_number}</span>
                    <span className="max-w-24 truncate text-[9px] text-[#607368]">{tooth.tooth_type || 'Extra tooth'}</span>
                    {recent.has(String(tooth.tooth_number)) && <span className="mt-0.5 text-[8px] font-bold text-amber-700">Recently updated</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Interactive dental chart.
 *  - patientId: staff_users.id of the patient
 *  - canEdit:   true for the dentist, false (read-only) for the patient
 */
export default function ToothChart({ patientId, patientName, canEdit = false, editorName = '', readOnlyReason = '', beforeSave = null, activityUser = null }) {
  const [chart, setChart] = useState({});
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [draftStatus, setDraftStatus] = useState('healthy');
  const [draftNotes, setDraftNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [showSupernumeraryForm, setShowSupernumeraryForm] = useState(false);
  const [supernumeraryType, setSupernumeraryType] = useState(SUPERNUMERARY_TYPES[0]);
  const [supernumeraryLocation, setSupernumeraryLocation] = useState(SUPERNUMERARY_LOCATIONS[0]);
  const [addingSupernumerary, setAddingSupernumerary] = useState(false);

  const load = useCallback(async () => {
    if (!patientId) { setChart({}); return; }
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase.from('tooth_chart').select('*').eq('patient_id', patientId);
    if (err) {
      setError(`Could not load the tooth chart: ${err.message}. Verify the tooth-chart tables and apply pending migrations with supabase db push.`);
      setChart({});
    } else {
      setChart(Object.fromEntries((data || []).map((r) => [r.tooth_number, r])));
    }
    const { data: logs, error: logsErr } = await supabase
      .from('tooth_chart_history').select('*').eq('patient_id', patientId).order('created_at', { ascending: false });
    if (logsErr) {
      setHistory([]);
      if (!err) setError(`Could not load tooth history: ${logsErr.message}. Apply pending tooth-chart access migrations with supabase db push.`);
    } else {
      setHistory(logs || []);
    }
    setLoading(false);
  }, [patientId]);

  useEffect(() => { setSelected(null); setSavedMsg(''); load(); }, [load]);

  const selectTooth = (n) => {
    setSelected(n);
    setDraftStatus(chart[n]?.status || 'healthy');
    setDraftNotes(chart[n]?.notes || '');
    const type = chart[n]?.tooth_type || SUPERNUMERARY_TYPES[0];
    setSupernumeraryType(type);
    setSupernumeraryLocation(defaultLocationForSupernumeraryType(type, chart[n]?.tooth_location));
    setSavedMsg('');
  };

  const supernumeraryTeeth = Object.values(chart)
    .filter((tooth) => String(tooth.tooth_number).startsWith('SUP-'))
    .sort((a, b) => String(a.tooth_number).localeCompare(String(b.tooth_number), undefined, { numeric: true }));
  const changeSupernumeraryType = (type) => {
    setSupernumeraryType(type);
    setSupernumeraryLocation((location) => defaultLocationForSupernumeraryType(type, location));
  };

  const addSupernumerary = async () => {
    if (!canEdit || !patientId || addingSupernumerary) return;
    setAddingSupernumerary(true);
    setError('');
    try {
      if (beforeSave) {
        const blocked = await beforeSave();
        if (blocked) {
          setError(blocked);
          return;
        }
      }
      const nextNumber = supernumeraryTeeth.reduce((largest, tooth) => {
        const match = /^SUP-(\d+)$/.exec(String(tooth.tooth_number));
        return match ? Math.max(largest, Number(match[1])) : largest;
      }, 0) + 1;
      const number = `SUP-${String(nextNumber).padStart(2, '0')}`;
      const row = {
        patient_id: patientId,
        tooth_number: number,
        tooth_type: supernumeraryType,
        tooth_location: supernumeraryLocation,
        status: 'healthy',
        notes: null,
        updated_by: editorName || null,
        updated_at: new Date().toISOString(),
      };
      const { error: err } = await supabase.from('tooth_chart').insert(row);
      if (err) {
        setError(chartWriteError('Could not add the supernumerary tooth', err));
        return;
      }
      setChart((prev) => ({ ...prev, [number]: row }));
      const { data: logged, error: logErr } = await supabase.from('tooth_chart_history').insert({
        patient_id: patientId,
        tooth_number: number,
        tooth_type: supernumeraryType,
        tooth_location: supernumeraryLocation,
        status: 'healthy',
        previous_status: null,
        notes: null,
        updated_by: editorName || null,
      }).select().single();
      if (logErr) {
        setError(`Supernumerary tooth added, but its history could not be recorded: ${logErr.message}`);
      } else {
        setHistory((prev) => [logged, ...prev]);
      }
      await recordActivity(activityUser, {
        action: `Added supernumerary tooth ${number} for ${patientName || 'patient'}`,
        entityType: 'tooth_chart',
        entityId: `${patientId}-${number}`,
        details: { tooth_type: supernumeraryType, tooth_location: supernumeraryLocation },
      });
      setSelected(number);
      setDraftStatus('healthy');
      setDraftNotes('');
      setSavedMsg(`Supernumerary tooth ${number} added.`);
      setShowSupernumeraryForm(false);
    } catch (err) {
      setError(chartWriteError('Could not add the supernumerary tooth', err));
    } finally {
      setAddingSupernumerary(false);
    }
  };

  const save = async () => {
    if (!selected) return;
    const current = chart[selected];
    const cleanNotes = draftNotes.trim() || null;
    const isSupernumerary = String(selected).startsWith('SUP-');
    if (
      (current?.status || 'healthy') === draftStatus &&
      (current?.notes || null) === cleanNotes &&
      (!isSupernumerary || (
        (current?.tooth_type || SUPERNUMERARY_TYPES[0]) === supernumeraryType &&
        (current?.tooth_location || SUPERNUMERARY_LOCATIONS[0]) === supernumeraryLocation
      ))
    ) {
      setSavedMsg('No changes to save.');
      return;
    }
    setSaving(true);
    setError('');
    if (beforeSave) {
      const blocked = await beforeSave(); // e.g. the patient must currently be in treatment
      if (blocked) { setError(blocked); setSaving(false); return; }
    }
    const row = {
      patient_id: patientId,
      tooth_number: selected,
      tooth_type: isSupernumerary ? supernumeraryType : current?.tooth_type || null,
      tooth_location: isSupernumerary ? supernumeraryLocation : current?.tooth_location || null,
      status: draftStatus,
      notes: cleanNotes,
      updated_by: editorName || null,
      updated_at: new Date().toISOString(),
    };
    const { error: err } = await supabase.from('tooth_chart').upsert(row, { onConflict: 'patient_id,tooth_number' });
    if (err) {
      setError(chartWriteError('Could not save the tooth', err));
      setSaving(false);
      return;
    }
    setChart((prev) => ({ ...prev, [selected]: row }));
    await recordActivity(activityUser, {
      action: `Updated ${patientName || 'patient'} tooth ${selected}: ${draftStatus}`,
      entityType: 'tooth_chart', entityId: `${patientId}-${selected}`,
      details: { previous_status: current?.status || 'healthy', status: draftStatus }
    });

    // Dated log entry for this change
    const { data: logged, error: logErr } = await supabase
      .from('tooth_chart_history')
      .insert({
        patient_id: patientId,
        tooth_number: selected,
        tooth_type: row.tooth_type,
        tooth_location: row.tooth_location,
        status: draftStatus,
        previous_status: current?.status || 'healthy',
        notes: cleanNotes,
        updated_by: editorName || null,
      })
      .select()
      .single();
    if (logErr) {
      setError(`Tooth saved, but the history entry could not be recorded: ${logErr.message}. Apply pending tooth-chart access migrations with supabase db push.`);
    } else {
      setHistory((prev) => [logged, ...prev]);
    }
    setSavedMsg(`Tooth ${selected} updated.`);
    setSaving(false);
  };

  // Every dated entry, newest first. Teeth charted before history existed get one entry from their current record.
  const entries = useMemo(() => {
    const list = [...history];
    const logged = new Set(history.map((h) => h.tooth_number));
    Object.values(chart).forEach((r) => {
      if (!logged.has(r.tooth_number) && r.updated_at) {
        list.push({ id: `legacy-${r.tooth_number}`, tooth_number: r.tooth_number, status: r.status, previous_status: null, notes: r.notes, updated_by: r.updated_by, created_at: r.updated_at });
      }
    });
    return list.filter((e) => e.created_at).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [history, chart]);

  const recentTeeth = useMemo(() => {
    const cutoff = Date.now() - RECENT_DAYS * 86400000;
    return new Set(entries.filter((e) => new Date(e.created_at).getTime() >= cutoff).map((e) => e.tooth_number));
  }, [entries]);

  const toothEntries = useMemo(() => entries.filter((e) => String(e.tooth_number) === String(selected)), [entries, selected]);

  const counts = useMemo(() => {
    const c = {};
    [...UPPER, ...LOWER].forEach((n) => { const s = chart[n]?.status || 'healthy'; c[s] = (c[s] || 0) + 1; });
    return c;
  }, [chart]);

  const lastUpdate = useMemo(() => {
    const times = Object.values(chart).map((r) => r.updated_at).filter(Boolean).sort();
    return times.length ? new Date(times[times.length - 1]).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : null;
  }, [chart]);

  const sel = selected ? chart[selected] : null;

  if (!patientId) {
    return <div className="bg-white border border-[#d4e2dc] rounded-2xl p-10 text-center text-xs font-bold text-[#607368]">Select a patient to view their tooth chart.</div>;
  }

  return (
    <div className="space-y-4">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3.5 rounded-xl font-bold">⚠️ {error}</div>}

      <div className="bg-white border border-[#d4e2dc] rounded-2xl p-5 shadow-2xs space-y-3">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <div>
            <h3 className="font-black text-base text-[#13241b]">{patientName ? `${patientName}'s Tooth Chart` : 'Tooth Chart'}</h3>
            <p className="text-[11px] text-[#607368]">
              Adult teeth, FDI numbering. Supernumerary teeth are recorded separately below. {canEdit ? 'Click a tooth to update its status.' : 'Click a tooth to see its details.'} Teeth with no record are shown as healthy.
            </p>
          </div>
          {lastUpdate && <span className="text-[11px] font-bold bg-[#e3ede6] text-[#164e43] px-3 py-1 rounded-full">Last updated {lastUpdate}</span>}
        </div>

        {!canEdit && readOnlyReason && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs p-3.5 rounded-xl font-bold">🔒 {readOnlyReason}</div>
        )}

        {loading ? (
          <div className="py-10 text-center text-xs font-bold text-[#607368]">Loading chart...</div>
        ) : (
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] font-black uppercase tracking-wider text-[#607368] px-1"><span>Patient's right</span><span>Upper</span><span>Patient's left</span></div>
            <Arch numbers={UPPER} chart={chart} selected={selected} onSelect={selectTooth} flipped={false} recent={recentTeeth} />
            <div className="border-t border-dashed border-[#d4e2dc]" />
            <Arch numbers={LOWER} chart={chart} selected={selected} onSelect={selectTooth} flipped recent={recentTeeth} />
            <div className="flex justify-between text-[10px] font-black uppercase tracking-wider text-[#607368] px-1"><span>Patient's right</span><span>Lower</span><span>Patient's left</span></div>
            <SupernumeraryChartRow
              teeth={supernumeraryTeeth}
              selected={selected}
              onSelect={selectTooth}
              recent={recentTeeth}
            />
          </div>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-2 pt-2 border-t border-[#f0f5f2]">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#13241b]">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400" /> Changed in last {RECENT_DAYS} days
          </span>
          {Object.entries(TOOTH_STATUSES).map(([key, s]) => (
            <span key={key} className="flex items-center gap-1.5 text-[11px] font-semibold text-[#13241b]">
              <span className="inline-block w-3.5 h-3.5 rounded" style={{ background: s.fill === 'none' ? 'transparent' : s.fill, border: `1.5px ${key === 'missing' ? 'dashed' : 'solid'} ${s.stroke}` }} />
              {s.label} <span className="text-[#607368]">({counts[key] || 0})</span>
            </span>
          ))}
        </div>
      </div>

      <section className="bg-white border border-[#d4e2dc] rounded-2xl p-5 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="font-black text-sm text-[#13241b]">Supernumerary teeth</h4>
            <p className="mt-1 text-[11px] text-[#607368]">Record extra teeth separately from the standard FDI chart.</p>
          </div>
          {canEdit && !showSupernumeraryForm && (
            <button
              type="button"
              onClick={() => setShowSupernumeraryForm(true)}
              className="rounded-xl bg-[#164e43] px-4 py-2 text-xs font-bold text-white hover:bg-[#0f362e]"
            >
              + Add extra tooth
            </button>
          )}
        </div>
        {showSupernumeraryForm && canEdit && (
          <div className="rounded-xl border border-[#bcd7ca] bg-[#f5faf7] p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block text-xs font-bold text-[#13241b]">
                Classification
                <select value={supernumeraryType} onChange={(e) => changeSupernumeraryType(e.target.value)} className="mt-1 w-full rounded-lg border border-[#d4e2dc] bg-white p-2.5 text-xs">
                  {SUPERNUMERARY_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
              <label className="block text-xs font-bold text-[#13241b]">
                Location
                <select value={supernumeraryLocation} onChange={(e) => setSupernumeraryLocation(e.target.value)} disabled={Boolean(FIXED_SUPERNUMERARY_LOCATIONS[supernumeraryType])} className="mt-1 w-full rounded-lg border border-[#d4e2dc] bg-white p-2.5 text-xs disabled:bg-gray-100 disabled:text-gray-500">
                  {locationsForSupernumeraryType(supernumeraryType).map((location) => <option key={location} value={location}>{location}</option>)}
                </select>
                {FIXED_SUPERNUMERARY_LOCATIONS[supernumeraryType] && <span className="mt-1 block text-[10px] font-medium text-[#607368]">Mesiodens are classified at the upper midline.</span>}
              </label>
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={addingSupernumerary || loading} onClick={addSupernumerary} className="rounded-xl bg-[#164e43] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
                {addingSupernumerary ? 'Adding...' : 'Add to chart'}
              </button>
              <button type="button" disabled={addingSupernumerary} onClick={() => setShowSupernumeraryForm(false)} className="rounded-xl border border-[#d4e2dc] bg-white px-4 py-2 text-xs font-bold text-[#40584f]">
                Cancel
              </button>
            </div>
          </div>
        )}
        {supernumeraryTeeth.length > 0 ? (
          <ul className="divide-y divide-[#f0f5f2]">
            {supernumeraryTeeth.map((tooth) => (
              <li key={tooth.tooth_number}>
                <button type="button" onClick={() => selectTooth(tooth.tooth_number)} className={`w-full rounded-lg px-3 py-2.5 text-left transition hover:bg-[#f8faf9] ${selected === tooth.tooth_number ? 'bg-[#eaf4ef]' : ''}`}>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-xs font-black text-[#164e43]">{tooth.tooth_number}</span>
                    <span className="text-xs font-semibold text-[#13241b]">{tooth.tooth_type || 'Supernumerary tooth'}</span>
                    <span className="text-[11px] text-[#607368]">{tooth.tooth_location || 'Location not specified'}</span>
                    <span className="text-[10px] font-bold text-[#607368]">· {TOOTH_STATUSES[tooth.status]?.label || tooth.status}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-[#d4e2dc] py-4 text-center text-xs text-[#71827c]">No supernumerary teeth recorded.</p>
        )}
      </section>

      {selected && (
        <div className="bg-white border border-[#d4e2dc] rounded-2xl p-5 shadow-2xs space-y-3">
          <div className="flex justify-between items-start">
            <div>
              <h4 className="font-black text-sm text-[#13241b]">
                {String(selected).startsWith('SUP-')
                  ? `Extra tooth ${selected} · ${sel?.tooth_type || 'Supernumerary tooth'}`
                  : `Tooth ${selected} · ${toothName(selected)}`}
              </h4>
              <p className="text-[11px] text-[#607368]">
                {String(selected).startsWith('SUP-') && <>{sel?.tooth_location || 'Location not specified'} · </>}
                Status: <strong>{TOOTH_STATUSES[sel?.status || 'healthy'].label}</strong>
                {sel?.updated_by ? ` · updated by ${sel.updated_by}` : ''}
              </p>
            </div>
            <button type="button" onClick={() => setSelected(null)} className="text-[#607368] font-black cursor-pointer px-2">×</button>
          </div>

          {canEdit ? (
            <>
              {String(selected).startsWith('SUP-') && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block text-xs font-bold text-[#13241b]">
                    Classification
                    <select value={supernumeraryType} onChange={(e) => changeSupernumeraryType(e.target.value)} className="mt-1 w-full rounded-lg border border-[#d4e2dc] bg-white p-2.5 text-xs">
                      {SUPERNUMERARY_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </label>
                  <label className="block text-xs font-bold text-[#13241b]">
                    Location
                    <select value={supernumeraryLocation} onChange={(e) => setSupernumeraryLocation(e.target.value)} disabled={Boolean(FIXED_SUPERNUMERARY_LOCATIONS[supernumeraryType])} className="mt-1 w-full rounded-lg border border-[#d4e2dc] bg-white p-2.5 text-xs disabled:bg-gray-100 disabled:text-gray-500">
                      {locationsForSupernumeraryType(supernumeraryType).map((location) => <option key={location} value={location}>{location}</option>)}
                    </select>
                    {FIXED_SUPERNUMERARY_LOCATIONS[supernumeraryType] && <span className="mt-1 block text-[10px] font-medium text-[#607368]">Mesiodens are classified at the upper midline.</span>}
                  </label>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {Object.entries(TOOTH_STATUSES).map(([key, s]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDraftStatus(key)}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border cursor-pointer transition ${draftStatus === key ? 'bg-[#164e43] text-white border-[#164e43]' : 'bg-white text-[#13241b] border-[#d4e2dc] hover:bg-[#f5f7f6]'}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <textarea
                rows={2}
                value={draftNotes}
                onChange={(e) => setDraftNotes(e.target.value)}
                placeholder="Clinical notes for this tooth (optional)"
                className="w-full border border-[#d4e2dc] rounded-xl p-3 text-xs bg-[#f5f7f6] focus:outline-none focus:border-[#164e43]"
              />
              <div className="flex items-center gap-3">
                <button type="button" onClick={save} disabled={saving} className="bg-[#164e43] hover:bg-[#0f362e] text-white px-5 py-2.5 rounded-xl font-bold text-xs cursor-pointer disabled:opacity-60">
                  {saving ? 'Saving...' : 'Save tooth'}
                </button>
                {savedMsg && <span className="text-xs font-bold text-emerald-700">✓ {savedMsg}</span>}
              </div>
            </>
          ) : (
            <p className="text-xs text-[#13241b] bg-[#f8faf9] border border-[#e5ece8] rounded-xl p-3">
              {sel?.notes || 'No notes recorded for this tooth.'}
            </p>
          )}

          {/* History log for this tooth */}
          <div className="pt-3 border-t border-[#f0f5f2]">
            <h5 className="text-[11px] font-black uppercase tracking-wider text-[#164e43] mb-3">History log ({toothEntries.length})</h5>
            {toothEntries.length === 0 ? (
              <p className="text-xs text-[#607368]">No changes have been recorded for this tooth yet.</p>
            ) : (
              <ol className="relative border-l-2 border-[#e3ede6] ml-2 space-y-4">
                {toothEntries.map((e, i) => {
                  const st = TOOTH_STATUSES[e.status] || TOOTH_STATUSES.healthy;
                  const prev = e.previous_status ? TOOTH_STATUSES[e.previous_status] : null;
                  return (
                    <li key={e.id} className="ml-4">
                      <span
                        className="absolute -left-[7px] mt-1 w-3 h-3 rounded-full border-2"
                        style={{ background: st.fill === 'none' ? '#fff' : st.fill, borderColor: st.stroke }}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-black text-[#13241b]">
                          {prev && e.previous_status !== e.status ? `${prev.label} → ${st.label}` : st.label}
                        </span>
                        {i === 0 && <span className="text-[10px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Latest</span>}
                      </div>
                      <div className="text-[11px] text-[#607368]">
                        {formatDateTime(e.created_at)} · {timeAgo(e.created_at)}{e.updated_by ? ` · by ${e.updated_by}` : ''}
                      </div>
                      {e.notes && <p className="mt-1 text-xs text-[#13241b] bg-[#f8faf9] border border-[#e5ece8] rounded-lg p-2 whitespace-pre-wrap">{e.notes}</p>}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
      )}

      {/* Recent activity across all teeth */}
      {!loading && entries.length > 0 && (
        <div className="bg-white border border-[#d4e2dc] rounded-2xl p-5 shadow-2xs">
          <h4 className="font-black text-sm text-[#13241b] mb-3">Recent activity</h4>
          <ul className="divide-y divide-[#f0f5f2]">
            {entries.slice(0, 8).map((e, i) => {
              const st = TOOTH_STATUSES[e.status] || TOOTH_STATUSES.healthy;
              return (
                <li key={e.id}>
                  <button type="button" onClick={() => selectTooth(e.tooth_number)} className="w-full flex items-center gap-3 py-2.5 text-left cursor-pointer hover:bg-[#f8faf9] rounded-lg px-1">
                    <span className="w-3 h-3 rounded-full border-2 shrink-0" style={{ background: st.fill === 'none' ? '#fff' : st.fill, borderColor: st.stroke }} />
                    <span className="text-xs font-black text-[#13241b] w-16 shrink-0">Tooth {e.tooth_number}</span>
                    <span className="text-xs text-[#13241b] flex-1 truncate">{st.label}{e.notes ? ` · ${e.notes}` : ''}</span>
                    {i === 0 && <span className="text-[10px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Latest</span>}
                    <span className="text-[11px] text-[#607368] shrink-0">{formatDateTime(e.created_at)} · {timeAgo(e.created_at)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
