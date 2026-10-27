drop policy if exists treatment_records_dentist_select on public.treatment_records;
create policy treatment_records_dentist_select
on public.treatment_records
for select
to authenticated
using (
  exists (
    select 1
    from public.staff_users dentist
    join public.appointments appointment
      on appointment.id::text = treatment_records.appointment_id::text
    where dentist.auth_user_id = (select auth.uid())
      and (lower(dentist.role) = 'dentist' or dentist.id = 2)
      and dentist.archived_at is null
      and coalesce(lower(dentist.account_status), 'approved') = 'approved'
      and lower(btrim(appointment.assigned_dentist)) = lower(btrim(dentist.full_name))
  )
);

drop policy if exists treatment_records_dentist_insert on public.treatment_records;
create policy treatment_records_dentist_insert
on public.treatment_records
for insert
to authenticated
with check (
  exists (
    select 1
    from public.staff_users dentist
    join public.appointments appointment
      on appointment.id::text = treatment_records.appointment_id::text
    where dentist.auth_user_id = (select auth.uid())
      and (lower(dentist.role) = 'dentist' or dentist.id = 2)
      and dentist.archived_at is null
      and coalesce(lower(dentist.account_status), 'approved') = 'approved'
      and lower(btrim(appointment.assigned_dentist)) = lower(btrim(dentist.full_name))
      and treatment_records.patient_name = appointment.patient_name
      and (
        treatment_records.dentist_name is null
        or lower(btrim(treatment_records.dentist_name)) = lower(btrim(dentist.full_name))
      )
  )
);

drop policy if exists treatment_records_dentist_update on public.treatment_records;
create policy treatment_records_dentist_update
on public.treatment_records
for update
to authenticated
using (
  exists (
    select 1
    from public.staff_users dentist
    join public.appointments appointment
      on appointment.id::text = treatment_records.appointment_id::text
    where dentist.auth_user_id = (select auth.uid())
      and (lower(dentist.role) = 'dentist' or dentist.id = 2)
      and dentist.archived_at is null
      and coalesce(lower(dentist.account_status), 'approved') = 'approved'
      and lower(btrim(appointment.assigned_dentist)) = lower(btrim(dentist.full_name))
  )
)
with check (
  exists (
    select 1
    from public.staff_users dentist
    join public.appointments appointment
      on appointment.id::text = treatment_records.appointment_id::text
    where dentist.auth_user_id = (select auth.uid())
      and (lower(dentist.role) = 'dentist' or dentist.id = 2)
      and dentist.archived_at is null
      and coalesce(lower(dentist.account_status), 'approved') = 'approved'
      and lower(btrim(appointment.assigned_dentist)) = lower(btrim(dentist.full_name))
      and treatment_records.patient_name = appointment.patient_name
      and (
        treatment_records.dentist_name is null
        or lower(btrim(treatment_records.dentist_name)) = lower(btrim(dentist.full_name))
      )
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
      and staff.archived_at is null
      and coalesce(lower(staff.account_status), 'approved') = 'approved'
      and (
        lower(staff.role) in ('assistant', 'manager')
        or staff.id in (1, 3)
        or (
          (lower(staff.role) = 'dentist' or staff.id = 2)
          and exists (
            select 1
            from public.appointments appointment
            where appointment.patient_id::text = tooth_chart.patient_id::text
              and lower(btrim(appointment.assigned_dentist)) = lower(btrim(staff.full_name))
          )
        )
      )
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
      and lower(btrim(appointment.assigned_dentist)) = lower(btrim(dentist.full_name))
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
      and lower(btrim(appointment.assigned_dentist)) = lower(btrim(dentist.full_name))
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
      and lower(btrim(appointment.assigned_dentist)) = lower(btrim(dentist.full_name))
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
      and staff.archived_at is null
      and coalesce(lower(staff.account_status), 'approved') = 'approved'
      and (
        lower(staff.role) in ('assistant', 'manager')
        or staff.id in (1, 3)
        or (
          (lower(staff.role) = 'dentist' or staff.id = 2)
          and exists (
            select 1
            from public.appointments appointment
            where appointment.patient_id::text = tooth_chart_history.patient_id::text
              and lower(btrim(appointment.assigned_dentist)) = lower(btrim(staff.full_name))
          )
        )
      )
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
      and lower(btrim(appointment.assigned_dentist)) = lower(btrim(dentist.full_name))
  )
);
