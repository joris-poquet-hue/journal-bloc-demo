-- Retire l’ancienne fonctionnalité « Remarques de test » sans supprimer
-- la table ni aucun enregistrement historique.

alter table public.test_feedback enable row level security;

drop policy if exists "test_feedback_select_admin" on public.test_feedback;
drop policy if exists "test_feedback_select_visible" on public.test_feedback;
drop policy if exists "test_feedback_insert_authenticated" on public.test_feedback;
drop policy if exists "test_feedback_admin_delete" on public.test_feedback;

drop trigger if exists set_test_feedback_identity on public.test_feedback;
drop trigger if exists audit_test_feedback_version on public.test_feedback;
drop function if exists public.set_test_feedback_identity();

revoke all privileges on table public.test_feedback from public;
revoke all privileges on table public.test_feedback from anon;
revoke all privileges on table public.test_feedback from authenticated;

comment on table public.test_feedback is
  'Historique conservé en lecture administrative SQL uniquement. Fonctionnalité applicative retirée le 2026-07-27.';
