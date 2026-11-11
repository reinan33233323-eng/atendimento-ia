import { ApiError, prepareRequest, askOpenAI } from './openai.mjs';
import { MAX_AUDIO_BYTES, validateAudio, transcribeAudio } from './audio.mjs';
import { estimateUsage } from './costs.mjs';
import { WHATSAPP_WEBHOOK_PATH, whatsappTestConfig, handleWebhook } from './whatsapp.mjs';
const limits = { perMinute: 5, perDay: 30, perMonth: 200 };
const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra } });
export async function matchesToken(provided, expected) {
  const encode = new TextEncoder();
  const [a, b] = await Promise.all([provided, expected].map(value => crypto.subtle.digest('SHA-256', encode.encode(value))));
  const left = new Uint8Array(a), right = new Uint8Array(b);
  let difference = 0; for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}
async function readBody(request, maxBytes) {
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'Corpo vazio.');
  const chunks = [];
  let bytes = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > maxBytes) {
      await reader.cancel();
      throw new ApiError(413, 'Conteúdo muito grande.');
    }
    chunks.push(value);
  }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return body;
}

const testEventsPath = '/whatsapp-test-events';
const eventRetentionMs = 24 * 60 * 60 * 1000;
const eventStorageKey = 'whatsapp-test-events';

export class TestQuota {
  constructor(ctx) { this.ctx = ctx; }
  async fetch(request) {
    const action = new URL(request.url).pathname;
    if (action === testEventsPath) return this.whatsappEvents(request);
    const usage = action === '/record' ? await request.json() : null;
    return this.ctx.storage.transaction(async transaction => {
      const now = new Date(), day = now.toISOString().slice(0, 10), month = day.slice(0, 7), minute = Math.floor(now.getTime() / 60000);
      const state = await transaction.get('usage') || { month, day, minute, monthly: 0, daily: 0, recent: 0, input_tokens: 0, output_tokens: 0 };
      if (state.month !== month) Object.assign(state, { month, monthly: 0, input_tokens: 0, output_tokens: 0, cached_input_tokens: 0, audio_input_tokens: 0, audio_output_tokens: 0, audio_transcriptions: 0 });
      if (state.day !== day) Object.assign(state, { day, daily: 0 });
      if (state.minute !== minute) Object.assign(state, { minute, recent: 0 });
      if (action === '/reserve') {
        if (state.recent >= limits.perMinute || state.daily >= limits.perDay || state.monthly >= limits.perMonth) return json({ error: 'Limite de testes atingido: 5 chamadas/minuto, 30/dia ou 200/mês.' }, 429);
        state.recent++; state.daily++; state.monthly++;
      } else if (action === '/record') {
        for (const key of ['audio_input_tokens', 'audio_output_tokens', 'audio_transcriptions']) state[key] = (state[key] || 0) + (usage[key] || 0);
        state.input_tokens += usage.input_tokens || 0; state.output_tokens += usage.output_tokens || 0;
        state.cached_input_tokens = (state.cached_input_tokens || 0) + (usage.cached_input_tokens || 0);
      }
      await transaction.put('usage', state);
      return json(state);
    });
  }

