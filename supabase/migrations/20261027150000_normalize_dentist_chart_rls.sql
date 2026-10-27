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
            where lower(btrim(appointment.assigned_dentist)) = lower(btrim(staff.full_name))
              and (
                appointment.patient_id::text = tooth_chart.patient_id::text
                or (
                  appointment.patient_id is null
                  and exists (
                    select 1
                    from public.staff_users patient
                    where patient.id::text = tooth_chart.patient_id::text
                      and trim(regexp_replace(
                        regexp_replace(lower(coalesce(patient.full_name, '')), '[^a-z0-9]+', ' ', 'g'),
                        '(^| )[a-z0-9]( |$)', ' ', 'g'
                      )) = trim(regexp_replace(
                        regexp_replace(lower(coalesce(appointment.patient_name, '')), '[^a-z0-9]+', ' ', 'g'),
                        '(^| )[a-z0-9]( |$)', ' ', 'g'
                      ))
                  )
                )
              )
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
      on (
        appointment.patient_id::text = tooth_chart.patient_id::text
        or (
          appointment.patient_id is null
          and exists (
            select 1
            from public.staff_users patient
            where patient.id::text = tooth_chart.patient_id::text
              and trim(regexp_replace(
                regexp_replace(lower(coalesce(patient.full_name, '')), '[^a-z0-9]+', ' ', 'g'),
                '(^| )[a-z0-9]( |$)', ' ', 'g'
              )) = trim(regexp_replace(
                regexp_replace(lower(coalesce(appointment.patient_name, '')), '[^a-z0-9]+', ' ', 'g'),
                '(^| )[a-z0-9]( |$)', ' ', 'g'
              ))
          )
        )
      )
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
      on (
        appointment.patient_id::text = tooth_chart.patient_id::text
        or (
          appointment.patient_id is null
          and exists (
            select 1
            from public.staff_users patient
            where patient.id::text = tooth_chart.patient_id::text
              and trim(regexp_replace(
                regexp_replace(lower(coalesce(patient.full_name, '')), '[^a-z0-9]+', ' ', 'g'),
                '(^| )[a-z0-9]( |$)', ' ', 'g'
              )) = trim(regexp_replace(
                regexp_replace(lower(coalesce(appointment.patient_name, '')), '[^a-z0-9]+', ' ', 'g'),
                '(^| )[a-z0-9]( |$)', ' ', 'g'
              ))
          )
        )
      )
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
      on (
        appointment.patient_id::text = tooth_chart.patient_id::text
        or (
          appointment.patient_id is null
          and exists (
            select 1
            from public.staff_users patient
            where patient.id::text = tooth_chart.patient_id::text
              and trim(regexp_replace(
                regexp_replace(lower(coalesce(patient.full_name, '')), '[^a-z0-9]+', ' ', 'g'),
                '(^| )[a-z0-9]( |$)', ' ', 'g'
              )) = trim(regexp_replace(
                regexp_replace(lower(coalesce(appointment.patient_name, '')), '[^a-z0-9]+', ' ', 'g'),
                '(^| )[a-z0-9]( |$)', ' ', 'g'
              ))
          )
        )
      )
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
            where lower(btrim(appointment.assigned_dentist)) = lower(btrim(staff.full_name))
              and (
                appointment.patient_id::text = tooth_chart_history.patient_id::text
                or (
                  appointment.patient_id is null
                  and exists (
                    select 1
                    from public.staff_users patient
                    where patient.id::text = tooth_chart_history.patient_id::text
                      and trim(regexp_replace(
                        regexp_replace(lower(coalesce(patient.full_name, '')), '[^a-z0-9]+', ' ', 'g'),
                        '(^| )[a-z0-9]( |$)', ' ', 'g'
                      )) = trim(regexp_replace(
                        regexp_replace(lower(coalesce(appointment.patient_name, '')), '[^a-z0-9]+', ' ', 'g'),
                        '(^| )[a-z0-9]( |$)', ' ', 'g'
                      ))
                  )
                )
              )
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
      on (
        appointment.patient_id::text = tooth_chart_history.patient_id::text
        or (
          appointment.patient_id is null
          and exists (
            select 1
            from public.staff_users patient
            where patient.id::text = tooth_chart_history.patient_id::text
              and trim(regexp_replace(
                regexp_replace(lower(coalesce(patient.full_name, '')), '[^a-z0-9]+', ' ', 'g'),
                '(^| )[a-z0-9]( |$)', ' ', 'g'
              )) = trim(regexp_replace(
                regexp_replace(lower(coalesce(appointment.patient_name, '')), '[^a-z0-9]+', ' ', 'g'),
                '(^| )[a-z0-9]( |$)', ' ', 'g'
              ))
          )
        )
      )
    where dentist.auth_user_id = (select auth.uid())
      and (lower(dentist.role) = 'dentist' or dentist.id = 2)
      and dentist.archived_at is null
      and coalesce(lower(dentist.account_status), 'approved') = 'approved'
      and appointment.status = 'In Treatment'
      and lower(btrim(appointment.assigned_dentist)) = lower(btrim(dentist.full_name))
  )
);
