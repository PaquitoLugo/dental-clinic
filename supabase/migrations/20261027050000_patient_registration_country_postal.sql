alter table public.staff_users
  add column if not exists country_code text,
  add column if not exists country_name text,
  add column if not exists postal_code text;
