alter table public.dentist_availability enable row level security;

drop policy if exists dentist_availability_read on public.dentist_availability;
create policy dentist_availability_read
on public.dentist_availability
for select
to anon, authenticated
using (true);

drop policy if exists dentist_availability_insert_own on public.dentist_availability;
create policy dentist_availability_insert_own
on public.dentist_availability
for insert
to authenticated
with check (
  exists (
    select 1
    from public.staff_users dentist
    where dentist.auth_user_id = (select auth.uid())
      and (lower(dentist.role) = 'dentist' or dentist.id = 2)
      and dentist.archived_at is null
      and coalesce(lower(dentist.account_status), 'approved') = 'approved'
      and lower(btrim(dentist.full_name)) = lower(btrim(dentist_availability.dentist_name))
  )
);

drop policy if exists dentist_availability_update_own on public.dentist_availability;
create policy dentist_availability_update_own
on public.dentist_availability
for update
to authenticated
using (
  exists (
    select 1
    from public.staff_users dentist
    where dentist.auth_user_id = (select auth.uid())
      and (lower(dentist.role) = 'dentist' or dentist.id = 2)
      and dentist.archived_at is null
      and coalesce(lower(dentist.account_status), 'approved') = 'approved'
      and lower(btrim(dentist.full_name)) = lower(btrim(dentist_availability.dentist_name))
  )
)
with check (
  exists (
    select 1
    from public.staff_users dentist
    where dentist.auth_user_id = (select auth.uid())
      and (lower(dentist.role) = 'dentist' or dentist.id = 2)
      and dentist.archived_at is null
      and coalesce(lower(dentist.account_status), 'approved') = 'approved'
      and lower(btrim(dentist.full_name)) = lower(btrim(dentist_availability.dentist_name))
  )
);
