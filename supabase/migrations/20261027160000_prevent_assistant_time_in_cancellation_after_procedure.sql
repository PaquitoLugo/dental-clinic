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
      from public.staff_users staff
      join public.appointments appointment
        on appointment.appointment_date::text = old.attendance_date::text
       and appointment.status = 'Completed'
      where staff.id = old.staff_user_id
        and (
          lower(staff.role) = 'assistant'
          or (
            (lower(staff.role) = 'dentist' or staff.id = 2)
            and lower(btrim(appointment.assigned_dentist)) = lower(btrim(staff.full_name))
          )
        )
    ) then
      raise exception 'Time-in cannot be cancelled after a procedure has been completed today.'
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
