create or replace function public.prevent_duplicate_patient_accounts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  submitted_name_parts text[];
  existing_name_parts text[];
  submitted_first_name text;
  submitted_last_name text;
  duplicate_id bigint;
begin
  if new.role <> 'patient' or new.birthdate is null then
    return new;
  end if;

  submitted_name_parts := regexp_split_to_array(
    btrim(coalesce(nullif(new.full_name, ''), concat_ws(' ', new.first_name, new.middle_name, new.last_name))),
    '\s+'
  );
  submitted_first_name := lower(regexp_replace(
    coalesce(nullif(btrim(new.first_name), ''), submitted_name_parts[1]),
    '[^[:alnum:]]', '', 'g'
  ));
  submitted_last_name := lower(regexp_replace(
    coalesce(nullif(btrim(new.last_name), ''), submitted_name_parts[array_length(submitted_name_parts, 1)]),
    '[^[:alnum:]]', '', 'g'
  ));

  if submitted_first_name = '' or submitted_last_name = '' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext(
    submitted_first_name || ':' || submitted_last_name || ':' || new.birthdate::text
  )::bigint);

  select existing.id
  into duplicate_id
  from public.staff_users existing
  cross join lateral (
    select regexp_split_to_array(btrim(existing.full_name), '\s+') as name_parts
  ) parsed
  where existing.role = 'patient'
    and existing.birthdate = new.birthdate
    and existing.id is distinct from new.id
    and lower(regexp_replace(
      coalesce(nullif(btrim(existing.first_name), ''), parsed.name_parts[1]),
      '[^[:alnum:]]', '', 'g'
    )) = submitted_first_name
    and lower(regexp_replace(
      coalesce(nullif(btrim(existing.last_name), ''), parsed.name_parts[array_length(parsed.name_parts, 1)]),
      '[^[:alnum:]]', '', 'g'
    )) = submitted_last_name
  limit 1;

  if duplicate_id is not null then
    raise exception 'A patient account with the same first name, last name, and birth date already exists.'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_duplicate_patient_accounts on public.staff_users;

create trigger prevent_duplicate_patient_accounts
before insert or update of full_name, first_name, last_name, middle_name, birthdate, role
on public.staff_users
for each row
execute function public.prevent_duplicate_patient_accounts();
