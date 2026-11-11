import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import worker, { TestQuota } from '../backend/worker.mjs';

const webhook = 'https://worker.test/api/whatsapp/webhook';
const diagnostics = 'https://worker.test/api/whatsapp/test-events';
const config = { appSecret: 'fake-app-secret', verifyToken: 'fake-verify-token', phoneNumberId: '100' };

function fixture() {
  const data = new Map();
  const storage = { transaction: callback => callback({ get: async key => data.get(key), put: async (key, value) => data.set(key, value) }) };
  const quota = new TestQuota({ storage });
  return {
    OPENAI_API_KEY: 'fake', PANEL_ACCESS_TOKEN: 'panel-code',
    WHATSAPP_TEST_CONFIG: JSON.stringify(config),
    QUOTA: { idFromName: name => name, get: () => ({ fetch: (url, init) => quota.fetch(new Request(url, init)) }) }
  };
}

function post(body, signature) {
  return new Request(webhook, { method: 'POST', body, headers: { 'X-Hub-Signature-256': signature } });
}

test('Webhook valida o desafio da Meta com o token de verificação', async () => {
  const env = fixture();
  const request = token => new Request(webhook + '?hub.mode=subscribe&hub.challenge=1234&hub.verify_token=' + token);
  assert.equal((await worker.fetch(request('wrong'), env)).status, 403);
  const response = await worker.fetch(request(config.verifyToken), env);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '1234');
});

test('Somente eventos assinados do número de teste chegam ao diagnóstico privado', async () => {
  const env = fixture();
  const change = (phoneId, payload) => ({ field: 'messages', value: { metadata: { phone_number_id: phoneId }, ...payload } });
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [
    change('100', { messages: [{ id: 'inbound-id', from: '5511999999999', text: { body: 'conteúdo privado' } }], statuses: [{ id: 'outbound-id', status: 'failed', errors: [{ code: 131000 }] }] }),
    change('200', { messages: [{ id: 'production-id' }] })
  ] }] });
  const signature = 'sha256=' + createHmac('sha256', config.appSecret).update(body).digest('hex');
  assert.equal((await worker.fetch(post(body + ' ', signature), env)).status, 401);
  assert.equal((await worker.fetch(post(body, signature), env)).status, 200);
  assert.equal((await worker.fetch(post(body, signature), env)).status, 200);
  assert.equal((await worker.fetch(new Request(diagnostics), env)).status, 401);
  const response = await worker.fetch(new Request(diagnostics, { headers: { Authorization: 'Bearer panel-code' } }), env);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.events.map(({ kind, status, errorCode }) => ({ kind, status, errorCode })), [
    { kind: 'inbound', status: 'received', errorCode: undefined },
    { kind: 'delivery', status: 'failed', errorCode: 131000 }
  ]);
  assert.doesNotMatch(JSON.stringify(result), /privado|999999999|inbound-id|production-id|outbound-id/);
});
