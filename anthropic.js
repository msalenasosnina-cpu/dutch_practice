// api/_lib/anthropic.js
import Anthropic from '@anthropic-ai/sdk';

let cached = null;

export function getAnthropic() {
  if (cached) return cached;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Missing ANTHROPIC_API_KEY env var');
  cached = new Anthropic({ apiKey: key });
  return cached;
}

// Default model (used by the app for generation)
export const MODEL = 'claude-haiku-4-5';

// Pricing — used by eval cost-reporting only.
// Source: anthropic.com/pricing (May 2026). Per million tokens.
export const PRICING = {
  'claude-haiku-4-5': { input: 1.0, output: 5.0 },
  'claude-sonnet-4-5': { input: 3.0, output: 15.0 },
};

/**
 * Call Claude with system + user messages.
 *
 * @param {object} opts
 * @param {string} opts.system
 * @param {string} opts.user
 * @param {number} [opts.maxTokens=600]
 * @param {number} [opts.temperature=0.7]
 * @param {string} [opts.model] — override default model (e.g. for judges)
 * @param {boolean} [opts.returnUsage=false] — when true, returns { text, usage, model, latency_ms }
 * @returns {Promise<string|object>}
 */
export async function callClaude({
  system,
  user,
  maxTokens = 600,
  temperature = 0.7,
  model,
  returnUsage = false,
}) {
  const client = getAnthropic();
  const usedModel = model || MODEL;
  const t0 = Date.now();
  const res = await client.messages.create({
    model: usedModel,
    max_tokens: maxTokens,
    temperature,
    system,
    messages: [{ role: 'user', content: user }],
  });
  const latency_ms = Date.now() - t0;
  const block = (res.content || []).find((b) => b.type === 'text');
  const text = block ? block.text : '';

  if (returnUsage) {
    return {
      text,
      usage: {
        input_tokens: res.usage?.input_tokens || 0,
        output_tokens: res.usage?.output_tokens || 0,
      },
      model: usedModel,
      latency_ms,
    };
  }
  return text;
}

/**
 * Compute USD cost for a given usage record.
 */
export function computeCost(usage, model) {
  const price = PRICING[model] || PRICING[MODEL];
  const inputCost = (usage.input_tokens / 1_000_000) * price.input;
  const outputCost = (usage.output_tokens / 1_000_000) * price.output;
  return inputCost + outputCost;
}
