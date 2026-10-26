alter table if exists public.tooth_chart
  alter column tooth_number type text using tooth_number::text;

alter table if exists public.tooth_chart_history
  alter column tooth_number type text using tooth_number::text;

alter table if exists public.tooth_chart
  add column if not exists tooth_type text,
  add column if not exists tooth_location text;

alter table if exists public.tooth_chart_history
  add column if not exists tooth_type text,
  add column if not exists tooth_location text;
