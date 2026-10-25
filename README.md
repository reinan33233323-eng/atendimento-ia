# Atende · Atendimento com IA

Painel independente para configurar um assistente de atendimento. Primeira versão estática, em português, publicada no GitHub Pages.

## Nesta versão

- Identidade, apresentação, tom de voz e instruções do assistente.
- Cadastro de serviços, horários, contato e perguntas frequentes.
- Prévia de apresentação atualizada durante a edição.
- Preparação dos canais e preferências de orçamento.
- Persistência das configurações no localStorage do navegador.

## Limites atuais

Ainda não existe servidor, login, resposta de IA, conexão com WhatsApp, cobrança integrada ou trava real de orçamento. Os dados não são sincronizados entre dispositivos. A prévia não executa uma conversa de IA. Não cadastre segredos nem dados de clientes nesta versão.

O GitHub Pages hospeda a interface estática. A integração real precisará de um backend seguro para guardar as chaves da OpenAI/Meta, receber webhooks, autenticar usuários e medir consumo. Chaves nunca devem entrar nos arquivos públicos nem no localStorage.

## Desenvolvimento

Sem instalação ou etapa de build. Sirva a pasta `dist` com um servidor HTTP local, por exemplo `python3 -m http.server 4173 --directory dist`.

## Publicação

O workflow `.github/workflows/pages.yml` publica `dist` a cada push na branch `main`. Em Settings → Pages, a origem deve ser GitHub Actions.
