/*
  # Fix Usage Stats RLS Policy Recursion

  1. Problem
    - "Admins can view all usage stats" policy queries profiles table
    - This can cause recursion when combined with profiles policies
  
  2. Solution
    - Update policy to use the is_admin() security definer function
*/

DROP POLICY IF EXISTS "Admins can view all usage stats" ON usage_stats;

CREATE POLICY "Admins can view all usage stats"
  ON usage_stats
  FOR SELECT
  TO authenticated
  USING (is_admin() OR auth.uid() = user_id);