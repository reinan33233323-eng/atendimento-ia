const form = document.querySelector('#settings-form');
const storageKey = 'atende.settings.v1';
const stateLabel = document.querySelector('#save-state');
const tabs = {
  test: ['Testar atendimento', 'A primeira conversa.<br>Agora com o seu assistente.', 'Teste as respostas antes de colocar o atendimento em operação.'],
  assistant: ['Meu assistente', 'Seu próximo bom atendimento<br>começa com uma boa conversa.', 'Configure a personalidade do seu assistente e deixe a sua marca em cada resposta.'],
  knowledge: ['Conhecimento', 'O seu negócio.<br>Na ponta da conversa.', 'Organize as informações que vão orientar o atendimento.'],
  channels: ['Canais e conexões', 'Cada conexão abre<br>uma nova conversa.', 'Prepare os canais que vão aproximar a sua empresa dos clientes.'],
  budget: ['Custos e limites', 'Mais clareza nos custos.<br>Mais controle para crescer.', 'Planeje o orçamento e as preferências do seu atendimento.']
};
function setTab(tab) {
  if (!tabs[tab]) return;
  document.querySelectorAll('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== tab; });
  document.querySelectorAll('[data-tab]').forEach(button => { button.classList.toggle('active', button.dataset.tab === tab); button.setAttribute('aria-current', button.dataset.tab === tab ? 'page' : 'false'); });
  document.querySelector('#breadcrumb').textContent = tabs[tab][0];
  document.querySelector('#page-title').innerHTML = tabs[tab][1];
  document.querySelector('#page-description').textContent = tabs[tab][2];
  history.replaceState(null, '', '#' + tab);
}
function updatePreview() {
  const name = form.elements.assistantName.value.trim();
  document.querySelector('#preview-name').textContent = name || 'Seu assistente';
  document.querySelector('#preview-greeting').textContent = form.elements.greeting.value.trim() || `Olá! Sou ${name || 'seu assistente virtual'}. Como posso ajudar?`;
  const budget = Number(form.elements.budget.value);
  document.querySelector('#budget-preview').textContent = Number.isFinite(budget) ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(budget) : '—';
}
try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
  if (saved && typeof saved === 'object') {
    for (const field of form.elements) {
      if (field.name && Object.hasOwn(saved, field.name)) {
        if (field.type === 'checkbox') field.checked = saved[field.name] === true;
        else if (typeof saved[field.name] === 'string') field.value = saved[field.name];
      }
    }
    stateLabel.textContent = 'Configurações recuperadas deste navegador.';
  }
} catch { stateLabel.textContent = 'Não foi possível recuperar as configurações locais.'; }
document.querySelectorAll('[data-tab], [data-go]').forEach(button => button.addEventListener('click', () => setTab(button.dataset.tab || button.dataset.go)));
form.addEventListener('input', event => { if (!event.target.name) return; updatePreview(); stateLabel.textContent = 'Você tem alterações para salvar.'; });
let toastTimer;
form.addEventListener('submit', event => {
  event.preventDefault();
  const settings = {};
  for (const field of form.elements) if (field.name) settings[field.name] = field.type === 'checkbox' ? field.checked : field.value;
  try {
    localStorage.setItem(storageKey, JSON.stringify(settings));
    stateLabel.textContent = 'Salvo neste navegador às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '.';
    const toast = document.querySelector('#toast'); toast.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
  } catch { stateLabel.textContent = 'Não foi possível salvar. Verifique se o armazenamento do navegador está disponível.'; }
});
updatePreview();
setTab(location.hash.slice(1) || 'assistant');

window.addEventListener('hashchange', () => setTab(location.hash.slice(1) || 'assistant'));
