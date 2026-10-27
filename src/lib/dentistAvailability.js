import { supabase } from './supabase';
import { localDateKey } from './dateUtils';

export async function fetchDentistAvailability(dentistName, fromDate = localDateKey()) {
  let query = supabase
    .from('dentist_availability')
    .select('available_date, start_time, end_time, is_active')
    .eq('dentist_name', dentistName)
    .eq('is_active', true)
    .order('available_date');
  if (fromDate) query = query.gte('available_date', fromDate);
  const { data, error } = await query;

  if (error) throw error;

  return (data || []).reduce((availability, row) => {
    availability[row.available_date] = {
      timeIn: String(row.start_time).slice(0, 5),
      timeOut: String(row.end_time).slice(0, 5),
      active: row.is_active,
    };
    return availability;
  }, {});
}

export async function saveDentistAvailability(dentistName, date, schedule) {
  const { data: existing, error: lookupError } = await supabase
    .from('dentist_availability')
    .select('id')
    .eq('dentist_name', dentistName)
    .eq('available_date', date);

  if (lookupError) throw lookupError;

  const values = {
    dentist_name: dentistName,
    available_date: date,
    start_time: schedule.timeIn,
    end_time: schedule.timeOut,
    is_active: schedule.active !== false,
  };

  const result = existing?.length
    ? await supabase.from('dentist_availability').update(values).eq('dentist_name', dentistName).eq('available_date', date)
    : await supabase.from('dentist_availability').insert(values);

  if (result.error) throw result.error;
}

export async function deactivateDentistAvailability(dentistName, date) {
  const { error } = await supabase
    .from('dentist_availability')
    .update({ is_active: false })
    .eq('dentist_name', dentistName)
    .eq('available_date', date);

  if (error) throw error;
}
