-- The supplied Supabase project already included this automatic RLS event trigger.
-- Revoking direct API invocation leaves automatic event-trigger execution intact.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
