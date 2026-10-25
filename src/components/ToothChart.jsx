import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

// FDI two-digit notation (ISO 3950), adult dentition, viewed as the dentist faces the patient:
// the patient's right side is on the left of the screen.
const UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

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
            {recent.has(n) && <circle cx={37} cy={flipped ? -12 : 76} r={3.5} fill="#f59e0b"><title>Changed in the last {RECENT_DAYS} days</title></circle>}
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

/**
 * Interactive dental chart.
 *  - patientId: staff_users.id of the patient
 *  - canEdit:   true for the dentist, false (read-only) for the patient
 */
export default function ToothChart({ patientId, patientName, canEdit = false, editorName = '', readOnlyReason = '', beforeSave = null }) {
  const [chart, setChart] = useState({});
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [draftStatus, setDraftStatus] = useState('healthy');
  const [draftNotes, setDraftNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  const load = useCallback(async () => {
    if (!patientId) { setChart({}); return; }
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase.from('tooth_chart').select('*').eq('patient_id', patientId);
    if (err) {
      setError(`Could not load the tooth chart: ${err.message}. If the table is missing, run supabase_migration.sql.`);
      setChart({});
    } else {
      setChart(Object.fromEntries((data || []).map((r) => [r.tooth_number, r])));
    }
    const { data: logs, error: logsErr } = await supabase
      .from('tooth_chart_history').select('*').eq('patient_id', patientId).order('created_at', { ascending: false });
    if (logsErr) {
      setHistory([]);
      if (!err) setError(`Could not load tooth history: ${logsErr.message}. Run section 4 of supabase_migration.sql.`);
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
    setSavedMsg('');
  };

  const save = async () => {
    if (!selected) return;
    const current = chart[selected];
    const cleanNotes = draftNotes.trim() || null;
    if ((current?.status || 'healthy') === draftStatus && (current?.notes || null) === cleanNotes) {
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
      status: draftStatus,
      notes: cleanNotes,
      updated_by: editorName || null,
      updated_at: new Date().toISOString(),
    };
    const { error: err } = await supabase.from('tooth_chart').upsert(row, { onConflict: 'patient_id,tooth_number' });
    if (err) {
      setError(`Could not save: ${err.message}`);
      setSaving(false);
      return;
    }
    setChart((prev) => ({ ...prev, [selected]: row }));

    // Dated log entry for this change
    const { data: logged, error: logErr } = await supabase
      .from('tooth_chart_history')
      .insert({
        patient_id: patientId,
        tooth_number: selected,
        status: draftStatus,
        previous_status: current?.status || 'healthy',
        notes: cleanNotes,
        updated_by: editorName || null,
      })
      .select()
      .single();
    if (logErr) {
      setError(`Tooth saved, but the history entry could not be recorded: ${logErr.message}. Run section 4 of supabase_migration.sql.`);
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

  const toothEntries = useMemo(() => entries.filter((e) => e.tooth_number === selected), [entries, selected]);

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
              Adult teeth, FDI numbering. {canEdit ? 'Click a tooth to update its status.' : 'Click a tooth to see its details.'} Teeth with no record are shown as healthy.
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

      {selected && (
        <div className="bg-white border border-[#d4e2dc] rounded-2xl p-5 shadow-2xs space-y-3">
          <div className="flex justify-between items-start">
            <div>
              <h4 className="font-black text-sm text-[#13241b]">Tooth {selected} · {toothName(selected)}</h4>
              <p className="text-[11px] text-[#607368]">
                Status: <strong>{TOOTH_STATUSES[sel?.status || 'healthy'].label}</strong>
                {sel?.updated_by ? ` · updated by ${sel.updated_by}` : ''}
              </p>
            </div>
            <button type="button" onClick={() => setSelected(null)} className="text-[#607368] font-black cursor-pointer px-2">×</button>
          </div>

          {canEdit ? (
            <>
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