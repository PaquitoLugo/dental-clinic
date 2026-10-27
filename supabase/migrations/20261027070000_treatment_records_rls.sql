alter table public.treatment_records enable row level security;

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
      and (
        appointment.assigned_dentist is null
        or lower(btrim(appointment.assigned_dentist)) = lower(btrim(dentist.full_name))
      )
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
      and (
        appointment.assigned_dentist is null
        or lower(btrim(appointment.assigned_dentist)) = lower(btrim(dentist.full_name))
      )
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
      on appointment.id::text = treatment_records.appointment_id::text
    where dentist.auth_user_id = (select auth.uid())
      and (lower(dentist.role) = 'dentist' or dentist.id = 2)
      and dentist.archived_at is null
      and coalesce(lower(dentist.account_status), 'approved') = 'approved'
      and (
        appointment.assigned_dentist is null
        or lower(btrim(appointment.assigned_dentist)) = lower(btrim(dentist.full_name))
      )
      and treatment_records.patient_name = appointment.patient_name
      and (
        treatment_records.dentist_name is null
        or lower(btrim(treatment_records.dentist_name)) = lower(btrim(dentist.full_name))
      )
  )
);

drop policy if exists treatment_records_assistant_select on public.treatment_records;
create policy treatment_records_assistant_select
on public.treatment_records
for select
to authenticated
using (
  exists (
    select 1
    from public.staff_users assistant
    where assistant.auth_user_id = (select auth.uid())
      and (lower(assistant.role) = 'assistant' or assistant.id = 3)
      and assistant.archived_at is null
      and coalesce(lower(assistant.account_status), 'approved') = 'approved'
  )
);

drop policy if exists treatment_records_manager_select on public.treatment_records;
create policy treatment_records_manager_select
on public.treatment_records
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

drop policy if exists treatment_records_patient_select on public.treatment_records;
create policy treatment_records_patient_select
on public.treatment_records
for select
to authenticated
using (
  exists (
    select 1
    from public.staff_users patient
    join public.appointments appointment
      on appointment.id::text = treatment_records.appointment_id
    where patient.auth_user_id = (select auth.uid())
      and (lower(patient.role) = 'patient' or patient.id = 4)
      and patient.archived_at is null
      and coalesce(lower(patient.account_status), 'approved') = 'approved'
      and appointment.patient_id::text = patient.id::text
  )
);
