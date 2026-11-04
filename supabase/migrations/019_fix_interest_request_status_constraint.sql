-- ============================================================================
-- 019_fix_interest_request_status_constraint.sql
-- 014 tried to drop the status check by the name "interest_requests_check",
-- but 008 created the original column-level check under the auto-generated
-- name "interest_requests_status_check". That stale constraint only allows
-- ('sent', 'withdrawn'), so every accept (status = 'accepted') failed with:
--   new row for relation "interest_requests" violates check constraint
--   "interest_requests_status_check"
--
-- Fix: drop any check constraint on interest_requests.status that does not
-- allow 'accepted', then make sure the correct constraint exists.
-- ============================================================================

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'public'
      AND rel.relname = 'interest_requests'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%status%'
      AND pg_get_constraintdef(con.oid) NOT ILIKE '%accepted%'
  LOOP
    EXECUTE format('ALTER TABLE public.interest_requests DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'public'
      AND rel.relname = 'interest_requests'
      AND con.conname = 'interest_requests_check'
  ) THEN
    ALTER TABLE public.interest_requests
      ADD CONSTRAINT interest_requests_check
      CHECK (status IN ('sent', 'withdrawn', 'accepted'));
  END IF;
END $$;
