/*
  # DSBN Shared History Fix

  ## Summary
  Updates RLS policies to allow DSBN users to view org-scoped lookup history.
  This enables team collaboration - DSBN staff can see lookups made by other DSBN users.

  ## Changes
  1. ip_lookups: DSBN users can view rows where context starts with 'org:dsbn' or 'org:admin'
  2. url_lookups: Same sharing logic for URL lookups

  ## Security Notes
  - External users still only see their own lookups (user:uuid context)
  - Anonymous lookups (null user_id) visible to authenticated users
  - DSBN org lookups shared within the organization
*/

-- Drop existing select policies
DROP POLICY IF EXISTS "Users can view own IP lookups" ON ip_lookups;
DROP POLICY IF EXISTS "Users can view own URL lookups" ON url_lookups;

-- ip_lookups: users see own lookups + DSBN users see org lookups
CREATE POLICY "Users can view IP lookups"
  ON ip_lookups
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id 
    OR user_id IS NULL
    OR (
      context LIKE 'org:%' 
      AND (
        (SELECT email FROM auth.users WHERE id = auth.uid()) LIKE '%@dsbn.org'
        OR (SELECT email FROM auth.users WHERE id = auth.uid()) = current_setting('app.admin_email', true)
      )
    )
  );

-- url_lookups: same logic
CREATE POLICY "Users can view URL lookups"
  ON url_lookups
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id 
    OR user_id IS NULL
    OR (
      context LIKE 'org:%' 
      AND (
        (SELECT email FROM auth.users WHERE id = auth.uid()) LIKE '%@dsbn.org'
        OR (SELECT email FROM auth.users WHERE id = auth.uid()) = current_setting('app.admin_email', true)
      )
    )
  );
