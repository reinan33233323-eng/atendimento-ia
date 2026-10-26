import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateUsage } from '../backend/costs.mjs';
test('Calcula estimativa em USD sem contar cache duas vezes', () => {
  const result = estimateUsage({ input_tokens: 1000000, cached_input_tokens: 200000, output_tokens: 100000 }, 'gpt-6-luna');
  assert.ok(Math.abs(result.amount - 0.132) < 1e-12);
  assert.equal(result.currency, 'USD');
});
test('Lê registros antigos sem informação de cache', () => {
  assert.ok(Math.abs(estimateUsage({ input_tokens: 1000000, output_tokens: 0 }, 'gpt-6-luna').amount - 0.1) < 1e-12);
});
test('Modelo sem tarifa não apresenta estimativa enganosa', () => {
  assert.equal(estimateUsage({ input_tokens: 1000 }, 'outro-modelo'), null);
});
