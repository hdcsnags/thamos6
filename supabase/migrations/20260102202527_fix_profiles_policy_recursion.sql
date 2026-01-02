/*
  # Fix Profiles RLS Policy Infinite Recursion

  1. Problem
    - "Admins can view all profiles" policy queries profiles table to check admin role
    - This causes infinite recursion when evaluating the policy
  
  2. Solution
    - Drop the recursive admin policy
    - Create a security definer function to check admin status
    - Recreate policy using the function
*/

DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE POLICY "Admins can view all profiles"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (is_admin() OR auth.uid() = id);