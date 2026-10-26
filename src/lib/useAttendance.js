import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { localDateKey, logActivity } from './activityLog';

export default function useAttendance(user) {
  const [record, setRecord] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const today = localDateKey();

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase.from('staff_attendance').select('*')
      .eq('staff_user_id', user.id).eq('attendance_date', localDateKey()).maybeSingle();
    if (error) {
      setMessage(`Attendance is unavailable: ${error.message}`);
      return;
    }
    setRecord(data || null);
  }, [user?.id]);

  useEffect(() => { refresh(); }, [refresh]);

  const clockIn = async () => {
    if (!user?.id || record?.clock_in || saving) return;
    setSaving(true);
    setMessage('');
    const now = new Date().toISOString();
    const { data, error } = await supabase.from('staff_attendance').upsert({
      staff_user_id: user.id,
      attendance_date: today,
      clock_in: now,
      clock_out: null,
    }, { onConflict: 'staff_user_id,attendance_date' }).select().single();
    if (error) setMessage(`Could not time in: ${error.message}`);
    else {
      setRecord(data);
      await logActivity({ actor: user, action: 'Timed in', targetType: 'staff_attendance', targetId: data.id });
    }
    setSaving(false);
  };

  const clockOut = async () => {
    if (!record?.clock_in || record.clock_out || saving) return;
    setSaving(true);
    setMessage('');
    const now = new Date().toISOString();
    const { data, error } = await supabase.from('staff_attendance').update({ clock_out: now })
      .eq('id', record.id).select().single();
    if (error) setMessage(`Could not time out: ${error.message}`);
    else {
      setRecord(data);
      await logActivity({ actor: user, action: 'Timed out', targetType: 'staff_attendance', targetId: data.id });
    }
    setSaving(false);
  };

  return { record, saving, message, clockIn, clockOut, refresh };
}
