alter table public.activity_logs
  add column if not exists actor_id bigint,
  add column if not exists actor_role text,
  add column if not exists entity_type text,
  add column if not exists entity_id text;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'activity_logs'
    )
  then
    alter publication supabase_realtime add table public.activity_logs;
  end if;
end;
$$;

create or replace function public.prevent_dentist_time_in_cancellation_after_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.clock_in is not null and (
    (tg_op = 'DELETE')
    or (tg_op = 'UPDATE' and new.clock_in is null)
  ) then
    if exists (
      select 1
      from public.staff_users dentist
      join public.appointments appointment
        on lower(btrim(appointment.assigned_dentist)) = lower(btrim(dentist.full_name))
      where dentist.id = old.staff_user_id
        and (lower(dentist.role) = 'dentist' or dentist.id = 2)
        and appointment.appointment_date::text = old.attendance_date::text
        and appointment.status = 'Completed'
    ) then
      raise exception 'Time-in cannot be cancelled after completing an appointment.'
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_dentist_time_in_cancellation_after_completion
on public.staff_attendance;

create trigger prevent_dentist_time_in_cancellation_after_completion
before update of clock_in on public.staff_attendance
for each row
execute function public.prevent_dentist_time_in_cancellation_after_completion();

drop trigger if exists prevent_dentist_time_in_deletion_after_completion
on public.staff_attendance;

create trigger prevent_dentist_time_in_deletion_after_completion
before delete on public.staff_attendance
for each row
execute function public.prevent_dentist_time_in_cancellation_after_completion();

drop policy if exists staff_attendance_delete_own on public.staff_attendance;
create policy staff_attendance_delete_own
on public.staff_attendance
for delete
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
