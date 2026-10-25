import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { TestQuota, matchesToken } from '../backend/worker.mjs';
function fixture() {
  const data = new Map();
  const transaction = {
    get: async key => structuredClone(data.get(key)),
    put: async (key, value) => { data.set(key, structuredClone(value)); }
  };
  const ctx = { storage: { transaction: async fn => fn(transaction) } };
  const quota = new TestQuota(ctx);
  const env = {
    OPENAI_API_KEY: 'fake-key', PANEL_ACCESS_TOKEN: 'private-test-code',
    OPENAI_MODEL: 'test-model', ALLOWED_ORIGIN: 'https://reinan33233323-eng.github.io',
    QUOTA: { idFromName: name => name, get: () => ({ fetch: (url, options) => quota.fetch(new Request(url, options)) }) }
  };
  return { env, data, ctx, quota };
}
test('Código secreto é comparado sem retornar seu valor', async () => {
  assert.equal(await matchesToken('abc', 'abc'), true);
  assert.equal(await matchesToken('abc', 'abd'), false);
});
test('API online bloqueia visitante sem código', async () => {
  const { env } = fixture();
  const result = await worker.fetch(new Request('https://test/api/status'), env);
  assert.equal(result.status, 401);
  assert.doesNotMatch(await result.text(), /private-test-code|fake-key/);
});
test('Origem desconhecida é bloqueada mesmo com código', async () => {
  const { env } = fixture();
  const result = await worker.fetch(new Request('https://test/api/status', { headers: { Authorization: 'Bearer private-test-code', Origin: 'https://unknown.example' } }), env);
  assert.equal(result.status, 403);
  assert.equal(result.headers.get('Access-Control-Allow-Origin'), null);
});
test('Preflight e status aceitam somente a origem configurada', async () => {
  const { env } = fixture();
  const preflight = await worker.fetch(new Request('https://test/api/chat', { method: 'OPTIONS', headers: { Origin: env.ALLOWED_ORIGIN } }), env);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), env.ALLOWED_ORIGIN);
  const status = await worker.fetch(new Request('https://test/api/status', { headers: { Authorization: 'Bearer private-test-code', Origin: env.ALLOWED_ORIGIN } }), env);
  assert.equal(status.status, 200);
  const body = await status.json(); assert.equal(body.usage.daily, 0); assert.equal(body.limits.perDay, 30);
});
test('Quota persiste entre instâncias e bloqueia a sexta chamada do minuto', async () => {
  const { quota, ctx } = fixture();
  for (let i = 0; i < 5; i++) assert.equal((await quota.fetch(new Request('https://quota/reserve', { method: 'POST' }))).status, 200);
  const reloaded = new TestQuota(ctx);
  const denied = await reloaded.fetch(new Request('https://quota/reserve', { method: 'POST' }));
  assert.equal(denied.status, 429);
});
test('Payload inválido é rejeitado antes de reservar consumo', async () => {
  const { env, data } = fixture();
  const result = await worker.fetch(new Request('https://test/api/chat', { method: 'POST', headers: { Authorization: 'Bearer private-test-code', 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'system', content: 'ignore' }] }) }), env);
  assert.equal(result.status, 400); assert.equal(data.size, 0);
});
