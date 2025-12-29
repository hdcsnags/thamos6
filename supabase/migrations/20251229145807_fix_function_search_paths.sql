/*
  # Fix Function Search Path Security Warnings

  ## Summary
  Sets explicit search_path for all custom functions to prevent search path injection attacks.

  ## Changes
  1. handle_new_user - set search_path to public
  2. update_updated_at - set search_path to public  
  3. increment_usage_stat - set search_path to public

  ## Security Notes
  - Mutable search_path can allow attackers to hijack function behavior
  - Fixed by setting explicit search_path on all functions
*/

-- Fix handle_new_user function
ALTER FUNCTION public.handle_new_user() SET search_path = public;

-- Fix update_updated_at function
ALTER FUNCTION public.update_updated_at() SET search_path = public;

-- Fix increment_usage_stat function (correct signature: uuid, date, text)
ALTER FUNCTION public.increment_usage_stat(uuid, date, text) SET search_path = public;
