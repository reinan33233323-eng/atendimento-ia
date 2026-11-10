import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAudio, transcribeAudio, MAX_AUDIO_BYTES } from '../backend/audio.mjs';
import worker from '../backend/worker.mjs';
test('Áudio valida formato, conteúdo e limite antes de chamar provedor', () => {
  assert.equal(validateAudio('audio/webm;codecs=opus', 10).extension, 'webm');
  for (const [type, size] of [['text/plain', 10], ['audio/wav', 0], ['audio/wav', MAX_AUDIO_BYTES + 1]]) assert.throws(() => validateAudio(type, size));
});
test('Transcrição envia multipart privado e separa tokens do texto', async () => {
  const result = await transcribeAudio(new Uint8Array([1,2,3]), 'audio/wav', {apiKey:'test-private',fetchImpl:async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/audio/transcriptions');
    assert.equal(options.headers.Authorization, 'Bearer test-private');
    assert.equal(options.body.get('file').name, 'audio.wav');
    assert.equal(options.body.get('model'), 'gpt-4o-mini-transcribe');
    return Response.json({text:'Olá, qual é o horário?',usage:{input_tokens:20,output_tokens:8}});
  }});
  assert.equal(result.text, 'Olá, qual é o horário?');
  assert.equal(result.usage.audio_input_tokens,20);
  assert.equal(result.usage.input_tokens,undefined);
});
test('Transcrição trata falhas sem expor detalhes e rejeita fala vazia ou extensa', async () => {
  for (const response of [new Response('sensitive-provider-detail',{status:401}),Response.json({text:''}),Response.json({text:'a'.repeat(2001)})]) {
    await assert.rejects(transcribeAudio(new Uint8Array([1]),'audio/mp4',{apiKey:'test-private',fetchImpl:async()=>response}),error=>!error.message.includes('sensitive-provider-detail'));
  }
});
test('Rota de áudio preserva autenticação e valida antes de reservar quota', async () => {
  let reserved=0;
  const env={OPENAI_API_KEY:'fake',PANEL_ACCESS_TOKEN:'private',QUOTA:{idFromName:x=>x,get:()=>({fetch:async()=>{reserved++;return Response.json({});}})}};
  const request=auth=>new Request('https://test/api/transcribe',{method:'POST',headers:{'Content-Type':'text/plain',...(auth?{Authorization:'Bearer private'}:{})},body:'invalid'});
  assert.equal((await worker.fetch(request(false),env)).status,401);
  assert.equal((await worker.fetch(request(true),env)).status,415);
  assert.equal(reserved,0);
});
