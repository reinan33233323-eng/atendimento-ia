(() => {
  const input = document.querySelector('#chat-input');
  const send = document.querySelector('#send-chat');
  const clear = document.querySelector('#clear-chat');
  const log = document.querySelector('#live-messages');
  const connection = document.querySelector('#connection-message');
  const feedback = document.querySelector('#chat-feedback');
  const usageLabel = document.querySelector('#chat-usage');
  const configForm = document.querySelector('#settings-form');
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  let messages = [], ready = false, sending = false;
  let apiBase = '', accessCode = '';
  let audioBusy = false, recorder = null, stream = null, recording = false, recordingTimer = null;
  let audioBlob = null, audioUrl = null;
  const recordAudio = document.querySelector('#record-audio');
  const attachAudio = document.querySelector('#attach-audio');
  const audioFile = document.querySelector('#audio-file');
  const audioStatus = document.querySelector('#audio-status');
  const audioPreview = document.querySelector('#audio-preview');
  const audioPlayer = document.querySelector('#audio-player');
  const sendAudio = document.querySelector('#send-audio');
  const discardAudio = document.querySelector('#discard-audio');
  const sessionKey = 'atende.access.session.v1';
  const authBox = document.querySelector('#online-auth');
  const codeInput = document.querySelector('#access-code');
  const connectButton = document.querySelector('#connect-online');
  function updateControls() {
    input.disabled = sending || audioBusy || recording;
    send.disabled = sending || audioBusy || recording;
    clear.disabled = sending || audioBusy || recording;
    attachAudio.disabled = sending || audioBusy || recording;
    recordAudio.disabled = sending || audioBusy;
    sendAudio.disabled = sending || audioBusy || recording || !audioBlob;
    discardAudio.disabled = sending || audioBusy || recording;
    send.textContent = sending ? 'Aguarde…' : (ready ? 'Enviar mensagem ↗' : 'Liberar envio ↗');
  }
  function rememberAccess() {
    if (local) return;
    try { sessionStorage.setItem(sessionKey, JSON.stringify({ code: accessCode, expiresAt: Date.now() + 8 * 60 * 60 * 1000 })); } catch {}
  }
  function forgetAccess() {
    ready = false; accessCode = '';
    try { sessionStorage.removeItem(sessionKey); } catch {}
    authBox.hidden = false;
    updateControls();
  }
  async function apiRequest(path, options = {}) {
    const headers = { ...options.headers, 'X-Atende-Client': 'panel' };
    if (!local) headers.Authorization = 'Bearer ' + accessCode;
    return fetch(apiBase + path, { ...options, headers, credentials: 'omit' });
  }
  function showUsage(state) {
    updateCostPanel(state);
    usageLabel.textContent = `${state.usage.daily}/${state.limits.perDay} chamadas hoje · ${state.usage.monthly}/${state.limits.perMonth} no mês. Falhas também contam no limite. Períodos em UTC. O valor em reais do painel ainda não é uma trava de cobrança.`;
  }
  let latestCostState = null;
  const rateField = document.querySelector('#exchange-rate');
  try {
    const savedRate = Number(localStorage.getItem('atende.exchangeRate'));
    if (savedRate >= 0.01 && savedRate <= 1000) rateField.value = String(savedRate);
  } catch {}
  function renderMoney(state) {
    const rate = Number(rateField.value);
    const valid = Number.isFinite(rate) && rate >= 0.01 && rate <= 1000;
    const amount = state?.estimate?.amount;
    document.querySelector('#cost-estimate').textContent = !valid ? 'Ajuste a cotação' : typeof amount === 'number' ? new Intl.NumberFormat('pt-BR', {style:'currency',currency:'BRL',minimumFractionDigits:6,maximumFractionDigits:6}).format(amount * rate) : '—';
    document.querySelector('#cost-conversion-note').textContent = valid && typeof amount === 'number' ? 'Base: US$ ' + amount.toFixed(6).replace('.', ',') + ' × R$ ' + rate.toLocaleString('pt-BR', {minimumFractionDigits:2,maximumFractionDigits:2}) : 'BRL · estimativa dos tokens registrados';
  }
  rateField.addEventListener('input', () => {
    const rate = Number(rateField.value);
    if (rate >= 0.01 && rate <= 1000) { try { localStorage.setItem('atende.exchangeRate', String(rate)); } catch {} }
    renderMoney(latestCostState);
  });
  function updateCostPanel(state) {
    latestCostState = state;
    renderMoney(state);
    const number = value => new Intl.NumberFormat('pt-BR').format(value || 0);
    const usage = state.usage;
    document.querySelector('#usage-calls').textContent = number(usage.monthly);
    document.querySelector('#usage-tokens').textContent = number((usage.input_tokens || 0) + (usage.output_tokens || 0));
    document.querySelector('#usage-input').textContent = number(usage.input_tokens);
    document.querySelector('#usage-output').textContent = number(usage.output_tokens);
    document.querySelector('#usage-cache').textContent = number(usage.cached_input_tokens);
    document.querySelector('#usage-daily').textContent = number(usage.daily) + ' / ' + state.limits.perDay;
    document.querySelector('#usage-limit').textContent = state.limits.perMonth + ' chamadas';
    document.querySelector('#usage-model').textContent = state.model;
    document.querySelector('#cost-status').textContent = 'Mês ' + usage.month + ' · ambiente ' + (state.mode === 'online' ? 'online' : 'local') + ' · atualizado às ' + new Date().toLocaleTimeString('pt-BR') + '. Período em UTC.';
  }
  async function refreshCosts() {
    const status = document.querySelector('#cost-status');
    if (!ready) { status.textContent = 'Libere o acesso na aba Testar atendimento para consultar o consumo privado.'; return; }
    try {
      const response = await apiRequest('/api/status');
      if (!response.ok) throw new Error('Não foi possível atualizar. Verifique o acesso na aba de teste.');
      showUsage(await response.json());
    } catch(error) { status.textContent = error.message; }
  }
  document.querySelector('#refresh-usage').addEventListener('click', refreshCosts);
  document.querySelector('[data-tab="budget"]').addEventListener('click', refreshCosts);
  const settingsNames = ['assistantName', 'companyName', 'greeting', 'tone', 'instructions', 'handoff', 'services', 'hours', 'contact', 'faq'];
  function settings() {
    return Object.fromEntries(settingsNames.map(name => [name, configForm.elements[name].type === 'checkbox' ? configForm.elements[name].checked : configForm.elements[name].value]));
  }
  function addMessage(role, content) {
    log.querySelector('.empty-chat')?.remove();
    const row = document.createElement('div'); row.className = 'live-message ' + role;
    const label = document.createElement('strong'); label.textContent = role === 'user' ? 'Você' : (configForm.elements.assistantName.value.trim() || 'Assistente');
    const text = document.createElement('p'); text.textContent = content;
    row.append(label, text); log.append(row); row.scrollIntoView({ block: 'nearest' });
  }
  async function checkConnection() {
    if (!local && !apiBase) {
      connection.textContent = 'A conexão está carregando. Você já pode escrever sua mensagem.';
      updateControls();
      return;
    }
    if (!local && !accessCode) {
      authBox.hidden = false;
      connection.textContent = 'Você já pode escrever abaixo. Para enviar à IA, informe o código de acesso e clique em Conectar IA online.';
      updateControls();
      return;
    }
    try {
      const response = await apiRequest('/api/status');
      if (!response.ok) {
        ready = false; updateControls();
        if (response.status === 401 && !local) forgetAccess();
        const failure = await response.json();
        throw new Error(failure.error || 'Não foi possível conectar.');
      }
      const state = await response.json(); ready = state.configured === true;
      updateControls();
      connection.textContent = ready ? `Servidor configurado · ${state.model}. A chave será validada pela OpenAI ao enviar a primeira mensagem.` : 'Servidor disponível, mas falta configurar a chave da OpenAI.';
      showUsage(state);
      if (ready) {
        const channel = document.querySelector('[data-panel="channels"] .connection-state');
        channel.textContent = local ? 'Configurado localmente' : 'Servidor online conectado';
        if (!local) { rememberAccess(); authBox.hidden = true; codeInput.value = ''; }
      }
    } catch (error) { ready = false; updateControls(); connection.textContent = error.message || 'Servidor de IA indisponível.'; if (!local) authBox.hidden = false; }
  }
  send.addEventListener('click', async () => {
    const text = input.value.trim();
    if (sending || audioBusy || recording) return;
    if (!ready) {
      await checkConnection();
      if (!ready) {
        feedback.textContent = local ? 'Conecte o servidor para enviar. Sua mensagem continua no campo.' : 'Falta liberar o acesso à IA. Informe o código no campo destacado acima. Sua mensagem continua salva no campo.';
        if (!local) { authBox.hidden = false; authBox.scrollIntoView({block:'center', behavior:'smooth'}); codeInput.focus({preventScroll:true}); }
        return;
      }
    }
    if (!text) { feedback.textContent = 'Escreva uma mensagem para enviar à IA.'; input.focus(); return; }
    if (messages.length >= 12) { feedback.textContent = 'Comece uma nova conversa para continuar o teste.'; return; }
    if (text.length > 2000) { feedback.textContent = 'Use até 2.000 caracteres por mensagem.'; return; }
    const pending = [...messages, { role: 'user', content: text }];
    sending = true; updateControls(); feedback.textContent = 'O assistente está respondendo…';
    try {
      const response = await apiRequest('/api/chat', { method: 'POST', signal: AbortSignal.timeout(55000), headers: { 'Content-Type': 'application/json', 'X-Atende-Client': 'panel' }, body: JSON.stringify({ settings: settings(), messages: pending }) });
      const result = await response.json();
      if (!response.ok) { if (response.status === 401 && !local) forgetAccess(); throw new Error(result.error || 'Não foi possível gerar a resposta.'); }
      if (typeof result.reply !== 'string') throw new Error('Resposta inválida do servidor.');
      messages = [...pending, { role: 'assistant', content: result.reply }];
      addMessage('user', text); addMessage('assistant', result.reply); input.value = '';
      feedback.textContent = `Resposta recebida · ${result.usage.input_tokens} tokens de entrada e ${result.usage.output_tokens} de saída · ${result.model}.`;
      connection.textContent = 'Conexão com a OpenAI validada nesta sessão. Atendimento ' + (local ? 'local' : 'online') + ' ativo.';
    } catch (error) { feedback.textContent = error.name === 'TimeoutError' ? 'O servidor demorou para responder. Aguarde antes de tentar novamente; a chamada pode ter consumido créditos.' : error.message; }
    finally {
      sending = false; updateControls(); clear.disabled = false;
      apiRequest('/api/status').then(response => response.ok ? response.json() : null).then(state => { if (state) showUsage(state); }).catch(() => {});
    }
  });
  clear.addEventListener('click', () => {
    resetAudio(); messages = []; log.replaceChildren(); const empty = document.createElement('p'); empty.className = 'empty-chat'; empty.textContent = 'Nova conversa. Faça uma pergunta para testar o atendimento.'; log.append(empty); feedback.textContent = ''; input.value = '';
  });
  function resetAudio() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioBlob = null; audioUrl = null; audioFile.value = ''; audioPlayer.removeAttribute('src'); audioPlayer.load(); audioPreview.hidden = true;
    updateControls();
  }
  function previewAudio(blob) {
    if (!blob.size || blob.size > 8 * 1024 * 1024) { audioStatus.textContent = 'Escolha um áudio com conteúdo e no máximo 8 MB.'; return; }
    resetAudio(); audioBlob = blob; audioUrl = URL.createObjectURL(blob); audioPlayer.src = audioUrl; audioPreview.hidden = false;
    audioStatus.textContent = 'Áudio pronto. Ouça a prévia e clique em Enviar áudio.'; updateControls();
  }
  function stopRecording() {
    if (recorder?.state === 'recording') recorder.stop();
    stream?.getTracks().forEach(track => track.stop()); stream = null;
    clearTimeout(recordingTimer); recording = false; recordAudio.classList.remove('recording'); recordAudio.textContent = '◉ Gravar áudio'; updateControls();
  }
  recordAudio.addEventListener('click', async () => {
    if (recording) { stopRecording(); return; }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { audioStatus.textContent = 'Este navegador não permite gravar aqui. Use Anexar áudio ou abra no Chrome/Safari.'; return; }
    audioBusy = true; updateControls();
    try {
      stream = await navigator.mediaDevices.getUserMedia({audio:true});
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
      recorder = new MediaRecorder(stream, mimeType ? {mimeType} : undefined);
      const chunks = [];
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => { audioStatus.textContent = 'Não foi possível gravar. Tente anexar um arquivo.'; stopRecording(); };
      recorder.onstop = () => { const type = recorder.mimeType; stopRecording(); previewAudio(new Blob(chunks, {type})); };
      recorder.start(); recording = true; recordAudio.textContent = '■ Parar gravação'; recordAudio.classList.add('recording');
      audioStatus.textContent = 'Gravando… clique em Parar gravação quando terminar (máximo 2 minutos).';
      recordingTimer = setTimeout(stopRecording, 120000);
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop()); stream = null;
      audioStatus.textContent = error.name === 'NotAllowedError' ? 'O microfone não foi autorizado. Libere a permissão no navegador ou use Anexar áudio.' : 'Microfone indisponível. Use Anexar áudio.';
    } finally { audioBusy = false; updateControls(); }
  });
  attachAudio.addEventListener('click', () => audioFile.click());
  audioFile.addEventListener('change', () => {
    const file = audioFile.files[0]; if (!file) return;
    const types = {mp3:'audio/mpeg',mp4:'audio/mp4',m4a:'audio/mp4',wav:'audio/wav',ogg:'audio/ogg',webm:'audio/webm',flac:'audio/flac'};
    const type = types[file.name.split('.').pop().toLowerCase()] || file.type;
    if (!Object.values(types).includes(type)) { audioStatus.textContent = 'Use um arquivo MP3, M4A, MP4, WAV, OGG, FLAC ou WebM.'; audioFile.value = ''; return; }
    previewAudio(new Blob([file], {type}));
  });
  discardAudio.addEventListener('click', () => { resetAudio(); audioStatus.textContent = 'Áudio descartado. Você pode gravar ou anexar outro.'; });
  sendAudio.addEventListener('click', async () => {
    if (!audioBlob || sending || audioBusy || recording) return;
    if (input.value.trim()) { audioStatus.textContent = 'Envie ou apague o texto no campo antes de enviar o áudio.'; return; }
    if (!ready) { await checkConnection(); if (!ready) { audioStatus.textContent = 'Conecte a IA com o código de acesso antes de enviar o áudio.'; return; } }
    if (messages.length >= 12) { audioStatus.textContent = 'Comece uma nova conversa antes de enviar o áudio.'; return; }
    audioBusy = true; updateControls(); audioStatus.textContent = 'Ouvindo e transcrevendo o áudio…';
    let transcribed = false;
    try {
      const response = await apiRequest('/api/transcribe', {method:'POST', headers:{'Content-Type':audioBlob.type}, body:audioBlob, signal:AbortSignal.timeout(55000)});
      const result = await response.json();
      if (!response.ok) { if (response.status === 401 && !local) forgetAccess(); throw new Error(result.error || 'Não foi possível transcrever.'); }
      if (typeof result.text !== 'string' || !result.text.trim()) throw new Error('Não foi possível identificar fala.');
      input.value = result.text; resetAudio(); audioStatus.textContent = 'Áudio transcrito. A resposta aparece na conversa.'; transcribed = true;
    } catch (error) { audioStatus.textContent = error.name === 'TimeoutError' ? 'A transcrição demorou. Aguarde antes de tentar novamente; pode ter consumido créditos.' : error.message; }
    finally { audioBusy = false; updateControls(); refreshCosts(); }
    if (transcribed) send.click();
  });
  window.addEventListener('pagehide', () => { stopRecording(); if (audioUrl) URL.revokeObjectURL(audioUrl); });
  input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); send.click(); } });
  configForm.addEventListener('submit', event => { if (event.submitter?.id === 'send-chat') event.preventDefault(); });
  connectButton.addEventListener('click', async () => {
    accessCode = codeInput.value.trim();
    if (!accessCode) { connection.textContent = 'Preencha o código de acesso.'; return; }
    connectButton.disabled = true;
    try { await checkConnection(); if (ready) feedback.textContent = 'Acesso liberado. Você já pode enviar sua mensagem.'; } finally { connectButton.disabled = false; }
  });
  codeInput.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); connectButton.click(); } });
  updateControls();
  (async () => {
    if (!local) {
      try {
        const configResponse = await fetch('./runtime-config.json', { cache: 'no-store' });
        if (!configResponse.ok) throw new Error('Configuração indisponível.');
        const config = await configResponse.json();
        if (config.apiBase) {
          const url = new URL(config.apiBase);
          if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Endereço de servidor inválido.');
          apiBase = url.origin;
          try {
            const savedAccess = JSON.parse(sessionStorage.getItem(sessionKey) || 'null');
            if (savedAccess && typeof savedAccess.code === 'string' && savedAccess.code.length <= 256 && savedAccess.expiresAt > Date.now()) accessCode = savedAccess.code;
            else sessionStorage.removeItem(sessionKey);
          } catch {}
        }
      } catch { connection.textContent = 'Não foi possível carregar a configuração online. Recarregue a página.'; return; }
    }
    await checkConnection();
  })();
})();
