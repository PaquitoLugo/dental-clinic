alter table public.appointments
  add column if not exists archived_from_status text,
  add column if not exists no_show_restored_at timestamptz;
