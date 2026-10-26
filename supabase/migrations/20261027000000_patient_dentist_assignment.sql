alter table public.staff_users
  add column if not exists assigned_dentist text;
