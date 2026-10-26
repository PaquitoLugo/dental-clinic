import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

/**
 * Loads treatment records (doctor's notes / prescriptions) keyed by appointment id (as string).
 * Refreshes every 15 seconds so the assistant sees a record soon after the dentist issues it.
 * Pass `appointmentIds` to limit the query (used on the patient side); omit it to load all.
 */
export default function useTreatmentRecords(appointmentIds) {
  const [records, setRecords] = useState({});
  const idsKey = appointmentIds ? appointmentIds.map(String).sort().join(',') : null;

  const refresh = useCallback(async () => {
    let query = supabase.from('treatment_records').select('*');
    if (idsKey !== null) {
      if (idsKey === '') { setRecords({}); return; }
      query = query.in('appointment_id', idsKey.split(','));
    }
    const { data, error } = await query;
    if (error) { console.warn('Could not load treatment records:', error.message); return; }
    setRecords(Object.fromEntries((data || []).map((r) => [String(r.appointment_id), r])));
  }, [idsKey]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 15000);
    return () => clearInterval(timer);
  }, [refresh]);

  return { records, refresh };
}