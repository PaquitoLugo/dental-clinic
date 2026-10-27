alter table public.tooth_chart enable row level security;
alter table public.tooth_chart_history enable row level security;

grant select on public.tooth_chart, public.tooth_chart_history to authenticated;
grant insert, update on public.tooth_chart to authenticated;
grant insert on public.tooth_chart_history to authenticated;

drop policy if exists tooth_chart_select_patient on public.tooth_chart;
create policy tooth_chart_select_patient
on public.tooth_chart
for select
to authenticated
using (
  exists (
    select 1
    from public.staff_users patient
    where patient.id::text = tooth_chart.patient_id::text
      and patient.auth_user_id = (select auth.uid())
      and (lower(patient.role) = 'patient' or patient.id = 4)
      and patient.archived_at is null
      and coalesce(lower(patient.account_status), 'approved') = 'approved'
  )
);

drop policy if exists tooth_chart_select_clinical_staff on public.tooth_chart;
create policy tooth_chart_select_clinical_staff
on public.tooth_chart
for select
to authenticated
using (
  exists (
    select 1
    from public.staff_users staff
    where staff.auth_user_id = (select auth.uid())
      and (
        lower(staff.role) in ('dentist', 'assistant', 'manager')
        or staff.id in (1, 2, 3)
      )
      and staff.archived_at is null
      and coalesce(lower(staff.account_status), 'approved') = 'approved'
  )
);

drop policy if exists tooth_chart_dentist_insert_in_treatment on public.tooth_chart;
create policy tooth_chart_dentist_insert_in_treatment
on public.tooth_chart
for insert
to authenticated
with check (
  exists (
    select 1
    from public.staff_users dentist
    join public.appointments appointment
      on appointment.patient_id::text = tooth_chart.patient_id::text
    where dentist.auth_user_id = (select auth.uid())
      and (lower(dentist.role) = 'dentist' or dentist.id = 2)
      and dentist.archived_at is null
      and coalesce(lower(dentist.account_status), 'approved') = 'approved'
      and appointment.status = 'In Treatment'
      and (
        appointment.assigned_dentist is null
        or lower(btrim(appointment.assigned_dentist)) = lower(btrim(dentist.full_name))
      )
  )
);

drop policy if exists tooth_chart_dentist_update_in_treatment on public.tooth_chart;
create policy tooth_chart_dentist_update_in_treatment
on public.tooth_chart
for update
to authenticated
using (
  exists (
    select 1
    from public.staff_users dentist
    join public.appointments appointment
      on appointment.patient_id::text = tooth_chart.patient_id::text
    where dentist.auth_user_id = (select auth.uid())
      and (lower(dentist.role) = 'dentist' or dentist.id = 2)
      and dentist.archived_at is null
      and coalesce(lower(dentist.account_status), 'approved') = 'approved'
      and appointment.status = 'In Treatment'
      and (
        appointment.assigned_dentist is null
        or lower(btrim(appointment.assigned_dentist)) = lower(btrim(dentist.full_name))
      )
  )
)
with check (
  exists (
    select 1
    from public.staff_users dentist
    join public.appointments appointment
      on appointment.patient_id::text = tooth_chart.patient_id::text
    where dentist.auth_user_id = (select auth.uid())
      and (lower(dentist.role) = 'dentist' or dentist.id = 2)
      and dentist.archived_at is null
      and coalesce(lower(dentist.account_status), 'approved') = 'approved'
      and appointment.status = 'In Treatment'
      and (
        appointment.assigned_dentist is null
        or lower(btrim(appointment.assigned_dentist)) = lower(btrim(dentist.full_name))
      )
  )
);

drop policy if exists tooth_chart_history_select_patient on public.tooth_chart_history;
create policy tooth_chart_history_select_patient
on public.tooth_chart_history
for select
to authenticated
using (
  exists (
    select 1
    from public.staff_users patient
    where patient.id::text = tooth_chart_history.patient_id::text
      and patient.auth_user_id = (select auth.uid())
      and (lower(patient.role) = 'patient' or patient.id = 4)
      and patient.archived_at is null
      and coalesce(lower(patient.account_status), 'approved') = 'approved'
  )
);

drop policy if exists tooth_chart_history_select_clinical_staff on public.tooth_chart_history;
create policy tooth_chart_history_select_clinical_staff
on public.tooth_chart_history
for select
to authenticated
using (
  exists (
    select 1
    from public.staff_users staff
    where staff.auth_user_id = (select auth.uid())
      and (
        lower(staff.role) in ('dentist', 'assistant', 'manager')
        or staff.id in (1, 2, 3)
      )
      and staff.archived_at is null
      and coalesce(lower(staff.account_status), 'approved') = 'approved'
  )
);

drop policy if exists tooth_chart_history_dentist_insert_in_treatment on public.tooth_chart_history;
create policy tooth_chart_history_dentist_insert_in_treatment
on public.tooth_chart_history
for insert
to authenticated
with check (
  exists (
    select 1
    from public.staff_users dentist
    join public.appointments appointment
      on appointment.patient_id::text = tooth_chart_history.patient_id::text
    where dentist.auth_user_id = (select auth.uid())
      and (lower(dentist.role) = 'dentist' or dentist.id = 2)
      and dentist.archived_at is null
      and coalesce(lower(dentist.account_status), 'approved') = 'approved'
      and appointment.status = 'In Treatment'
      and (
        appointment.assigned_dentist is null
        or lower(btrim(appointment.assigned_dentist)) = lower(btrim(dentist.full_name))
      )
  )
);
