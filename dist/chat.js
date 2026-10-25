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
  const authBox = document.querySelector('#online-auth');
  const codeInput = document.querySelector('#access-code');
  const connectButton = document.querySelector('#connect-online');
  async function apiRequest(path, options = {}) {
    const headers = { ...options.headers, 'X-Atende-Client': 'panel' };
    if (!local) headers.Authorization = 'Bearer ' + accessCode;
    return fetch(apiBase + path, { ...options, headers, credentials: 'omit' });
  }
  function showUsage(state) {
    usageLabel.textContent = `${state.usage.daily}/${state.limits.perDay} chamadas hoje · ${state.usage.monthly}/${state.limits.perMonth} no mês. Falhas também contam no limite. Períodos em UTC. O valor em reais do painel ainda não é uma trava de cobrança.`;
  }
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
      connection.textContent = 'A integração online está aguardando a publicação do servidor.';
      return;
    }
    if (!local && !accessCode) {
      authBox.hidden = false;
      connection.textContent = 'Servidor online disponível. Informe seu código privado para habilitar o atendimento.';
      return;
    }
    try {
      const response = await apiRequest('/api/status');
      if (!response.ok) {
        ready = false; input.disabled = send.disabled = true;
        const failure = await response.json();
        throw new Error(failure.error || 'Não foi possível conectar.');
      }
      const state = await response.json(); ready = state.configured === true;
      input.disabled = send.disabled = !ready;
      connection.textContent = ready ? `Servidor configurado · ${state.model}. A chave será validada pela OpenAI ao enviar a primeira mensagem.` : 'Servidor disponível, mas falta configurar a chave da OpenAI.';
      showUsage(state);
      if (ready) {
        const channel = document.querySelector('[data-panel="channels"] .connection-state');
        channel.textContent = local ? 'Configurado localmente' : 'Servidor online conectado';
        if (!local) { authBox.hidden = true; codeInput.value = ''; }
      }
    } catch (error) { connection.textContent = error.message || 'Servidor de IA indisponível.'; if (!local) authBox.hidden = false; }
  }
  send.addEventListener('click', async () => {
    const text = input.value.trim();
    if (!ready || sending || !text) return;
    if (messages.length >= 12) { feedback.textContent = 'Comece uma nova conversa para continuar o teste.'; return; }
    if (text.length > 2000) { feedback.textContent = 'Use até 2.000 caracteres por mensagem.'; return; }
    const pending = [...messages, { role: 'user', content: text }];
    sending = true; send.disabled = clear.disabled = input.disabled = true; feedback.textContent = 'O assistente está respondendo…';
    try {
      const response = await apiRequest('/api/chat', { method: 'POST', signal: AbortSignal.timeout(55000), headers: { 'Content-Type': 'application/json', 'X-Atende-Client': 'panel' }, body: JSON.stringify({ settings: settings(), messages: pending }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível gerar a resposta.');
      if (typeof result.reply !== 'string') throw new Error('Resposta inválida do servidor.');
      messages = [...pending, { role: 'assistant', content: result.reply }];
      addMessage('user', text); addMessage('assistant', result.reply); input.value = '';
      feedback.textContent = `Resposta recebida · ${result.usage.input_tokens} tokens de entrada e ${result.usage.output_tokens} de saída · ${result.model}.`;
      connection.textContent = 'Conexão com a OpenAI validada nesta sessão. Atendimento ' + (local ? 'local' : 'online') + ' ativo.';
    } catch (error) { feedback.textContent = error.name === 'TimeoutError' ? 'O servidor demorou para responder. Aguarde antes de tentar novamente; a chamada pode ter consumido créditos.' : error.message; }
    finally {
      sending = false; send.disabled = input.disabled = !ready; clear.disabled = false;
      apiRequest('/api/status').then(response => response.ok ? response.json() : null).then(state => { if (state) showUsage(state); }).catch(() => {});
    }
  });
  clear.addEventListener('click', () => {
    messages = []; log.replaceChildren(); const empty = document.createElement('p'); empty.className = 'empty-chat'; empty.textContent = 'Nova conversa. Faça uma pergunta para testar o atendimento.'; log.append(empty); feedback.textContent = ''; input.value = '';
  });
  input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); send.click(); } });
  configForm.addEventListener('submit', event => { if (event.submitter?.id === 'send-chat') event.preventDefault(); });
  connectButton.addEventListener('click', async () => {
    accessCode = codeInput.value.trim();
    if (!accessCode) { connection.textContent = 'Preencha o código de acesso.'; return; }
    connectButton.disabled = true;
    try { await checkConnection(); } finally { connectButton.disabled = false; }
  });
  codeInput.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); connectButton.click(); } });
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
        }
      } catch { connection.textContent = 'Não foi possível carregar a configuração online. Recarregue a página.'; return; }
    }
    await checkConnection();
  })();
})();
