-- ============================================================================
-- 018_fix_accept_request_grant.sql
-- link_accept_request was created after 008_candidate_links.sql, which is the
-- migration that granted EXECUTE on the link_* functions to service_role.
-- The newer function therefore never received the service_role grant.
--
-- The edge functions call every link_* function with the service_role key
-- (getServiceClient in _shared/edge.ts), so the accept RPC failed with
-- "permission denied for function link_accept_request" and the front-end
-- reported session_invalid / request_failed.
--
-- Fix: grant service_role execute on link_accept_request and link_my_requests,
-- and revoke direct anon / authenticated access — edge functions must be the
-- only callers.
-- ============================================================================

revoke all on function public.link_accept_request(text, text) from public, anon, authenticated;
revoke all on function public.link_my_requests(text) from public, anon, authenticated;

grant execute on function public.link_accept_request(text, text) to service_role;
grant execute on function public.link_my_requests(text) to service_role;
