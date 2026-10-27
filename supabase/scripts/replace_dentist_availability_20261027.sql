begin;

do $$
begin
  if to_regclass('public.dentist_availability_backup_20261027') is not null then
    raise exception 'Backup table public.dentist_availability_backup_20261027 already exists; refusing to overwrite it.';
  end if;

  if not exists (
    select 1
    from public.staff_users
    where (lower(role) = 'dentist' or id = 2)
      and archived_at is null
      and coalesce(lower(account_status), 'approved') = 'approved'
      and nullif(btrim(full_name), '') is not null
  ) then
    raise exception 'No active dentist accounts with names were found; no records were changed.';
  end if;

  execute 'create table public.dentist_availability_backup_20261027 as table public.dentist_availability';
end;
$$;

delete from public.dentist_availability;

insert into public.dentist_availability (
  dentist_name,
  available_date,
  start_time,
  end_time,
  is_active
)
select dentists.full_name,
       scheduled.day::date,
       time '08:00',
       time '17:00',
       true
from (
  select distinct full_name
  from public.staff_users
  where (lower(role) = 'dentist' or id = 2)
    and archived_at is null
    and coalesce(lower(account_status), 'approved') = 'approved'
    and nullif(btrim(full_name), '') is not null
) as dentists
cross join lateral generate_series(
  current_date,
  (current_date + interval '3 months')::date,
  interval '1 day'
) as scheduled(day)
where extract(isodow from scheduled.day) in (1, 3, 5);

commit;

select dentist_name,
       count(*) as schedule_rows,
       min(available_date) as first_date,
       max(available_date) as last_date
from public.dentist_availability
group by dentist_name
order by dentist_name;
