-- Remove the application-session marker that was used only by the retired
-- multi-factor authentication flow. Supabase Auth factors are removed through
-- the guarded administrative cleanup script because they belong to auth.users.

alter table public.application_sessions
  drop column if exists mfa_verified_at;
