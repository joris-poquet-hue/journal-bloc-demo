-- Un message Administrateur distribué est définitif.
-- Les anciens statuts « retracted » restent lisibles pour l'historique, mais
-- aucun nouveau retrait n'est désormais possible, même via un ancien client.

revoke all on function public.retract_admin_notification_message(uuid)
  from public, anon, authenticated, service_role;

drop function if exists public.retract_admin_notification_message(uuid);
