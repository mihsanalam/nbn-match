-- ============================================================================
-- 016_fix_request_functions.sql
-- Fix link_send_request (preserve FOUND state, handle re-send after withdraw).
-- Fix link_accept_request (receiver accepts, not sender).
-- ============================================================================

-- Fix 1: link_send_request (from work.md — already run manually, safe to re-run)
create or replace function public.link_send_request(p_session_hash text, p_target_code text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  s record;
  t public.registrations%rowtype;
  ex public.interest_requests%rowtype;
  v_used int;
  v_accepted int;
  v_existing boolean;
begin
  select * into s from public.link_session_info(p_session_hash);

  select * into t
  from public.registrations
  where registrations.event_id = s.event_id
    and registrations.candidate_code = upper(trim(p_target_code))
    and registrations.status = 'approved'
    and registrations.deleted_at is null
    and ((s.gender = 'man' and registrations.gender = 'woman')
      or (s.gender = 'woman' and registrations.gender = 'man'));

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_target');
  end if;

  perform pg_advisory_xact_lock(hashtext('link_req_' || s.registration_id::text));

  select * into ex
  from public.interest_requests
  where event_id = s.event_id
    and from_registration_id = s.registration_id
    and to_registration_id = t.id;
  v_existing := found;

  select count(*) into v_used
  from public.interest_requests
  where event_id = s.event_id
    and from_registration_id = s.registration_id
    and status = 'sent';

  select count(*) into v_accepted
  from public.interest_requests
  where event_id = s.event_id
    and from_registration_id = s.registration_id
    and status = 'accepted';

  if v_existing and ex.status = 'sent' then
    return jsonb_build_object('ok', false, 'error', 'already_sent',
                              'requests_used', v_used, 'max_requests', 8);
  end if;

  if v_used >= 8 then
    return jsonb_build_object('ok', false, 'error', 'sent_limit_full',
                              'requests_used', v_used, 'max_requests', 8);
  end if;

  if v_accepted >= 4 then
    return jsonb_build_object('ok', false, 'error', 'accepted_limit_full',
                              'accepted_count', v_accepted, 'max_accepted', 4);
  end if;

  if v_existing then
    update public.interest_requests
    set status = 'sent', withdrawn_at = null, created_at = now()
    where id = ex.id;
  else
    insert into public.interest_requests (event_id, from_registration_id, to_registration_id)
    values (s.event_id, s.registration_id, t.id);
  end if;

  return jsonb_build_object('ok', true, 'requests_used', v_used + 1, 'max_requests', 8);
end;
$$;

-- Fix 2: link_accept_request — the RECEIVER (to_registration_id) accepts the request,
-- not the sender. Previous version had from_registration_id = s.registration_id which
-- meant only the sender could "accept" their own request (wrong).
create or replace function public.link_accept_request(p_session_hash text, p_target_code text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  s record;
  ex public.interest_requests%rowtype;
  v_used int;
  v_accepted int;
  v_existing boolean;
begin
  select * into s from public.link_session_info(p_session_hash);

  -- The current user is the RECEIVER (to_registration_id).
  -- p_target_code is the SENDER's candidate code (from_registration_id).
  select * into ex
  from public.interest_requests
  where event_id = s.event_id
    and to_registration_id = s.registration_id
    and from_registration_id = (
      select id from public.registrations
      where candidate_code = upper(trim(p_target_code))
        and event_id = s.event_id
    )
    and status = 'sent';
  v_existing := found;

  if not v_existing then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Check accepting limit: max 4 accepted per user per event
  select count(*) into v_accepted
  from public.interest_requests
  where event_id = s.event_id
    and to_registration_id = s.registration_id
    and status = 'accepted';

  if v_accepted >= 4 then
    return jsonb_build_object('ok', false, 'error', 'accepted_limit_full',
                              'accepted_count', v_accepted, 'max_accepted', 4);
  end if;

  perform pg_advisory_xact_lock(hashtext('link_accept_req_' || s.registration_id::text));

  update public.interest_requests
  set status = 'accepted', accepted_at = now()
  where id = ex.id;

  select count(*) into v_used
  from public.interest_requests
  where event_id = s.event_id
    and to_registration_id = s.registration_id
    and status = 'sent';

  return jsonb_build_object('ok', true,
                            'requests_used', v_used,
                            'accepted_count', v_accepted + 1,
                            'max_accepted', 4,
                            'ready_for_event', true);
end;
$$;

-- Fix 3: link_my_requests — show INCOMING sent requests (to_registration_id = me)
-- and accepted requests (to_registration_id = me, status = accepted)
create or replace function public.link_my_requests(p_session_hash text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  s record;
  v_sent jsonb;
  v_accepted_items jsonb;
begin
  select * into s from public.link_session_info(p_session_hash);

  -- Incoming sent requests (people who sent TO me)
  select coalesce(jsonb_agg(
    jsonb_build_object('candidate_code', f.candidate_code, 'status', ir.status, 'created_at', ir.created_at)
    order by ir.created_at
  ), '[]'::jsonb)
  into v_sent
  from (
    select * from public.interest_requests
    where event_id = s.event_id
      and to_registration_id = s.registration_id
      and status = 'sent'
    order by created_at limit 8
  ) ir
  join public.registrations f on f.id = ir.from_registration_id;

  -- Accepted requests (I accepted)
  select coalesce(jsonb_agg(
    jsonb_build_object('candidate_code', f.candidate_code, 'accepted_at', ir.accepted_at)
    order by ir.accepted_at
  ), '[]'::jsonb)
  into v_accepted_items
  from public.interest_requests ir
  join public.registrations f on f.id = ir.from_registration_id
  where ir.event_id = s.event_id
    and ir.to_registration_id = s.registration_id
    and ir.status = 'accepted';

  return jsonb_build_object(
    'ok', true,
    'items', v_sent,
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

grant execute on function public.link_send_request     to anon, authenticated;
grant execute on function public.link_accept_request   to anon, authenticated;
grant execute on function public.link_my_requests      to anon, authenticated;
