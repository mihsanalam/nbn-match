-- ============================================================================
-- 020_profile_request_status.sql
-- link_list_profiles only exposed a boolean `requested` that was true while
-- the outgoing request status was 'sent'. Once the receiver accepted the
-- request the status became 'accepted', so `requested` turned false and the
-- candidate card fell back to showing "Send" instead of an accepted state.
--
-- Expose the current outgoing request status so the card can render
-- "Accepted" and never let an accepted request be sent again.
-- ============================================================================

create or replace function public.link_list_profiles(
  p_session_hash text,
  p_limit int default 100,
  p_offset int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s record;
  v_items jsonb;
  v_used int;
begin
  select * into s from public.link_session_info(p_session_hash);

  select coalesce(jsonb_agg(jsonb_build_object(
           'candidate_code', p.candidate_code,
           'photo_path', p.photo_path,
           'profile', p.profile,
           'requested', exists (
             select 1 from public.interest_requests ir
             where ir.event_id = s.event_id
               and ir.from_registration_id = s.registration_id
               and ir.to_registration_id = p.registration_id
               and ir.status = 'sent'),
           'request_status', (
             select ir.status
             from public.interest_requests ir
             where ir.event_id = s.event_id
               and ir.from_registration_id = s.registration_id
               and ir.to_registration_id = p.registration_id
               and ir.status in ('sent', 'accepted')
             order by ir.created_at desc
             limit 1)
         ) order by p.candidate_code), '[]'::jsonb)
  into v_items
  from (
    select pp.*
    from public.public_profiles pp
    where pp.event_id = s.event_id
      and ((s.gender = 'man' and pp.gender = 'woman')
        or (s.gender = 'woman' and pp.gender = 'man'))
    order by pp.candidate_code
    limit least(greatest(p_limit, 1), 200)
    offset greatest(p_offset, 0)
  ) p;

  select count(*) into v_used
  from public.interest_requests
  where event_id = s.event_id and from_registration_id = s.registration_id and status = 'sent';

  return jsonb_build_object(
    'ok', true,
    'items', v_items,
    'requests_used', v_used,
    'max_requests', s.max_requests,
    'closes_at', s.closes_at,
    'server_now', now()
  );
end;
$$;

grant execute on function public.link_list_profiles(text, int, int) to service_role;
