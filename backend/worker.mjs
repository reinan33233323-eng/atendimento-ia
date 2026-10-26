import { ApiError, prepareRequest, askOpenAI } from './openai.mjs';
import { estimateUsage } from './costs.mjs';
const limits = { perMinute: 5, perDay: 30, perMonth: 200 };
const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra } });
export async function matchesToken(provided, expected) {
  const encode = new TextEncoder();
  const [a, b] = await Promise.all([provided, expected].map(value => crypto.subtle.digest('SHA-256', encode.encode(value))));
  const left = new Uint8Array(a), right = new Uint8Array(b);
  let difference = 0; for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}
export class TestQuota {
  constructor(ctx) { this.ctx = ctx; }
  async fetch(request) {
    const action = new URL(request.url).pathname;
    const usage = action === '/record' ? await request.json() : null;
    return this.ctx.storage.transaction(async transaction => {
      const now = new Date(), day = now.toISOString().slice(0, 10), month = day.slice(0, 7), minute = Math.floor(now.getTime() / 60000);
      const state = await transaction.get('usage') || { month, day, minute, monthly: 0, daily: 0, recent: 0, input_tokens: 0, output_tokens: 0 };
      if (state.month !== month) Object.assign(state, { month, monthly: 0, input_tokens: 0, output_tokens: 0, cached_input_tokens: 0 });
      if (state.day !== day) Object.assign(state, { day, daily: 0 });
      if (state.minute !== minute) Object.assign(state, { minute, recent: 0 });
      if (action === '/reserve') {
        if (state.recent >= limits.perMinute || state.daily >= limits.perDay || state.monthly >= limits.perMonth) return json({ error: 'Limite de testes atingido: 5 chamadas/minuto, 30/dia ou 200/mês.' }, 429);
        state.recent++; state.daily++; state.monthly++;
      } else if (action === '/record') {
        state.input_tokens += usage.input_tokens || 0; state.output_tokens += usage.output_tokens || 0;
        state.cached_input_tokens = (state.cached_input_tokens || 0) + (usage.cached_input_tokens || 0);
      }
      await transaction.put('usage', state);
      return json(state);
    });
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
      if (!env.OPENAI_API_KEY || !env.PANEL_ACCESS_TOKEN || !env.QUOTA) throw new ApiError(503, 'Servidor aguardando configuração dos segredos.');
      const token = request.headers.get('Authorization')?.replace(/^Bearer /, '') || '';
      if (token.length > 256 || !await matchesToken(token, env.PANEL_ACCESS_TOKEN)) throw new ApiError(401, 'Informe o código de acesso do atendimento.');
      const quota = env.QUOTA.get(env.QUOTA.idFromName('panel'));
      const path = new URL(request.url).pathname;
      if (path === '/api/status' && request.method === 'GET') {
        const usage = await (await quota.fetch('https://quota/status')).json();
        return json({ configured: true, mode: 'online', model: env.OPENAI_MODEL, limits, usage, estimate: estimateUsage(usage, env.OPENAI_MODEL) }, 200, cors);
      }
      if (path !== '/api/chat') throw new ApiError(404, 'Rota não encontrada.');
      if (request.method !== 'POST') throw new ApiError(405, 'Método não permitido.');
      if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) throw new ApiError(415, 'Envie o conteúdo em JSON.');
      const reader = request.body?.getReader(); if (!reader) throw new ApiError(400, 'Corpo vazio.');
      let bytes = 0; const chunks = [];
      for (;;) { const { value, done } = await reader.read(); if (done) break; bytes += value.length; if (bytes > 100000) { await reader.cancel(); throw new ApiError(413, 'Conteúdo muito grande.'); } chunks.push(value); }
      const merged = new Uint8Array(bytes); let offset = 0; for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
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
