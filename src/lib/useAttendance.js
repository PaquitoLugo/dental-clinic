import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { recordActivity } from './activityLog';
import { localDateKey } from './dateUtils';

export default function useAttendance(user, workingHours = { timeIn: '08:00', timeOut: '17:00' }) {
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const today = localDateKey();

  useEffect(() => {
    if (!user?.id) return undefined;
    let active = true;
    supabase.from('staff_attendance').select('*')
      .eq('staff_user_id', user.id).eq('attendance_date', today).maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setMessage(`Attendance is unavailable: ${error.message}`);
          setLoading(false);
          return;
        }
        setRecord(data || null);
        setMessage('');
        setLoading(false);
      })
      .catch((error) => {
        if (active) {
          setMessage(`Attendance is unavailable: ${error.message}`);
          setLoading(false);
        }
      });
    return () => { active = false; };
  }, [user?.id, today]);

  const refresh = async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase.from('staff_attendance').select('*')
        .eq('staff_user_id', user.id).eq('attendance_date', today).maybeSingle();
      if (error) throw error;
      setRecord(data || null);
      setMessage('');
    } catch (error) {
      setMessage(`Attendance is unavailable: ${error.message}`);
    }
  };

  const checkClockedIn = async () => {
    if (!user?.id) return 'Could not verify attendance. Sign in again and try once more.';
    try {
      const { data, error } = await supabase.from('staff_attendance').select('id, attendance_date, clock_in, clock_out')
        .eq('staff_user_id', user.id).eq('attendance_date', today).maybeSingle();
      if (error) throw error;
      setRecord(data || null);
      setMessage('');
      if (!data?.clock_in) {
        return 'You must time in before using staff functions.';
      }
      if (data.clock_out) return 'Your shift is timed out. Time in again before using staff functions.';
      return null;
    } catch (error) {
      const message = `Attendance verification failed: ${error.message}`;
      setMessage(message);
      return message;
    }
  };

  const checkPendingPatients = async () => {
    if (!user?.id) return 'Could not verify your pending patients. Sign in again and try once more.';
    try {
      let query = supabase.from('appointments')
        .select('id', { count: 'exact', head: true })
        .in('status', ['Accepted', 'In Queue', 'In Treatment']);
      if (user.role === 'dentist') {
        query = query.eq('assigned_dentist', user.name);
      }
      const { count, error } = await query;
      if (error) throw error;
      if (count > 0) {
        return user.role === 'dentist'
          ? 'You cannot time out while a patient assigned to you is Accepted, In Queue, or In Treatment.'
          : 'You cannot time out while a patient is Accepted, In Queue, or In Treatment.';
      }
      return null;
    } catch (error) {
      const message = `Could not verify pending patients: ${error.message}`;
      setMessage(message);
      return message;
    }
  };

  const checkCompletedAppointments = async () => {
    if (!['dentist', 'assistant'].includes(user?.role)) return null;
    try {
      let query = supabase.from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'Completed')
        .eq('appointment_date', today);
      if (user.role === 'dentist' && user.name) query = query.eq('assigned_dentist', user.name);
      const { count, error } = await query;
      if (error) throw error;
      return count
        ? 'Time-in cannot be cancelled after a procedure has been completed today.'
        : null;
    } catch (error) {
      const message = `Could not verify completed procedures: ${error.message}`;
      setMessage(message);
      return message;
    }
  };

  const clockIn = async () => {
    if (!user?.id || record?.clock_in || saving) return false;
    const parseMinutes = (value) => {
      const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value || '');
      return match ? Number(match[1]) * 60 + Number(match[2]) : null;
    };
    const startMinutes = parseMinutes(workingHours.timeIn);
    const endMinutes = parseMinutes(workingHours.timeOut);
    if (startMinutes === null || endMinutes === null || startMinutes >= endMinutes) {
      setMessage('Could not verify valid working hours. Contact the clinic manager before timing in.');
      return false;
    }
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    if (currentMinutes < startMinutes || currentMinutes >= endMinutes) {
      setMessage(`Time-in is only allowed during working hours (${workingHours.timeIn}–${workingHours.timeOut}).`);
      return false;
    }
    setSaving(true);
    setMessage('');
    try {
      const { data, error } = await supabase.from('staff_attendance').upsert({
        staff_user_id: user.id,
        attendance_date: today,
        clock_in: new Date().toISOString(),
        clock_out: null,
      }, { onConflict: 'staff_user_id,attendance_date' }).select().single();
      if (error) throw error;
      setRecord(data);
      await recordActivity(user, { action: 'Timed in', entityType: 'staff_attendance', entityId: data.id });
      return true;
    } catch (error) {
      setMessage(`Could not time in: ${error.message}`);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const clockOut = async () => {
    if (!record?.clock_in || record.clock_out || saving) return;
    const pendingPatientMessage = await checkPendingPatients();
    if (pendingPatientMessage) {
      setMessage(pendingPatientMessage);
      return false;
    }
    const parseMinutes = (value) => {
      const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value || '');
      return match ? Number(match[1]) * 60 + Number(match[2]) : null;
    };
    const startMinutes = parseMinutes(workingHours.timeIn);
    const endMinutes = parseMinutes(workingHours.timeOut);
    if (startMinutes === null || endMinutes === null || startMinutes >= endMinutes) {
      setMessage('Could not verify valid working hours. Contact the clinic manager before timing out.');
      return false;
    }
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    if (currentMinutes < startMinutes || currentMinutes >= endMinutes) {
      setMessage(`Time-out is only allowed during working hours (${workingHours.timeIn}–${workingHours.timeOut}).`);
      return false;
    }
    setSaving(true);
    setMessage('');
    try {
      const { data, error } = await supabase.from('staff_attendance').update({ clock_out: new Date().toISOString() })
        .eq('id', record.id).select().single();
      if (error) throw error;
      setRecord(data);
      await recordActivity(user, { action: 'Timed out', entityType: 'staff_attendance', entityId: data.id });
      return true;
    } catch (error) {
      setMessage(`Could not time out: ${error.message}`);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const cancelClockOut = async () => {
    if (!record?.id || !record.clock_out || saving) return false;
    setSaving(true);
    setMessage('');
    try {
      const { data, error } = await supabase.from('staff_attendance')
        .update({ clock_out: null })
        .eq('id', record.id)
        .select()
        .single();
      if (error) throw error;
      setRecord(data);
      await recordActivity(user, { action: 'Cancelled time-out', entityType: 'staff_attendance', entityId: data.id });
      return true;
    } catch (error) {
      setMessage(`Could not cancel time-out: ${error.message}`);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const cancelClockIn = async () => {
    if (!record?.id || !record.clock_in || record.clock_out || saving) return false;
    const completedAppointmentMessage = await checkCompletedAppointments();
    if (completedAppointmentMessage) {
      setMessage(completedAppointmentMessage);
      return false;
    }
    setSaving(true);
    setMessage('');
    try {
      const { error } = await supabase.from('staff_attendance')
        .delete()
        .eq('id', record.id)
      if (error) throw error;
      setRecord(null);
      await recordActivity(user, { action: 'Cancelled time-in', entityType: 'staff_attendance', entityId: record.id });
      return true;
    } catch (error) {
      setMessage(`Could not cancel time-in: ${error.message}`);
      return false;
    } finally {
      setSaving(false);
    }
  };

  return {
    record, loading, saving, message, clockIn, clockOut, cancelClockIn, cancelClockOut,
    refresh, checkClockedIn, checkPendingPatients, checkCompletedAppointments,
  };
}
