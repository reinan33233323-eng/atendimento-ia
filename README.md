# Atende · Atendimento com IA

Painel independente para configurar um assistente de atendimento. Primeira versão estática, em português, publicada no GitHub Pages.

## Nesta versão

- Identidade, apresentação, tom de voz e instruções do assistente.
- Cadastro de serviços, horários, contato e perguntas frequentes.
- Prévia de apresentação atualizada durante a edição.
- Preparação dos canais e preferências de orçamento.
- Persistência das configurações no localStorage do navegador.

## Chat real com a OpenAI (local)

Requer Node.js 22 ou superior. Sem dependências externas para o servidor.

1. Execute `npm run configure-key` e cole a chave no terminal. A entrada fica oculta; o segredo é salvo em `.env` com permissões restritas e excluído do Git.
2. Execute `npm start` ou abra `Iniciar.command`.
3. Acesse `http://localhost:4174/#test` e use a aba **Testar atendimento**.

O servidor chama a Responses API da OpenAI com o modelo definido em `OPENAI_MODEL` (padrão: `gpt-6-luna`), a configuração atual do painel e até 12 mensagens. A chave nunca vai para o navegador. Não há resposta simulada: erros de chave, saldo ou provedor são apresentados como erros.

Proteções locais: escuta somente em `127.0.0.1`; valida Host e origem; exige cabeçalho próprio nas rotas da API; serve apenas `dist`; limita mensagens, tamanho da base e respostas. Permite uma chamada por vez, até 5/minuto, 30/dia e 200/mês. Tentativas são reservadas antes da chamada e contam mesmo em falhas, para evitar repetição sem controle. Dia e mês são UTC. Contadores e tokens ficam em `.runtime/usage.json`, fora do Git; não apague esse arquivo para manter os limites.

Esses limites são de chamadas, não garantem um teto financeiro em reais. O orçamento em reais do painel continua sendo apenas uma preferência. Confira a cobrança no painel da OpenAI. A conversa não é salva em disco pelo aplicativo e a requisição usa `store: false`; aplicam-se as políticas de retenção do provedor.

Execute `npm test` para testar validação, composição das instruções e tratamento de respostas/erros sem chamadas pagas.

## Limites atuais

O servidor de IA funciona localmente. Ainda não existe servidor de produção, login online, conexão com WhatsApp, cobrança integrada ou trava financeira por orçamento. Os dados não são sincronizados entre dispositivos. A prévia de apresentação continua estática; a conversa real fica na aba Testar atendimento quando aberta pelo servidor local.

O GitHub Pages hospeda a interface estática e não acessa este servidor local. Para disponibilizar a IA no endereço público, será necessário hospedar um backend com autenticação, segredos de produção, limites duráveis e CORS para a origem correta. Não exponha este servidor de desenvolvimento na internet. Chaves nunca devem entrar nos arquivos públicos nem no localStorage.

## Desenvolvimento

Sem instalação ou etapa de build. Sirva a pasta `dist` com um servidor HTTP local, por exemplo `python3 -m http.server 4173 --directory dist`.

## Publicação

O workflow `.github/workflows/pages.yml` publica `dist` a cada push na branch `main`. Em Settings → Pages, a origem deve ser GitHub Actions.