  async whatsappEvents(request) {
    const incoming = request.method === 'POST' ? await request.json() : [];
    const cutoff = Date.now() - eventRetentionMs;
    const events = await this.ctx.storage.transaction(async transaction => {
      const stored = await transaction.get(eventStorageKey) || [];
      const recent = stored.filter(event => Date.parse(event.receivedAt) >= cutoff);
      const keys = new Set(recent.map(event => `${event.id}:${event.status}`));
      for (const event of incoming) {
        const key = `${event.id}:${event.status}`;
        if (keys.has(key)) continue;
        keys.add(key);
        recent.push(event);
      }
      const result = recent.slice(-30);
      if (request.method === 'POST' || result.length !== stored.length) await transaction.put(eventStorageKey, result);
      return result;
    });
    return json({ events: events.map(({ kind, status, errorCode, receivedAt }) => ({ kind, status, errorCode, receivedAt })) });
  }

}
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowed = origin === env.ALLOWED_ORIGIN;
    const cors = allowed ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Atende-Client', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '600' } : {};
    try {
      if (origin && !allowed) throw new ApiError(403, 'Origem não permitida.');
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
      const path = new URL(request.url).pathname;
      const testStorage = () => env.QUOTA.get(env.QUOTA.idFromName('whatsapp-test'));
      if (path === WHATSAPP_WEBHOOK_PATH) {
        return await handleWebhook(request, whatsappTestConfig(env), async events => {
          const result = await testStorage().fetch('https://quota' + testEventsPath, { method: 'POST', body: JSON.stringify(events) });
          if (!result.ok) throw new ApiError(503, 'Não foi possível registrar o evento.');
        }, matchesToken, readBody);
      }
      if (!env.OPENAI_API_KEY || !env.PANEL_ACCESS_TOKEN || !env.QUOTA) throw new ApiError(503, 'Servidor aguardando configuração dos segredos.');
      const token = request.headers.get('Authorization')?.replace(/^Bearer /, '') || '';
      if (token.length > 256 || !await matchesToken(token, env.PANEL_ACCESS_TOKEN)) throw new ApiError(401, 'Informe o código de acesso do atendimento.');
      if (path === '/api/whatsapp/test-events' && request.method === 'GET') {
        const result = await testStorage().fetch('https://quota' + testEventsPath);
        if (!result.ok) throw new ApiError(503, 'Não foi possível consultar os eventos.');
        return json({ configured: !!whatsappTestConfig(env), ...await result.json() }, 200, cors);
      }
      const quota = env.QUOTA.get(env.QUOTA.idFromName('panel'));
      if (path === '/api/status' && request.method === 'GET') {
        const usage = await (await quota.fetch('https://quota/status')).json();
        return json({ configured: true, mode: 'online', model: env.OPENAI_MODEL, limits, usage, estimate: estimateUsage(usage, env.OPENAI_MODEL) }, 200, cors);
      }
      const audio = path === '/api/transcribe';
      if (path !== '/api/chat' && !audio) throw new ApiError(404, 'Rota não encontrada.');
      if (request.method !== 'POST') throw new ApiError(405, 'Método não permitido.');
      if (audio) validateAudio(request.headers.get('Content-Type'), 1);
      if (!audio && !(request.headers.get('Content-Type') || '').startsWith('application/json')) throw new ApiError(415, 'Envie o conteúdo em JSON.');
      const merged = await readBody(request, audio ? MAX_AUDIO_BYTES : 100000);
      if (audio) {
        validateAudio(request.headers.get('Content-Type'), merged.byteLength);
        const reservation = await quota.fetch('https://quota/reserve', { method: 'POST' });
        if (!reservation.ok) return json(await reservation.json(), reservation.status, cors);
        const result = await transcribeAudio(merged, request.headers.get('Content-Type'), { apiKey: env.OPENAI_API_KEY });
        await quota.fetch('https://quota/record', { method: 'POST', body: JSON.stringify(result.usage) });
        return json({ text: result.text }, 200, cors);
      }
      let body; try { body = JSON.parse(new TextDecoder().decode(merged)); } catch { throw new ApiError(400, 'JSON inválido.'); }
      const payload = prepareRequest(body, env.OPENAI_MODEL || 'gpt-6-luna');
      const reservation = await quota.fetch('https://quota/reserve', { method: 'POST' });
      if (!reservation.ok) return json(await reservation.json(), reservation.status, cors);
      const result = await askOpenAI(payload, { apiKey: env.OPENAI_API_KEY });
      await quota.fetch('https://quota/record', { method: 'POST', body: JSON.stringify(result.usage) });
      return json(result, 200, cors);
    } catch (error) { return json({ error: error instanceof ApiError ? error.message : 'Erro interno do servidor.' }, error instanceof ApiError ? error.status : 500, cors); }
  }
};
