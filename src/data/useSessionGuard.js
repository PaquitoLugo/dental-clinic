import { useEffect, useRef } from 'react';
import { supabase } from './supabase';

/** True when the account still exists, is not archived and is approved. Network errors count as active. */
export async function isAccountActive(userId) {
  if (!userId) return true;
  const { data, error } = await supabase
    .from('staff_users').select('id, archived_at, account_status').eq('id', userId).maybeSingle();
  if (error) return true;
  if (!data) return false;
  if (data.archived_at) return false;
  return !['Pending', 'Rejected'].includes(data.account_status);
}

/**
 * Signs the user out as soon as their account is archived, rejected or deleted.
 * Checks every few seconds, whenever the tab regains focus, and instantly if Supabase Realtime
 * is enabled for staff_users. `onInvalid(reason)` is called once with 'archived' | 'status' | 'missing'.
 */
export default function useSessionGuard(user, onInvalid, intervalMs = 5000) {
  const callbackRef = useRef(onInvalid);
  callbackRef.current = onInvalid;

  useEffect(() => {
    if (!user?.id) return undefined;
    let cancelled = false;
    let fired = false;

    const fire = (reason) => {
      if (cancelled || fired) return;
      fired = true;
      callbackRef.current?.(reason);
    };

    const check = async () => {
      if (cancelled || fired) return;
      const { data, error } = await supabase
        .from('staff_users').select('id, archived_at, account_status').eq('id', user.id).maybeSingle();
      if (cancelled || error) return; // a network hiccup must not sign anyone out
      if (!data) return fire('missing');
      if (data.archived_at) return fire('archived');
      if (['Pending', 'Rejected'].includes(data.account_status)) return fire('status');
    };

    check();
    const timer = setInterval(check, intervalMs);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', onVisible);

    let channel = null;
    try {
      channel = supabase
        .channel(`session-guard-${user.id}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'staff_users', filter: `id=eq.${user.id}` }, check)
        .subscribe();
    } catch { /* realtime not available: polling still covers it */ }

    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', onVisible);
      if (channel) supabase.removeChannel(channel);
    };
  }, [user?.id, intervalMs]);
}
