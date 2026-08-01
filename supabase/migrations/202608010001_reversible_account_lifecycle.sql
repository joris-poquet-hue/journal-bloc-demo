-- Account deactivation is reversible. The Auth identity is retained and banned,
-- while profile state, application-session revocation and audit are committed
-- together. Reactivation never restores old sessions or push subscriptions.

alter table public.profiles
  drop constraint if exists profiles_auth_user_id_fkey;

alter table public.profiles
  add constraint profiles_auth_user_id_fkey
  foreign key (auth_user_id)
  references auth.users(id)
  on delete restrict;

create or replace function public.protect_profile_account_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.auth_user_id is not null and new.auth_user_id is null then
    raise exception
      'L’identité Supabase Auth d’un profil ne peut pas être détachée.'
      using errcode = '55000';
  end if;

  if old.is_active is distinct from new.is_active
    and coalesce(
      current_setting('app.allow_profile_account_lifecycle', true),
      ''
    ) <> 'on'
  then
    raise exception
      'Utilisez la fonction atomique de cycle de vie du compte.'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_account_lifecycle
  on public.profiles;
create trigger protect_profile_account_lifecycle
before update of auth_user_id, is_active on public.profiles
for each row execute function public.protect_profile_account_lifecycle();

create or replace function public.set_profile_account_lifecycle(
  p_profile_id uuid,
  p_expected_version bigint,
  p_target_is_active boolean,
  p_actor_profile_id uuid
)
returns public.profiles
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor_profile public.profiles%rowtype;
  target_profile public.profiles%rowtype;
  saved_profile public.profiles%rowtype;
  lifecycle_at timestamptz := clock_timestamp();
  revoked_session_count integer := 0;
  lifecycle_action text;
  lifecycle_event text;
begin
  if p_target_is_active is null then
    raise exception 'L’état cible du compte est obligatoire.'
      using errcode = '22004';
  end if;

  select profile.*
  into actor_profile
  from public.profiles profile
  where profile.id = p_actor_profile_id
    and profile.role = 'admin'::public.app_role
    and profile.is_active
  for share;

  if actor_profile.id is null then
    raise exception 'Un Administrateur actif est requis.'
      using errcode = '42501';
  end if;

  select profile.*
  into target_profile
  from public.profiles profile
  where profile.id = p_profile_id
  for update;

  if target_profile.id is null then
    raise exception 'Profil introuvable.' using errcode = 'P0002';
  end if;

  if target_profile.auth_user_id is null then
    raise exception
      'Le profil ne possède plus d’identité Supabase Auth.'
      using errcode = '55000';
  end if;

  if target_profile.version <> p_expected_version then
    raise exception
      'Le profil a été modifié par une autre session.'
      using errcode = '40001';
  end if;

  if target_profile.is_active = p_target_is_active then
    raise exception
      'Le profil possède déjà l’état demandé.'
      using errcode = '55000';
  end if;

  if not p_target_is_active and target_profile.id = actor_profile.id then
    raise exception
      'Le compte Administrateur connecté ne peut pas être désactivé.'
      using errcode = '42501';
  end if;

  if not p_target_is_active then
    update public.application_sessions
    set
      revoked_at = coalesce(revoked_at, lifecycle_at),
      revocation_reason = coalesce(
        revocation_reason,
        'account_deactivated'
      )
    where profile_id = target_profile.id
      and revoked_at is null;

    get diagnostics revoked_session_count = row_count;

    delete from auth.sessions
    where user_id = target_profile.auth_user_id;

    update public.push_subscriptions
    set
      is_active = false,
      updated_at = lifecycle_at
    where profile_id = target_profile.id
      and is_active;
  end if;

  perform set_config(
    'app.allow_profile_account_lifecycle',
    'on',
    true
  );

  update public.profiles profile
  set
    is_active = p_target_is_active,
    metadata = case
      when p_target_is_active then
        (coalesce(profile.metadata, '{}'::jsonb) - 'deactivatedAt')
        || jsonb_build_object(
          'accountLifecycle',
          coalesce(profile.metadata -> 'accountLifecycle', '{}'::jsonb)
          || jsonb_build_object(
            'status', 'active',
            'reactivatedAt', lifecycle_at,
            'reactivatedByProfileId', actor_profile.id,
            'authIdentityPreserved', true
          )
        )
      else
        coalesce(profile.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'deactivatedAt', lifecycle_at,
          'accountLifecycle',
          coalesce(profile.metadata -> 'accountLifecycle', '{}'::jsonb)
          || jsonb_build_object(
            'status', 'inactive',
            'deactivatedAt', lifecycle_at,
            'deactivatedByProfileId', actor_profile.id,
            'authIdentityPreserved', true
          )
        )
    end,
    updated_by_profile_id = actor_profile.id
  where profile.id = target_profile.id
    and profile.version = p_expected_version
  returning profile.* into saved_profile;

  if saved_profile.id is null then
    raise exception
      'Le profil a été modifié par une autre session.'
      using errcode = '40001';
  end if;

  lifecycle_action := case
    when p_target_is_active then 'Compte réactivé'
    else 'Compte désactivé'
  end;
  lifecycle_event := case
    when p_target_is_active then 'reactivated'
    else 'deactivated'
  end;

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
    actor_profile.id,
    actor_profile.role,
    trim(concat_ws(
      ' ',
      actor_profile.first_name,
      actor_profile.last_name
    )),
    lifecycle_action,
    'Compte utilisateur',
    trim(concat_ws(
      ' ',
      target_profile.first_name,
      target_profile.last_name
    )),
    actor_profile.id,
    jsonb_build_object(
      'kind', 'account_lifecycle',
      'event', lifecycle_event,
      'targetProfileId', target_profile.id,
      'targetAuthUserId', target_profile.auth_user_id,
      'authIdentityPreserved', true,
      'revokedApplicationSessions', revoked_session_count
    )
  );

  return saved_profile;
end;
$$;

revoke all on function public.set_profile_account_lifecycle(
  uuid,
  bigint,
  boolean,
  uuid
) from public, anon, authenticated;
grant execute on function public.set_profile_account_lifecycle(
  uuid,
  bigint,
  boolean,
  uuid
) to service_role;

comment on function public.set_profile_account_lifecycle(
  uuid,
  bigint,
  boolean,
  uuid
) is
  'Atomically changes profile activity, revokes sessions on deactivation and records an explicit lifecycle audit event. The Auth identity is managed through the server Auth API and is never deleted.';
