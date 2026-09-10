-- Add privacy-preserving device session metadata and a bounded notebook
-- revision history. No existing business record is deleted by this migration.

alter table public.application_sessions
  add column if not exists device_label text,
  add column if not exists mfa_verified_at timestamptz;

alter table public.application_sessions
  drop constraint if exists application_sessions_device_label_check;

alter table public.application_sessions
  add constraint application_sessions_device_label_check
  check (
    device_label is null
    or char_length(device_label) between 1 and 120
  );

create or replace function public.revoke_other_application_sessions(
  p_profile_id uuid,
  p_current_session_id uuid,
  p_reason text default 'user_revoked_other_sessions'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  revoked_count integer := 0;
begin
  if not exists (
    select 1
    from public.application_sessions session_row
    where session_row.id = p_current_session_id
      and session_row.profile_id = p_profile_id
      and session_row.revoked_at is null
  ) then
    raise exception 'Current application session not found.'
      using errcode = '42501';
  end if;

  update public.application_sessions session_row
  set
    revoked_at = coalesce(session_row.revoked_at, clock_timestamp()),
    revocation_reason = coalesce(
      session_row.revocation_reason,
      nullif(btrim(coalesce(p_reason, '')), ''),
      'user_revoked_other_sessions'
    )
  where session_row.profile_id = p_profile_id
    and session_row.id <> p_current_session_id
    and session_row.revoked_at is null;

  get diagnostics revoked_count = row_count;
  return revoked_count;
end;
$$;

revoke all on function public.revoke_other_application_sessions(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.revoke_other_application_sessions(uuid, uuid, text)
  to service_role;

create table if not exists public.notebook_document_versions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  source_version bigint not null check (source_version >= 1),
  content_html text not null default '',
  source_updated_at timestamptz not null,
  source_updated_by_profile_id uuid references public.profiles(id) on delete set null,
  archived_at timestamptz not null default clock_timestamp(),
  unique (profile_id, source_version)
);

create index if not exists notebook_document_versions_profile_archived_idx
  on public.notebook_document_versions (profile_id, archived_at desc);

alter table public.notebook_document_versions enable row level security;

revoke all on table public.notebook_document_versions from anon, authenticated;
grant select on table public.notebook_document_versions to authenticated;
grant select, insert, update, delete
  on table public.notebook_document_versions
  to service_role;

drop policy if exists "notebook_versions_select_owner"
  on public.notebook_document_versions;
create policy "notebook_versions_select_owner"
on public.notebook_document_versions for select
to authenticated
using (
  profile_id = public.current_profile_id()
  and public.current_app_role() = 'internal'::public.app_role
);

create or replace function public.archive_notebook_document_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  latest_archive_at timestamptz;
begin
  if old.content_html is not distinct from new.content_html then
    return new;
  end if;

  select version_row.archived_at
  into latest_archive_at
  from public.notebook_document_versions version_row
  where version_row.profile_id = old.profile_id
  order by version_row.archived_at desc
  limit 1;

  if latest_archive_at is null
     or latest_archive_at < clock_timestamp() - interval '5 minutes'
  then
    insert into public.notebook_document_versions (
      profile_id,
      source_version,
      content_html,
      source_updated_at,
      source_updated_by_profile_id
    )
    values (
      old.profile_id,
      greatest(coalesce(old.version, 1), 1),
      old.content_html,
      old.updated_at,
      old.updated_by_profile_id
    )
    on conflict (profile_id, source_version) do nothing;
  end if;

  delete from public.notebook_document_versions version_row
  where version_row.profile_id = old.profile_id
    and version_row.id in (
      select retained_candidate.id
      from public.notebook_document_versions retained_candidate
      where retained_candidate.profile_id = old.profile_id
      order by retained_candidate.archived_at desc
      offset 50
    );

  return new;
end;
$$;

drop trigger if exists archive_notebook_document_version
  on public.notebook_documents;
create trigger archive_notebook_document_version
after update of content_html on public.notebook_documents
for each row
execute function public.archive_notebook_document_version();

create or replace function public.restore_notebook_document_version(
  p_snapshot_id uuid,
  p_expected_version bigint
)
returns setof public.notebook_documents
language plpgsql
security definer
set search_path = public
as $$
declare
  active_profile_id uuid := public.current_profile_id();
  current_document public.notebook_documents%rowtype;
  selected_snapshot public.notebook_document_versions%rowtype;
begin
  if public.current_app_role() <> 'internal'::public.app_role
     or active_profile_id is null
  then
    raise exception 'Notebook restore is restricted to its owner.'
      using errcode = '42501';
  end if;

  select snapshot_row.*
  into selected_snapshot
  from public.notebook_document_versions snapshot_row
  where snapshot_row.id = p_snapshot_id
    and snapshot_row.profile_id = active_profile_id;

  if selected_snapshot.id is null then
    raise exception 'Notebook snapshot not found.' using errcode = 'P0002';
  end if;

  select document_row.*
  into current_document
  from public.notebook_documents document_row
  where document_row.profile_id = active_profile_id
  for update;

  if current_document.profile_id is null
     or current_document.version <> p_expected_version
  then
    raise exception 'A newer notebook version exists.' using errcode = '40001';
  end if;

  insert into public.notebook_document_versions (
    profile_id,
    source_version,
    content_html,
    source_updated_at,
    source_updated_by_profile_id
  )
  values (
    current_document.profile_id,
    greatest(current_document.version, 1),
    current_document.content_html,
    current_document.updated_at,
    current_document.updated_by_profile_id
  )
  on conflict (profile_id, source_version) do nothing;

  update public.notebook_documents document_row
  set content_html = selected_snapshot.content_html
  where document_row.profile_id = active_profile_id;

  return query
  select document_row.*
  from public.notebook_documents document_row
  where document_row.profile_id = active_profile_id;
end;
$$;

revoke all on function public.restore_notebook_document_version(uuid, bigint)
  from public, anon;
grant execute on function public.restore_notebook_document_version(uuid, bigint)
  to authenticated, service_role;

comment on table public.notebook_document_versions is
  'Bounded private notebook snapshots used for explicit recovery and merge.';
