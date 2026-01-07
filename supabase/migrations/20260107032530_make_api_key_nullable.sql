/*
  # Make api_key Column Nullable

  ## Summary
  This migration removes the NOT NULL constraint from the api_key column in user_api_keys table.
  The application now uses the encrypted_key column for storing API keys securely.

  ## Changes
  1. Make api_key column nullable in user_api_keys table
    - Allows transition from plaintext to encrypted storage
    - Edge function stores keys in encrypted_key column and sets api_key to NULL

  ## Security Note
  - All new keys are stored encrypted in the encrypted_key column
  - The api_key column is kept for backward compatibility but will eventually be deprecated
*/

-- Make api_key column nullable
ALTER TABLE user_api_keys 
ALTER COLUMN api_key DROP NOT NULL;
