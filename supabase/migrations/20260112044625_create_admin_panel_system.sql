/*
  # Admin Panel System

  1. Schema Changes
    - Add `is_admin` boolean to profiles table
    - Add `tier` enum column (free, org) to profiles table
    - Add `is_banned` boolean to profiles table
    - Add `last_login_at` timestamp to profiles table

  2. Admin Views
    - `admin_user_overview` - Comprehensive view of all users with stats
    
  3. Security
    - Add RLS policies allowing admins to view/modify all user data
    - Admins can update user tiers and ban status
    
  4. Functions
    - Function to update user status (ban/unban)
    - Function to update user tier
*/

-- Add admin columns to profiles if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'is_admin'
  ) THEN
    ALTER TABLE profiles ADD COLUMN is_admin boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'user_tier'
  ) THEN
    CREATE TYPE user_tier AS ENUM ('free', 'org');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'tier'
  ) THEN
    ALTER TABLE profiles ADD COLUMN tier user_tier DEFAULT 'free';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'is_banned'
  ) THEN
    ALTER TABLE profiles ADD COLUMN is_banned boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'last_login_at'
  ) THEN
    ALTER TABLE profiles ADD COLUMN last_login_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Create admin user overview view
CREATE OR REPLACE VIEW admin_user_overview AS
SELECT 
  p.id as user_id,
  p.email,
  p.tier,
  p.is_admin,
  p.is_banned,
  p.created_at,
  p.last_login_at,
  p.updated_at,
  (SELECT COUNT(*) FROM user_api_keys WHERE user_id = p.id) as api_key_count,
  (SELECT COUNT(*) FROM case_notes WHERE user_id = p.id) as case_note_count,
  (SELECT COALESCE(SUM(count), 0) FROM usage_stats WHERE user_id = p.id) as total_lookups,
  (SELECT MAX(date) FROM usage_stats WHERE user_id = p.id) as last_activity_date
FROM profiles p
ORDER BY p.created_at DESC;

-- Grant access to admin view
GRANT SELECT ON admin_user_overview TO authenticated;

-- RLS Policy: Admins can view all users
DROP POLICY IF EXISTS "Admins can view all user profiles" ON profiles;
CREATE POLICY "Admins can view all user profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true)
    OR auth.uid() = id
  );

-- RLS Policy: Admins can update user tiers and ban status
DROP POLICY IF EXISTS "Admins can update user status" ON profiles;
CREATE POLICY "Admins can update user status"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true)
  )
  WITH CHECK (
    auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true)
  );

-- Function to update user tier (admin only)
CREATE OR REPLACE FUNCTION update_user_tier(target_user_id uuid, new_tier user_tier)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_caller_admin boolean;
BEGIN
  -- Check if caller is admin
  SELECT is_admin INTO is_caller_admin
  FROM profiles
  WHERE id = auth.uid();

  IF NOT is_caller_admin THEN
    RAISE EXCEPTION 'Only admins can update user tiers';
  END IF;

  -- Update the tier
  UPDATE profiles
  SET tier = new_tier,
      updated_at = now()
  WHERE id = target_user_id;

  RETURN json_build_object(
    'success', true,
    'message', 'User tier updated successfully'
  );
END;
$$;

-- Function to ban/unban user (admin only)
CREATE OR REPLACE FUNCTION update_user_ban_status(target_user_id uuid, banned boolean)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_caller_admin boolean;
BEGIN
  -- Check if caller is admin
  SELECT is_admin INTO is_caller_admin
  FROM profiles
  WHERE id = auth.uid();

  IF NOT is_caller_admin THEN
    RAISE EXCEPTION 'Only admins can ban/unban users';
  END IF;

  -- Don't allow admins to ban themselves
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot ban yourself';
  END IF;

  -- Update ban status
  UPDATE profiles
  SET is_banned = banned,
      updated_at = now()
  WHERE id = target_user_id;

  RETURN json_build_object(
    'success', true,
    'message', CASE WHEN banned THEN 'User banned' ELSE 'User unbanned' END
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION update_user_tier TO authenticated;
GRANT EXECUTE ON FUNCTION update_user_ban_status TO authenticated;