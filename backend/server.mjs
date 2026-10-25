import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep, extname } from 'node:path';
import { ApiError, prepareRequest, askOpenAI } from './openai.mjs';
const root = resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const stateDir = fileURLToPath(new URL('../.runtime/', import.meta.url));
const port = Number(process.env.PORT || 4174);
const model = process.env.OPENAI_MODEL || 'gpt-6-luna';
const apiKey = process.env.OPENAI_API_KEY;
const allowedHosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`]);
let busy = false;
let attempts = [];
await mkdir(stateDir, { recursive: true, mode: 0o700 });
let ledger;
try { ledger = JSON.parse(await readFile(resolve(stateDir, 'usage.json'), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw new Error('Não foi possível ler o controle local de consumo.'); ledger = { day: '', month: '', daily: 0, monthly: 0, input_tokens: 0, output_tokens: 0 }; }
if (!ledger || !Number.isFinite(ledger.daily) || !Number.isFinite(ledger.monthly) || !Number.isFinite(ledger.input_tokens) || !Number.isFinite(ledger.output_tokens)) throw new Error('Controle local de consumo inválido.');
const persist = () => writeFile(resolve(stateDir, 'usage.json'), JSON.stringify(ledger), { mode: 0o600 });
function rollPeriod() {
  const day = new Date().toISOString().slice(0, 10), month = day.slice(0, 7);
  if (ledger.month !== month) Object.assign(ledger, { month, monthly: 0, input_tokens: 0, output_tokens: 0 });
  if (ledger.day !== day) Object.assign(ledger, { day, daily: 0 });
}
function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(body)); }
async function readBody(req) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) throw new ApiError(415, 'Envie o conteúdo em JSON.');
  const chunks = []; let bytes = 0;
  for await (const chunk of req) { bytes += chunk.length; if (bytes > 100000) throw new ApiError(413, 'Conteúdo muito grande.'); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new ApiError(400, 'JSON inválido.'); }
}
const server = createServer(async (req, res) => {
  try {
    if (!allowedHosts.has(req.headers.host)) throw new ApiError(403, 'Host não permitido.');
    const origin = req.headers.origin;
    if (origin && ![`http://localhost:${port}`, `http://127.0.0.1:${port}`].includes(origin)) throw new ApiError(403, 'Acesse o painel pelo endereço local do servidor.');
    if (req.headers['sec-fetch-site'] === 'cross-site') throw new ApiError(403, 'Origem não permitida.');
    const url = new URL(req.url, `http://localhost:${port}`);
    if (url.pathname.startsWith('/api/')) {
      if (req.headers['x-atende-client'] !== 'panel') throw new ApiError(403, 'Acesse a API pelo painel local.');
      if (url.pathname === '/api/status' && req.method === 'GET') {
        rollPeriod();
        return json(res, 200, { configured: !!apiKey, mode: 'local', model, limits: { perMinute: 5, perDay: 30, perMonth: 200 }, usage: ledger });
      }
      if (url.pathname !== '/api/chat') throw new ApiError(404, 'Rota não encontrada.');
      if (req.method !== 'POST') throw new ApiError(405, 'Método não permitido.');
      if (!apiKey) throw new ApiError(503, 'Configure a chave da OpenAI no servidor antes de conversar.');
      const payload = prepareRequest(await readBody(req), model);
      if (busy) throw new ApiError(429, 'Aguarde a resposta anterior antes de enviar outra mensagem.');
      busy = true;
      try {
        rollPeriod();
        const now = Date.now(); attempts = attempts.filter(time => time > now - 60000);
        if (attempts.length >= 5 || ledger.daily >= 30 || ledger.monthly >= 200) throw new ApiError(429, 'Limite de testes atingido: 5 chamadas/minuto, 30/dia ou 200/mês.');
        attempts.push(now); ledger.daily++; ledger.monthly++;
        await persist(); // Reserve before calling the provider; failures count toward the cap.
        const result = await askOpenAI(payload, { apiKey });
        ledger.input_tokens += result.usage.input_tokens; ledger.output_tokens += result.usage.output_tokens;
        await persist();
        return json(res, 200, result);
      } finally { busy = false; }
    }
    if (!['GET', 'HEAD'].includes(req.method)) throw new ApiError(405, 'Método não permitido.');
    const requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const path = resolve(root, '.' + requested);
    if (!path.startsWith(root + sep) || !['.html', '.css', '.js', '.json', '.svg', '.png', '.ico'].includes(extname(path))) throw new ApiError(404, 'Arquivo não encontrado.');
    let content;
    try { content = await readFile(path); } catch { throw new ApiError(404, 'Arquivo não encontrado.'); }
    const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
    res.writeHead(200, { 'Content-Type': types[extname(path)] + '; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch (error) { json(res, error instanceof ApiError ? error.status : 500, { error: error instanceof ApiError ? error.message : 'Erro interno. Verifique o servidor local.' }); }
});
server.requestTimeout = 60000;
server.listen(port, '127.0.0.1', () => console.log(`Atende local: http://localhost:${port}\nOpenAI: ${apiKey ? 'chave configurada' : 'aguardando chave'} · modelo ${model}\nAcesso apenas neste computador. Chaves nunca são enviadas ao navegador.`));
