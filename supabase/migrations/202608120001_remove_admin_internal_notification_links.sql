-- Retire les liens internes des messages Administrateur sans toucher aux
-- actions métier automatiques vers une intervention ou un trophée.

begin;

update public.admin_notification_messages
set
  action_label = null,
  action_type = null,
  action_target = null,
  updated_at = now()
where action_type = 'internal_path';

update public.user_notifications
set
  action_label = null,
  action_type = null,
  action_target = null
where kind = 'admin_message'
  and action_type = 'internal_path';

alter table public.admin_notification_messages
  drop constraint if exists admin_notification_messages_action_type_check,
  drop constraint if exists admin_notification_messages_action_check;

alter table public.admin_notification_messages
  add constraint admin_notification_messages_action_type_check
    check (action_type is null or action_type = 'external_url'),
  add constraint admin_notification_messages_action_check
    check (
      (action_label is null and action_type is null and action_target is null)
      or (
        length(btrim(coalesce(action_label, ''))) between 1 and 60
        and action_type = 'external_url'
        and length(btrim(coalesce(action_target, ''))) between 1 and 500
        and action_target ~* '^https://'
      )
    );

alter table public.user_notifications
  drop constraint if exists user_notifications_action_type_check;

alter table public.user_notifications
  add constraint user_notifications_action_type_check
    check (
      action_type is null
      or action_type in ('trophy', 'intervention', 'external_url')
    );

commit;
