/*
  # Bump max_tokens on already-provisioned MS Learn agents

  The MS Learn default agent was originally seeded with max_tokens: 4096 --
  half the ceiling of the other analyst agents (8192) -- while it is the
  agent most likely to need long, citation-heavy, multi-step answers (it
  grounds via several Microsoft Learn MCP tool calls before synthesizing).
  Real-world testing showed 4096 silently truncating comprehensive
  architecture answers (e.g. multi-service automation questions spanning
  Graph API + Logic Apps + Automation runbooks + Sentinel watchlists).

  gpt-4o-mini supports up to 16,384 output tokens, so 8192 is well within
  budget. The code-level default (T6.tsx DEFAULT_AGENTS) was already bumped
  to match -- this migration fixes agents seeded before that change.
*/

UPDATE ai_agents
SET max_tokens = 8192
WHERE tools = 'mslearn'
  AND max_tokens <= 4096;
