alter table public.staff_users
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;

create or replace function public.guard_staff_auth_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  request_role text := coalesce(auth.role(), '');
  can_manage_accounts boolean := false;
begin
  if request_role = 'service_role' then
    return new;
  end if;

  select exists (
    select 1
    from public.staff_users manager
    where manager.auth_user_id = auth.uid()
      and (lower(manager.role) = 'manager' or manager.id = 1)
      and manager.archived_at is null
      and coalesce(lower(manager.account_status), 'approved') = 'approved'
  )
  into can_manage_accounts;

  if new.auth_user_id is distinct from old.auth_user_id then
    raise exception 'Only the authentication service can change staff authentication links.'
      using errcode = '42501';
  end if;

  if not can_manage_accounts
    and (
      new.role is distinct from old.role
      or new.archived_at is distinct from old.archived_at
      or new.account_status is distinct from old.account_status
    )
  then
    raise exception 'Only an active manager can change staff roles or account status.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_staff_auth_fields on public.staff_users;
create trigger guard_staff_auth_fields
before update of auth_user_id, role, archived_at, account_status
on public.staff_users
for each row
execute function public.guard_staff_auth_fields();

create schema if not exists private;

create table if not exists private.staff_login_attempts (
  attempt_id uuid not null,
  key_hash text not null,
  attempted_at timestamptz not null default now(),
  primary key (attempt_id, key_hash)
);

revoke all on private.staff_login_attempts from public, anon, authenticated;

create or replace function public.check_staff_login_rate_limit(p_ip_hash text, p_identifier_hash text)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
declare
  recent_attempts integer;
  current_attempt uuid := gen_random_uuid();
begin
  perform pg_advisory_xact_lock(hashtext(least(p_ip_hash, p_identifier_hash))::bigint);
  if p_ip_hash <> p_identifier_hash then
    perform pg_advisory_xact_lock(hashtext(greatest(p_ip_hash, p_identifier_hash))::bigint);
  end if;

  select count(distinct attempt_id)
  into recent_attempts
  from private.staff_login_attempts
  where key_hash in (p_ip_hash, p_identifier_hash)
    and attempted_at > now() - interval '15 minutes';

  if recent_attempts >= 10 then
    delete from private.staff_login_attempts
    where attempted_at <= now() - interval '15 minutes';
    return false;
  end if;

  insert into private.staff_login_attempts (attempt_id, key_hash)
  select current_attempt, key_hash
  from unnest(array[p_ip_hash, p_identifier_hash]) as submitted(key_hash)
  on conflict do nothing;

  delete from private.staff_login_attempts
  where attempted_at <= now() - interval '15 minutes';

  return true;
end;
$$;

revoke all on function public.check_staff_login_rate_limit(text, text) from public, anon, authenticated;
grant execute on function public.check_staff_login_rate_limit(text, text) to service_role;

alter table public.staff_attendance enable row level security;

drop policy if exists staff_attendance_select_own on public.staff_attendance;
create policy staff_attendance_select_own
on public.staff_attendance
for select
to authenticated
using (
  exists (
    select 1
    from public.staff_users staff
    where staff.id = staff_attendance.staff_user_id
      and staff.auth_user_id = (select auth.uid())
      and lower(staff.role) in ('assistant', 'dentist')
      and staff.archived_at is null
      and coalesce(lower(staff.account_status), 'approved') = 'approved'
  )
);

drop policy if exists staff_attendance_select_manager on public.staff_attendance;
create policy staff_attendance_select_manager
on public.staff_attendance
for select
to authenticated
using (
  exists (
    select 1
    from public.staff_users staff
    where staff.auth_user_id = (select auth.uid())
      and (lower(staff.role) = 'manager' or staff.id = 1)
      and staff.archived_at is null
      and coalesce(lower(staff.account_status), 'approved') = 'approved'
  )
);

drop policy if exists staff_attendance_insert_own on public.staff_attendance;
create policy staff_attendance_insert_own
on public.staff_attendance
for insert
to authenticated
with check (
  exists (
    select 1
    from public.staff_users staff
    where staff.id = staff_attendance.staff_user_id
      and staff.auth_user_id = (select auth.uid())
      and lower(staff.role) in ('assistant', 'dentist')
      and staff.archived_at is null
      and coalesce(lower(staff.account_status), 'approved') = 'approved'
  )
);

drop policy if exists staff_attendance_update_own on public.staff_attendance;
create policy staff_attendance_update_own
on public.staff_attendance
for update
to authenticated
using (
  exists (
    select 1
    from public.staff_users staff
    where staff.id = staff_attendance.staff_user_id
      and staff.auth_user_id = (select auth.uid())
      and lower(staff.role) in ('assistant', 'dentist')
      and staff.archived_at is null
      and coalesce(lower(staff.account_status), 'approved') = 'approved'
  )
)
with check (
  exists (
    select 1
    from public.staff_users staff
    where staff.id = staff_attendance.staff_user_id
      and staff.auth_user_id = (select auth.uid())
      and lower(staff.role) in ('assistant', 'dentist')
      and staff.archived_at is null
      and coalesce(lower(staff.account_status), 'approved') = 'approved'
  )
);
