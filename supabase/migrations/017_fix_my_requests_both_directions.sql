-- ============================================================================
-- 017_fix_my_requests_both_directions.sql
-- link_my_requests now returns:
--   sent_by_me    — requests I sent (outgoing, for tracking)
--   received      — requests sent TO me with status 'sent' (to accept/decline)
--   accepted      — requests I accepted (incoming that I accepted)
-- ============================================================================

create or replace function public.link_my_requests(p_session_hash text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  s record;
  v_sent_by_me    jsonb;
  v_received      jsonb;
  v_accepted      jsonb;
begin
  select * into s from public.link_session_info(p_session_hash);

  -- Requests I sent (outgoing)
  select coalesce(jsonb_agg(
    jsonb_build_object('candidate_code', t.candidate_code, 'status', ir.status, 'created_at', ir.created_at)
    order by ir.created_at
  ), '[]'::jsonb)
  into v_sent_by_me
  from (
    select * from public.interest_requests
    where event_id = s.event_id
      and from_registration_id = s.registration_id
      and status = 'sent'
    order by created_at limit 8
  ) ir
  join public.registrations t on t.id = ir.to_registration_id;

  -- Requests sent TO me (incoming, pending acceptance)
  select coalesce(jsonb_agg(
    jsonb_build_object('candidate_code', f.candidate_code, 'status', ir.status, 'created_at', ir.created_at)
    order by ir.created_at
  ), '[]'::jsonb)
  into v_received
  from (
    select * from public.interest_requests
    where event_id = s.event_id
      and to_registration_id = s.registration_id
      and status = 'sent'
    order by created_at limit 8
  ) ir
  join public.registrations f on f.id = ir.from_registration_id;

  -- Requests I accepted (incoming that I accepted)
  select coalesce(jsonb_agg(
    jsonb_build_object('candidate_code', f.candidate_code, 'accepted_at', ir.accepted_at)
    order by ir.accepted_at
  ), '[]'::jsonb)
  into v_accepted
  from public.interest_requests ir
  join public.registrations f on f.id = ir.from_registration_id
  where ir.event_id = s.event_id
    and ir.to_registration_id = s.registration_id
    and ir.status = 'accepted';

  return jsonb_build_object(
    'ok', true,
    'items', v_sent_by_me,
    'requests_used', jsonb_array_length(v_sent_by_me),
    'max_requests', 8,
    'received_items', v_received,
    'accepted_items', v_accepted,
    'accepted_count', jsonb_array_length(v_accepted),
    'max_accepted', 4,
    'closes_at', s.closes_at,
    'server_now', now()
  );
end;
$$;

grant execute on function public.link_my_requests to anon, authenticated;
