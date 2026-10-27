alter table public.activity_logs
  add column if not exists actor_id bigint,
  add column if not exists actor_role text,
  add column if not exists entity_type text,
  add column if not exists entity_id text;

alter table public.activity_logs enable row level security;

grant select, insert on public.activity_logs to authenticated;

drop policy if exists activity_logs_manager_select on public.activity_logs;
create policy activity_logs_manager_select
on public.activity_logs
for select
to authenticated
using (
  exists (
    select 1
    from public.staff_users manager
    where manager.auth_user_id = (select auth.uid())
      and (lower(manager.role) = 'manager' or manager.id = 1)
      and manager.archived_at is null
      and coalesce(lower(manager.account_status), 'approved') = 'approved'
  )
);

drop policy if exists activity_logs_insert_own on public.activity_logs;
create policy activity_logs_insert_own
on public.activity_logs
for insert
to authenticated
with check (
  exists (
    select 1
    from public.staff_users staff
    where staff.auth_user_id = (select auth.uid())
      and staff.id = activity_logs.actor_id
      and lower(coalesce(staff.role, case staff.id
        when 1 then 'manager'
        when 2 then 'dentist'
        when 3 then 'assistant'
        when 4 then 'patient'
        else ''
      end)) = lower(coalesce(activity_logs.actor_role, ''))
      and staff.archived_at is null
      and coalesce(lower(staff.account_status), 'approved') = 'approved'
  )
);
