-- The built-in RLS auto-enable event trigger is internal maintenance code.
-- Keep the postgres-owned event trigger intact but prevent direct RPC execution.
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated, service_role;
