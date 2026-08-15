/*
  # Add tools column to ai_agents

  `tools` marks an agent as tool-enabled in the ai-chat edge function.
  Currently supported value: 'mslearn' — grounds answers via the public
  Microsoft Learn MCP server (https://learn.microsoft.com/api/mcp).
  NULL = plain chat agent (existing behavior).
*/

ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS tools text;
