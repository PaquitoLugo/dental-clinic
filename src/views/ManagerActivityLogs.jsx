import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const PAGE_SIZE = 25;

function localDateKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

export default function ManagerActivityLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [realtimeStatus, setRealtimeStatus] = useState('connecting');
  const [role, setRole] = useState('All roles');
  const [fromDate, setFromDate] = useState(() => localDateKey(new Date()));
  const [toDate, setToDate] = useState(() => localDateKey(new Date()));
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  useEffect(() => {
    let active = true;
    const fetchLogs = async () => {
      try {
        const { data, error: queryError } = await supabase
          .from('activity_logs')
          .select('id, actor_id, actor_name, actor_role, action, entity_type, entity_id, details, created_at')
          .order('created_at', { ascending: false })
          .limit(1000);
        if (queryError) throw queryError;
        if (active) {
          setLogs(data || []);
          setError('');
        }
      } catch (queryError) {
        if (active) {
          setError(`Could not load activity logs: ${queryError.message}`);
          setLogs([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    const channel = supabase.channel('manager-activity-logs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_logs' }, (payload) => {
        if (!active) return;
        setLogs((currentLogs) => {
          if (payload.eventType === 'DELETE') {
            return currentLogs.filter((entry) => entry.id !== payload.old.id);
          }

          const nextLogs = currentLogs.filter((entry) => entry.id !== payload.new.id);
          return [payload.new, ...nextLogs]
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 1000);
        });
      })
      .subscribe((status) => {
        if (!active) return;
        setRealtimeStatus(status === 'SUBSCRIBED'
          ? 'connected'
          : ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)
            ? 'error'
            : 'connecting');
      });
    fetchLogs();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const filteredLogs = useMemo(() => {
    const query = search.trim().toLowerCase();
    return logs.filter((entry) => {
      const entryDate = entry.created_at ? localDateKey(entry.created_at) : '';
      const matchesRole = role === 'All roles' || (entry.actor_role || '').toLowerCase() === role.toLowerCase();
      const matchesFrom = !fromDate || entryDate >= fromDate;
      const matchesTo = !toDate || entryDate <= toDate;
      const matchesSearch = !query || [entry.actor_name, entry.actor_role, entry.action]
        .some((value) => String(value || '').toLowerCase().includes(query));
      return matchesRole && matchesFrom && matchesTo && matchesSearch;
    });
  }, [logs, role, fromDate, toDate, search]);

  const pageCount = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const pageLogs = filteredLogs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const exportCsv = () => {
    const columns = ['actor_name', 'actor_role', 'action', 'created_at'];
    const header = ['Actor', 'Role', 'Action', 'Timestamp'];
    const lines = [header, ...filteredLogs.map((entry) => columns.map((column) => entry[column]))]
      .map((row) => row.map(csvCell).join(','));
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'activity-logs.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setRole('All roles');
    const today = localDateKey(new Date());
    setFromDate(today);
    setToDate(today);
    setSearch('');
    setPage(0);
  };

  return (
    <section className="flex-1 min-h-0 overflow-y-auto bg-white border border-[#d4e2dc] rounded-2xl p-5 md:p-6 flex flex-col gap-4" aria-label="Activity logs">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-black text-2xl text-[#13241b]">Activity Logs</h2>
          <p className="text-sm text-[#607368] mt-1">Today’s actions by clinic staff. Filters update as you change them.</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-[#d4e2dc] bg-[#f8faf9] px-3 py-1.5 text-xs font-bold text-[#607368]" role="status">
          <span className={`h-2 w-2 rounded-full ${realtimeStatus === 'connected' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
          {realtimeStatus === 'connected'
            ? 'Live updates on'
            : realtimeStatus === 'error'
              ? 'Live updates unavailable'
              : 'Connecting to live updates…'}
        </span>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[150px_150px_150px_minmax(180px,1fr)_auto] gap-2 items-end">
        <label className="text-xs font-bold text-[#607368]">Role
          <select value={role} onChange={(e) => { setRole(e.target.value); setPage(0); }} className="mt-1 w-full rounded-xl border border-[#d4e2dc] bg-white p-2.5 font-medium text-[#13241b]">
            {['All roles', 'Manager', 'Dentist', 'Assistant'].map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-[#607368]">From
          <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(0); }} className="mt-1 w-full rounded-xl border border-[#d4e2dc] bg-white p-2.5 font-medium text-[#13241b]" />
        </label>
        <label className="text-xs font-bold text-[#607368]">To
          <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(0); }} className="mt-1 w-full rounded-xl border border-[#d4e2dc] bg-white p-2.5 font-medium text-[#13241b]" />
        </label>
        <label className="text-xs font-bold text-[#607368]">Search
          <input type="search" placeholder="Search by person or action" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="mt-1 w-full rounded-xl border border-[#d4e2dc] bg-white p-2.5 font-medium text-[#13241b]" />
        </label>
        <div className="flex gap-2">
          <button type="button" onClick={clearFilters} className="px-3 py-2 rounded-xl text-xs font-bold text-[#607368] hover:bg-[#f5f7f6]">Clear</button>
          <button type="button" onClick={exportCsv} disabled={!filteredLogs.length} className="px-4 py-2 rounded-xl bg-[#164e43] text-white text-xs font-bold disabled:opacity-50">Export CSV</button>
        </div>
      </div>

      {error && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{error} If this is an access error, check the table’s RLS policies.</p>}

      <div className="flex-1 min-h-[240px] overflow-auto rounded-xl border border-[#dce6e2]">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-[#f8faf9] text-[11px] uppercase tracking-wide text-[#607368]">
            <tr><th className="px-4 py-3">Actor</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Timestamp</th></tr>
          </thead>
          <tbody className="divide-y divide-[#e5ece8] text-sm">
            {pageLogs.map((entry) => <tr key={entry.id} className="hover:bg-[#f8faf9]">
              <td className="px-4 py-3"><div className="font-bold text-[#13241b]">{entry.actor_name || `Staff #${entry.actor_id}`}</div><div className="text-xs capitalize text-[#71827c]">{entry.actor_role || 'Staff'}</div></td>
              <td className="px-4 py-3 text-[#263b31]">{entry.action || '—'}</td>
              <td className="px-4 py-3 whitespace-nowrap text-xs text-[#71827c]">{entry.created_at ? new Date(entry.created_at).toLocaleString('en-PH') : '—'}</td>
            </tr>)}
            {!loading && pageLogs.length === 0 && <tr><td colSpan="3" className="px-4 py-10 text-center text-sm text-[#71827c]">No activity logs match these filters.</td></tr>}
            {loading && <tr><td colSpan="3" className="px-4 py-10 text-center text-sm text-[#71827c]">Loading activity logs…</td></tr>}
          </tbody>
        </table>
      </div>

      <footer className="flex items-center justify-between text-xs text-[#71827c]">
        <span>Showing {filteredLogs.length ? page * PAGE_SIZE + 1 : 0}–{Math.min((page + 1) * PAGE_SIZE, filteredLogs.length)} of {filteredLogs.length} entries</span>
        <div className="flex items-center gap-2"><button type="button" disabled={page === 0} onClick={() => setPage((value) => value - 1)} className="px-3 py-1.5 rounded-lg border border-[#d4e2dc] disabled:opacity-40">Previous</button><span>{page + 1} / {pageCount}</span><button type="button" disabled={page + 1 >= pageCount} onClick={() => setPage((value) => value + 1)} className="px-3 py-1.5 rounded-lg border border-[#d4e2dc] disabled:opacity-40">Next</button></div>
      </footer>
    </section>
  );
}
