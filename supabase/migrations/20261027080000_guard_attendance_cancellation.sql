create or replace function public.prevent_dentist_time_in_cancellation_after_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.clock_in is not null and new.clock_in is null then
    if exists (
      select 1
      from public.staff_users dentist
      join public.appointments appointment
        on appointment.assigned_dentist = dentist.full_name
      where dentist.id = old.staff_user_id
        and (lower(dentist.role) = 'dentist' or dentist.id = 2)
        and appointment.appointment_date::text = old.attendance_date::text
        and appointment.status = 'Completed'
    ) then
      raise exception 'Time-in cannot be cancelled after completing an appointment.'
        using errcode = '42501';
    end if;
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
