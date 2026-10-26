import { supabase } from './supabase';

/** Write an audit event for the currently signed-in staff member. */
export async function recordActivity(user, { action, entityType = null, entityId = null, details = {} }) {
  const actorId = Number(user?.id);
  if (!Number.isInteger(actorId)) {
    console.warn('Activity log skipped: staff ID is not a number.');
    return false;
  }

  try {
    const { error } = await supabase.from('activity_logs').insert({
      actor_id: actorId,
      actor_name: user?.name || null,
      actor_role: user?.role || null,
      action,
      entity_type: entityType,
      entity_id: entityId == null ? null : String(entityId),
      details,
    });

    if (error) throw error;
  } catch (error) {
    console.warn('Could not write activity log:', error.message);
    return false;
  }
  return true;
}
