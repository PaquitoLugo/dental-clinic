alter table public.appointments
  add column if not exists cancellation_reason text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists archived_from_status text,
  add column if not exists no_show_restored_at timestamptz;

update public.appointments
set
  status = 'Cancelled',
  cancellation_reason = case
    when status = 'In Queue' then 'Expired / unfinished'
    else 'Non-appearance'
  end,
  cancelled_at = now(),
  archived_from_status = status
where status in ('Pending', 'Accepted', 'In Queue')
  and no_show_restored_at is null
  and (appointment_date + appointment_time)
    <= (now() at time zone 'Asia/Manila') - interval '2 hours';
