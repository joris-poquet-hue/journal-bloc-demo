-- Statistiques agrégées des messages Administrateur.
-- Les destinataires programmés sont estimés sans créer de notification avant
-- l'envoi. Après distribution, les compteurs reposent sur les lignes réelles.

create or replace function public.list_admin_notification_messages_with_stats()
returns table (
  id uuid,
  title text,
  body text,
  audience_type text,
  audience_role public.app_role,
  audience_institution_id uuid,
  audience_profile_id uuid,
  deletion_policy text,
  action_label text,
  action_type text,
  action_target text,
  scheduled_at timestamptz,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  sent_at timestamptz,
  cancelled_at timestamptz,
  retracted_at timestamptz,
  recipient_count integer,
  unread_count integer,
  read_count integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Accès réservé à l’administrateur.' using errcode = '42501';
  end if;

  return query
  select
    message.id,
    message.title,
    message.body,
    message.audience_type,
    message.audience_role,
    message.audience_institution_id,
    message.audience_profile_id,
    message.deletion_policy,
    message.action_label,
    message.action_type,
    message.action_target,
    message.scheduled_at,
    message.status,
    message.created_at,
    message.updated_at,
    message.sent_at,
    message.cancelled_at,
    message.retracted_at,
    case
      when message.status = 'scheduled' then (
        select count(*)::integer
        from public.admin_notification_recipient_ids(
          message.audience_type,
          message.audience_role,
          message.audience_institution_id,
          message.audience_profile_id
        )
      )
      else coalesce(delivered.recipient_count, 0)
    end as recipient_count,
    case
      when message.status = 'scheduled' then 0
      else coalesce(delivered.unread_count, 0)
    end as unread_count,
    case
      when message.status = 'scheduled' then 0
      else coalesce(delivered.read_count, 0)
    end as read_count
  from public.admin_notification_messages message
  left join (
    select
      notification.admin_message_id,
      count(*)::integer as recipient_count,
      count(*) filter (where notification.read_at is null)::integer
        as unread_count,
      count(*) filter (where notification.read_at is not null)::integer
        as read_count
    from public.user_notifications notification
    where notification.admin_message_id is not null
    group by notification.admin_message_id
  ) delivered on delivered.admin_message_id = message.id
  order by message.created_at desc;
end;
$$;

revoke all on function public.list_admin_notification_messages_with_stats()
  from public, anon, authenticated;
grant execute on function public.list_admin_notification_messages_with_stats()
  to authenticated;
