-- Fix: frozen_timesheets INSERT blocked with 42501 (RLS violation)
--
-- Root cause: the RLS policy "Admins can insert frozen_timesheets" calls
-- public.is_admin(), which only reads the JWT app_metadata claim
-- `is_admin: true`.  After the admin_profiles / profile_type='admin' refactor
-- (20260428 - 20260430), a user can be an admin via their profiles row without
-- ever having had the JWT claim set (or with a stale token that pre-dates the
-- claim being written).  The JWT claim is only refreshed on the NEXT login, so
-- an admin who promoted themselves or was promoted without re-logging-in will
-- have is_admin() return false and be blocked by RLS.
--
-- Fix: extend is_admin() to also accept users whose profiles row has
-- profile_type = 'admin'.  The profiles lookup uses SECURITY DEFINER so it
-- bypasses the profiles RLS (which itself calls is_admin(), avoiding recursion
-- because we short-circuit on the JWT claim first).

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- 1. Fast path: JWT claim already present (set at login or via hook)
    COALESCE(
      (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean,
      false
    )
    OR
    -- 2. Fallback: user has an admin profile row in profiles
    --    (handles stale / missing JWT claim until next re-login)
    EXISTS (
      SELECT 1
      FROM   public.profiles p
      WHERE  p.owner_uid    = auth.uid()
        AND  p.profile_type = 'admin'
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Verify the function compiles correctly (no-op select, will error at migration
-- time if the function body is invalid).
DO $$ BEGIN
  PERFORM public.is_admin();
EXCEPTION WHEN insufficient_privilege THEN
  -- Normal when called outside an auth context; function is valid.
  NULL;
END $$;
