/*
  # Consolidate and Fix Profiles RLS Policies

  1. Problem
    - Multiple overlapping SELECT policies on profiles table
    - is_admin() function checks wrong column (role instead of is_admin)
    - Potential recursion and performance issues
  
  2. Changes
    - Drop all existing SELECT policies on profiles
    - Fix is_admin() function to use correct column
    - Create single comprehensive SELECT policy
    - Keep existing INSERT and UPDATE policies intact
  
  3. Security
    - Users can view their own profile
    - Admins can view all profiles
    - No recursion in policy checks
*/

-- Drop all existing SELECT policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can view all user profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;

-- Fix the is_admin() function to use correct column
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND is_admin = true
  );
$$;

-- Create single consolidated SELECT policy
CREATE POLICY "Users can view profiles"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = id OR 
    is_admin()
  );
