/*
  # Add Desktop Theme Support

  1. Changes
    - Extend `ui_theme` column check constraint to include 'desktop'
    - Values: 'terminal', 'tactical', 'mission-control', or 'desktop'
*/

DO $$
BEGIN
  -- Drop the existing constraint
  ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_ui_theme_check;

  -- Add new constraint that includes 'desktop'
  ALTER TABLE profiles ADD CONSTRAINT profiles_ui_theme_check
    CHECK (ui_theme IN ('terminal', 'tactical', 'mission-control', 'desktop'));
END $$;
