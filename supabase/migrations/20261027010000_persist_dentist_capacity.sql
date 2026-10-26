alter table public.staff_users
  add column if not exists max_daily_patients integer not null default 10
  check (max_daily_patients > 0);
