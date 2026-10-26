import { supabase } from './supabase';

export const localDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export async function logActivity({ actor, action, targetType = null, targetId = null, details = {} }) {
  const { error } = await supabase.from('activity_logs').insert({
    actor_user_id: actor?.id ?? null,
    actor_name: actor?.name || actor?.full_name || 'System',
    actor_role: actor?.role || 'system',
    action,
    target_type: targetType,
    target_id: targetId == null ? null : String(targetId),
    details,
  });
  if (error) console.warn('Activity log could not be saved:', error.message);
  return !error;
}
