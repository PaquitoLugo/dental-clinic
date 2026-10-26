alter table public.staff_users
  add column if not exists is_guardian boolean not null default false,
  add column if not exists guardian_name text,
  add column if not exists guardian_relationship text,
  add column if not exists guardian_contact text;
