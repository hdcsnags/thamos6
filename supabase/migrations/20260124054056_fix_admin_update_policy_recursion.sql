/*
  # Fix Admin Update Policy Recursion

  1. Problem
    - "Admins can update user status" policy queries profiles table directly
    - This could cause recursion issues
  
  2. Changes
    - Replace direct query with is_admin() function
    - Maintains same security behavior without recursion risk
*/

-- Drop existing admin update policy
DROP POLICY IF EXISTS "Admins can update user status" ON profiles;

-- Recreate using is_admin() function to avoid recursion
CREATE POLICY "Admins can update user status"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
