-- Finalize a confirmed e-mail address in one database transaction.
-- Supabase Auth confirms the address first; this RPC then updates the business
-- profile and records the corresponding audit event atomically.

create or replace function public.finalize_confirmed_email(
  p_profile_id uuid,
  p_confirmed_email text,
  p_purpose text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_profile public.profiles%rowtype;
  normalized_email text := lower(trim(coalesce(p_confirmed_email, '')));
  normalized_purpose text := lower(trim(coalesce(p_purpose, '')));
  auth_email text;
  pending_email text;
  pending_purpose text;
  current_contact_email text;
  saved_must_change_password boolean;
begin
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'A valid confirmed email is required'
      using errcode = '22023';
  end if;

  if normalized_purpose not in ('activation', 'change') then
    raise exception 'Invalid email confirmation purpose'
      using errcode = '22023';
  end if;

  select profile.*
  into target_profile
  from public.profiles profile
  where profile.id = p_profile_id
  for update;

  if target_profile.id is null then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  if not target_profile.is_active then
    raise exception 'Inactive profiles cannot confirm an email address'
      using errcode = '42501';
  end if;

  if target_profile.auth_user_id is null then
    raise exception 'The profile has no Auth identity'
      using errcode = '42501';
  end if;

  select lower(trim(coalesce(account.email, '')))
  into auth_email
  from auth.users account
  where account.id = target_profile.auth_user_id;

  if auth_email is null or auth_email <> normalized_email then
    raise exception 'The Auth email has not been confirmed'
      using errcode = '42501';
  end if;

  pending_email := lower(trim(coalesce(
    target_profile.metadata ->> 'pendingContactEmail',
    ''
  )));
  pending_purpose := lower(trim(coalesce(
    target_profile.metadata ->> 'pendingEmailPurpose',
    ''
  )));
  current_contact_email := lower(trim(coalesce(
    target_profile.metadata ->> 'contactEmail',
    ''
  )));

  if pending_email <> '' and pending_email <> normalized_email then
    raise exception 'The confirmed email does not match the pending request'
      using errcode = '42501';
  end if;

  if pending_purpose <> '' and pending_purpose <> normalized_purpose then
    raise exception 'The confirmation purpose does not match the pending request'
      using errcode = '42501';
  end if;

  if normalized_purpose = 'activation' and not target_profile.must_change_password then
    if pending_email = '' and current_contact_email = normalized_email then
      return jsonb_build_object(
        'alreadyFinalized', true,
        'contactEmail', normalized_email,
        'mustChangePassword', false
      );
    end if;

    raise exception 'The account is already activated'
      using errcode = '42501';
  end if;

  if normalized_purpose = 'change' and target_profile.must_change_password then
    raise exception 'First account activation is still required'
      using errcode = '42501';
  end if;

  if normalized_purpose = 'change'
    and pending_email = ''
    and current_contact_email = normalized_email then
    return jsonb_build_object(
      'alreadyFinalized', true,
      'contactEmail', normalized_email,
      'mustChangePassword', target_profile.must_change_password
    );
  end if;

  saved_must_change_password := case
    when normalized_purpose = 'activation' then false
    else target_profile.must_change_password
  end;

  update public.profiles
  set
    metadata = (
      coalesce(metadata, '{}'::jsonb)
      - 'pendingContactEmail'
      - 'pendingEmailPurpose'
      - 'pendingEmailRequestedAt'
    ) || jsonb_build_object('contactEmail', normalized_email),
    must_change_password = saved_must_change_password,
    updated_at = now(),
    updated_by_profile_id = target_profile.id
  where id = target_profile.id;

  insert into public.activity_log (
    profile_id,
    actor_role,
    actor_label,
    action,
    target_type,
    target_label,
    created_by_profile_id,
    analytics_event
  )
  values (
    target_profile.id,
    target_profile.role,
    trim(concat_ws(
      ' ',
      target_profile.first_name,
      target_profile.last_name
    )),
    case
      when normalized_purpose = 'activation'
        then 'Première connexion finalisée'
      else 'Adresse e-mail modifiée'
    end,
    'Compte utilisateur',
    target_profile.login_id::text,
    target_profile.id,
    jsonb_build_object(
      'kind', 'confirmed_email_lifecycle',
      'purpose', normalized_purpose,
      'profileId', target_profile.id
    )
  );

  return jsonb_build_object(
    'alreadyFinalized', false,
    'contactEmail', normalized_email,
    'mustChangePassword', saved_must_change_password
  );
end;
$$;

revoke all on function public.finalize_confirmed_email(uuid, text, text)
  from public;
grant execute on function public.finalize_confirmed_email(uuid, text, text)
  to service_role;
