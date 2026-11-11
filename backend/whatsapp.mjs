import { ApiError } from './openai.mjs';

export const WHATSAPP_WEBHOOK_PATH = '/api/whatsapp/webhook';
const deliveryStatuses = new Set(['sent', 'delivered', 'read', 'failed']);

export function whatsappTestConfig(env) {
  let config;
  try { config = JSON.parse(env.WHATSAPP_TEST_CONFIG || 'null'); } catch { return null; }
  if (typeof config?.appSecret !== 'string' || !config.appSecret ||
      typeof config.verifyToken !== 'string' || !config.verifyToken ||
      typeof config.phoneNumberId !== 'string' || !/^\d+$/.test(config.phoneNumberId)) return null;
  return config;
}

export async function validateWebhookSignature(body, header, appSecret) {
  const hex = /^sha256=([a-f0-9]{64})$/i.exec(header || '')?.[1];
  if (!hex) return false;
  const signature = Uint8Array.from(hex.match(/../g), pair => parseInt(pair, 16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('HMAC', key, signature, body);
}

const items = value => Array.isArray(value) ? value : [];

export function extractTestEvents(body, phoneNumberId, receivedAt = new Date().toISOString()) {
  if (body?.object !== 'whatsapp_business_account') return [];
  const events = [];
  for (const entry of items(body.entry)) {
    for (const change of items(entry?.changes)) {
      const value = change?.value;
      if (change?.field !== 'messages' || value?.metadata?.phone_number_id !== phoneNumberId) continue;
      for (const message of items(value.messages)) {
        if (typeof message?.id !== 'string' || !message.id || message.id.length > 256) continue;
        events.push({ id: message.id, kind: 'inbound', status: 'received', receivedAt });
      }
      for (const status of items(value.statuses)) {
        if (typeof status?.id !== 'string' || !status.id || status.id.length > 256 || !deliveryStatuses.has(status.status)) continue;
        const code = items(status.errors)[0]?.code;
        events.push({ id: status.id, kind: 'delivery', status: status.status, receivedAt,
          ...(Number.isSafeInteger(code) ? { errorCode: code } : {}) });
      }
    }
  }
  return events.slice(-30);
}

export async function handleWebhook(request, config, record, matchesToken, readBody) {
  if (!config) throw new ApiError(503, 'Webhook do WhatsApp ainda não configurado.');
  if (request.method === 'GET') {
    const query = new URL(request.url).searchParams;
    const token = query.get('hub.verify_token') || '';
    const challenge = query.get('hub.challenge');
    if (query.get('hub.mode') !== 'subscribe' || !challenge || token.length > 256 ||
        !await matchesToken(token, config.verifyToken)) throw new ApiError(403, 'Verificação do webhook recusada.');
    return new Response(challenge, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  if (request.method !== 'POST') throw new ApiError(405, 'Método não permitido.');
  const signature = request.headers.get('X-Hub-Signature-256');
  if (!signature) throw new ApiError(401, 'Assinatura do webhook inválida.');
  const bytes = await readBody(request, 256 * 1024);
  if (!await validateWebhookSignature(bytes, signature, config.appSecret)) throw new ApiError(401, 'Assinatura do webhook inválida.');
  let body;
  try { body = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new ApiError(400, 'JSON inválido.'); }
  const events = extractTestEvents(body, config.phoneNumberId);
  if (events.length) await record(events);
  return new Response(null, { status: 200 });
}
