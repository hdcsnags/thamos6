/*
  # Switch MS Learn agent from gpt-4o-mini to Claude Haiku 4.5

  gpt-4o-mini (128K context / 16,384 max output, $0.15/$0.60 per 1M
  tokens) works, but Claude Haiku 4.5 (200K context / 64,000 max output,
  $1/$5 per 1M tokens) is a meaningfully stronger tool-user/reasoner for
  compound, multi-domain technical questions -- and the ai-chat edge
  function already has a fully-implemented Anthropic tool-calling loop
  (callAnthropicWithTools) used by the Claude default agent, so this is
  a pure config swap, no new code. Absolute cost stays trivial at
  workshop chat volumes even at ~7-8x the per-token price.

  The code-level default (T6.tsx DEFAULT_AGENTS) was already switched --
  this migration updates already-provisioned MS Learn agents to match.
*/

UPDATE ai_agents
SET provider = 'anthropic',
    model = 'claude-haiku-4-5-20251001'
WHERE tools = 'mslearn';
