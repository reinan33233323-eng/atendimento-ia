import { ApiError } from './openai.mjs';
export const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const formats = { 'audio/webm': 'webm', 'audio/mp4': 'mp4', 'audio/m4a': 'm4a', 'audio/x-m4a': 'm4a', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/flac': 'flac', 'audio/x-flac': 'flac' };
export function validateAudio(type, size) {
  const mime = (type || '').split(';')[0].trim().toLowerCase();
  if (!formats[mime]) throw new ApiError(415, 'Use um áudio MP3, M4A, MP4, WAV, OGG, FLAC ou WebM.');
  if (!size) throw new ApiError(400, 'O áudio está vazio. Grave ou escolha outro arquivo.');
  if (size > MAX_AUDIO_BYTES) throw new ApiError(413, 'O áudio deve ter no máximo 8 MB.');
  return { mime, extension: formats[mime] };
}
export async function transcribeAudio(bytes, type, { apiKey, fetchImpl = fetch }) {
  const { mime, extension } = validateAudio(type, bytes.byteLength);
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mime }), 'audio.' + extension);
  form.append('model', 'gpt-4o-mini-transcribe');
  form.append('language', 'pt');
  let response;
  try { response = await fetchImpl('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + apiKey }, body: form, signal: AbortSignal.timeout(45000) }); }
  catch { throw new ApiError(504, 'A transcrição demorou para responder. Tente novamente em instantes.'); }
  if (!response.ok) throw new ApiError(response.status === 429 ? 429 : 502, response.status === 429 ? 'Limite ou saldo insuficiente para transcrever o áudio.' : 'Não foi possível transcrever o áudio. Confira o arquivo e a configuração do servidor.');
  let result;
  try { result = await response.json(); } catch { throw new ApiError(502, 'Resposta de transcrição inválida.'); }
  const text = result.text?.trim();
  if (!text) throw new ApiError(422, 'Não foi possível identificar fala nesse áudio.');
  if (text.length > 2000) throw new ApiError(422, 'O áudio tem muita fala. Envie um trecho menor, de até 2.000 caracteres transcritos.');
  return { text, usage: { audio_input_tokens: result.usage?.input_tokens || 0, audio_output_tokens: result.usage?.output_tokens || 0, audio_transcriptions: 1 } };
}
