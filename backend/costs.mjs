// Standard text rates, USD per million tokens. Verified 2026-10-25.
// An estimate of this app's recorded tokens, never an account invoice/balance.
export function estimateUsage(usage, model) {
  if (model !== 'gpt-6-luna') return null;
  const rates = { input: 0.10, cached: 0.01, output: 0.50 };
  const input = Math.max(0, Number(usage.input_tokens) || 0);
  const cached = Math.min(input, Math.max(0, Number(usage.cached_input_tokens) || 0));
  const output = Math.max(0, Number(usage.output_tokens) || 0);
  return {
    currency: 'USD',
    amount: ((input - cached) * rates.input + cached * rates.cached + output * rates.output) / 1000000,
    rates, verifiedAt: '2026-10-25',
    source: 'https://developers.openai.com/api/docs/pricing'
  };
}
