-- ============================================================================
-- 017_fix_my_requests_both_directions.sql
-- Fix link_accept_request: receiver accepts by sender's code.
-- Fix link_my_requests: returns outgoing (items), incoming (received_items), accepted (accepted_items).
-- ============================================================================

create or replace function public.link_accept_request(p_session_hash text, p_target_code text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  s record;
  sender public.registrations%rowtype;
  ex public.interest_requests%rowtype;
  v_accepted int;
  v_used int;
begin
  select * into s from public.link_session_info(p_session_hash);

  select * into sender
  from public.registrations
  where registrations.event_id = s.event_id
    and registrations.candidate_code = upper(trim(p_target_code))
    and registrations.status = 'approved'
    and registrations.deleted_at is null
    and ((s.gender = 'man' and registrations.gender = 'woman')
      or (s.gender = 'woman' and registrations.gender = 'man'));

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  perform pg_advisory_xact_lock(hashtext('link_accept_req_' || s.registration_id::text));

  select * into ex
  from public.interest_requests
  where event_id = s.event_id
    and from_registration_id = sender.id
    and to_registration_id = s.registration_id
    and status = 'sent'
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select count(*) into v_accepted
  from public.interest_requests
  where event_id = s.event_id
    and to_registration_id = s.registration_id
    and status = 'accepted';

  if v_accepted >= 4 then
    return jsonb_build_object('ok', false, 'error', 'accepted_limit_full',
                              'accepted_count', v_accepted, 'max_accepted', 4);
  end if;

  update public.interest_requests
  set status = 'accepted', accepted_at = now()
  where id = ex.id;

  select count(*) into v_used
  from public.interest_requests
  where event_id = s.event_id
    and from_registration_id = s.registration_id
    and status = 'sent';

  return jsonb_build_object('ok', true,
                            'requests_used', v_used,
                            'max_requests', 8,
                            'ready_for_event', true);
end;
$$;

create or replace function public.link_my_requests(p_session_hash text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  s record;
  v_sent jsonb;
  v_received jsonb;
  v_accepted_items jsonb;
begin
  select * into s from public.link_session_info(p_session_hash);

  -- Requests I sent (outgoing)
  select coalesce(jsonb_agg(
    jsonb_build_object('candidate_code', t.candidate_code, 'status', ir.status, 'created_at', ir.created_at)
    order by ir.created_at
  ), '[]'::jsonb)
  into v_sent
  from (
    select * from public.interest_requests
    where event_id = s.event_id
      and from_registration_id = s.registration_id
      and status = 'sent'
    order by created_at limit 8
  ) ir
  join public.registrations t on t.id = ir.to_registration_id;

  -- Requests sent TO me (incoming, pending + accepted)
  select coalesce(jsonb_agg(
    jsonb_build_object('candidate_code', t.candidate_code, 'status', ir.status, 'created_at', ir.created_at)
    order by ir.created_at
  ), '[]'::jsonb)
  into v_received
  from public.interest_requests ir
  join public.registrations t on t.id = ir.from_registration_id
  where ir.event_id = s.event_id
    and ir.to_registration_id = s.registration_id
    and ir.status in ('sent', 'accepted');

  -- Accepted items (I accepted, for the accepted counter)
  select coalesce(jsonb_agg(
    jsonb_build_object('candidate_code', t.candidate_code, 'accepted_at', ir.accepted_at)
    order by ir.accepted_at
  ), '[]'::jsonb)
  into v_accepted_items
  from public.interest_requests ir
  join public.registrations t on t.id = ir.to_registration_id
  where ir.event_id = s.event_id
    and ir.from_registration_id = s.registration_id
    and ir.status = 'accepted';

  return jsonb_build_object(
    'ok', true,
    'items', v_sent,
    'received_items', v_received,
    'requests_used', jsonb_array_length(v_sent),
    'max_requests', 8,
    'accepted_items', v_accepted_items,
    'accepted_count', jsonb_array_length(v_accepted_items),
    'max_accepted', 4,
    'closes_at', s.closes_at,
    'server_now', now()
  );
end;
$$;

grant execute on function public.link_accept_request(text, text) to anon, authenticated;
grant execute on function public.link_my_requests(text) to anon, authenticated;
