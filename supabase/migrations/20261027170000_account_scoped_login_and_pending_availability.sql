drop function if exists public.check_staff_login_rate_limit(text, text);

create or replace function public.check_staff_login_rate_limit(
  p_account_hash text,
  p_record_failed_attempt boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
declare
  recent_attempts integer;
  current_attempt uuid := gen_random_uuid();
begin
  perform pg_advisory_xact_lock(hashtextextended(p_account_hash, 0));

  select count(distinct attempt_id)
  into recent_attempts
  from private.staff_login_attempts
  where key_hash = p_account_hash
    and attempted_at > now() - interval '15 minutes';

  if recent_attempts >= 10 then
    delete from private.staff_login_attempts
    where attempted_at <= now() - interval '15 minutes';
    return false;
  end if;

  if p_record_failed_attempt then
    insert into private.staff_login_attempts (attempt_id, key_hash)
    values (current_attempt, p_account_hash)
    on conflict do nothing;
  end if;

  delete from private.staff_login_attempts
  where attempted_at <= now() - interval '15 minutes';

  return true;
end;
$$;

revoke all on function public.check_staff_login_rate_limit(text, boolean) from public, anon, authenticated;
grant execute on function public.check_staff_login_rate_limit(text, boolean) to service_role;

create or replace function public.prevent_availability_deactivation_with_pending_appointment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.is_active is true
    and new.is_active is false
    and exists (
      select 1
      from public.appointments appointment
      where appointment.appointment_date = old.available_date
        and lower(btrim(coalesce(appointment.assigned_dentist, ''))) = lower(btrim(old.dentist_name))
        and lower(coalesce(appointment.status, '')) = 'pending'
    )
  then
    raise exception 'Cannot mark this date unavailable because a pending appointment is scheduled.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_availability_deactivation_with_pending_appointment on public.dentist_availability;
create trigger prevent_availability_deactivation_with_pending_appointment
before update of is_active on public.dentist_availability
for each row
execute function public.prevent_availability_deactivation_with_pending_appointment();
