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

## IA no GitHub Pages

A interface pública usa o servidor Cloudflare Worker definido em `wrangler.jsonc`. O endereço público do servidor fica em `dist/runtime-config.json`; esse arquivo nunca contém segredos.

A chave OpenAI fica no segredo `OPENAI_API_KEY` do Worker. O código privado do painel fica em `PANEL_ACCESS_TOKEN`. O visitante precisa informar esse código na aba Testar atendimento. O código fica apenas na memória da aba, sem localStorage ou URL. Recarregar a página exige informá-lo de novo.

O servidor valida o código, restringe CORS à origem do Pages, valida o tamanho das mensagens e usa um Durable Object para persistir as quotas: 5 chamadas por minuto de calendário, 30/dia e 200/mês, em UTC. As tentativas contam antes de chamar a OpenAI, inclusive em falhas. Essas quotas são separadas das do servidor local. A quota de chamadas não representa um teto financeiro em reais.

Para atualizar a API, execute `npx wrangler@4 deploy` na conta correta da Cloudflare. O workflow do GitHub publica apenas a interface, sem alterar o Worker. Nunca cadastre segredos em `wrangler.jsonc` nem nos arquivos de `dist`.

## Limites atuais

O chat real funciona localmente e no Pages através do Worker. O acesso online usa um código privado compartilhado; ainda não há contas individuais, conexão com WhatsApp, cobrança integrada ou trava financeira por orçamento. Os dados da empresa continuam salvos no navegador e não são sincronizados entre dispositivos. A prévia de apresentação continua estática; a conversa real fica na aba Testar atendimento.

O Pages acessa apenas o Worker online, sem depender do computador ligado. Não exponha o servidor local de desenvolvimento na internet. Chaves nunca devem entrar nos arquivos públicos nem no localStorage.

## Desenvolvimento

Sem instalação ou etapa de build. Sirva a pasta `dist` com um servidor HTTP local, por exemplo `python3 -m http.server 4173 --directory dist`.

## Publicação

O workflow `.github/workflows/pages.yml` publica `dist` a cada push na branch `main`. Em Settings → Pages, a origem deve ser GitHub Actions.
