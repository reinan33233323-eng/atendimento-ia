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
    if (!local) {
      connection.textContent = 'Este endereço público ainda não tem um servidor de IA hospedado. O teste real está disponível no seu computador, em http://localhost:4174/#test, enquanto o servidor local estiver ligado.';
      return;
    }
    try {
      const response = await fetch('./api/status', { headers: { 'X-Atende-Client': 'panel' } });
      if (!response.ok) throw new Error();
      const state = await response.json(); ready = state.configured === true;
      input.disabled = send.disabled = !ready;
      connection.textContent = ready ? `Servidor local configurado · ${state.model}. A chave será validada pela OpenAI ao enviar a primeira mensagem.` : 'Servidor disponível, mas falta configurar a chave da OpenAI.';
      showUsage(state);
      if (ready) {
        const channel = document.querySelector('[data-panel="channels"] .connection-state');
        channel.textContent = 'Configurado localmente';
      }
    } catch { connection.textContent = 'Servidor de IA indisponível neste endereço. Inicie o servidor com “npm start” e abra http://localhost:4174/#test.'; }
  }
  send.addEventListener('click', async () => {
    const text = input.value.trim();
    if (!ready || sending || !text) return;
    if (messages.length >= 12) { feedback.textContent = 'Comece uma nova conversa para continuar o teste.'; return; }
    if (text.length > 2000) { feedback.textContent = 'Use até 2.000 caracteres por mensagem.'; return; }
    const pending = [...messages, { role: 'user', content: text }];
    sending = true; send.disabled = clear.disabled = input.disabled = true; feedback.textContent = 'O assistente está respondendo…';
    try {
      const response = await fetch('./api/chat', { method: 'POST', signal: AbortSignal.timeout(55000), headers: { 'Content-Type': 'application/json', 'X-Atende-Client': 'panel' }, body: JSON.stringify({ settings: settings(), messages: pending }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível gerar a resposta.');
      if (typeof result.reply !== 'string') throw new Error('Resposta inválida do servidor.');
      messages = [...pending, { role: 'assistant', content: result.reply }];
      addMessage('user', text); addMessage('assistant', result.reply); input.value = '';
      feedback.textContent = `Resposta recebida · ${result.usage.input_tokens} tokens de entrada e ${result.usage.output_tokens} de saída · ${result.model}.`;
      connection.textContent = 'Conexão com a OpenAI validada nesta sessão. Atendimento de teste local ativo.';
    } catch (error) { feedback.textContent = error.name === 'TimeoutError' ? 'O servidor demorou para responder. Aguarde antes de tentar novamente; a chamada pode ter consumido créditos.' : error.message; }
    finally {
      sending = false; send.disabled = input.disabled = !ready; clear.disabled = false;
      fetch('./api/status', { headers: { 'X-Atende-Client': 'panel' } }).then(response => response.ok ? response.json() : null).then(state => { if (state) showUsage(state); }).catch(() => {});
    }
  });
  clear.addEventListener('click', () => {
    messages = []; log.replaceChildren(); const empty = document.createElement('p'); empty.className = 'empty-chat'; empty.textContent = 'Nova conversa. Faça uma pergunta para testar o atendimento.'; log.append(empty); feedback.textContent = ''; input.value = '';
  });
  input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); send.click(); } });
  configForm.addEventListener('submit', event => { if (event.submitter?.id === 'send-chat') event.preventDefault(); });
  checkConnection();
})();
