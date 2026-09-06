# CaosChat

MVP web de mensagens do repositório **Caosrael**. O CaosChat tem identidade
visual própria, interface responsiva, conversas individuais e em grupo,
mensagens em tempo real e dados persistidos localmente.

## O que já funciona

- cadastro e login com nome de exibição e senha;
- sessão persistente por 30 dias;
- lista de conversas com busca, prévia, horário e contador de não lidas;
- mensagens de texto em tempo real com Socket.IO;
- conversas entre duas pessoas;
- criação de grupos com nome e participantes;
- estado online e último acesso;
- layout adaptado para desktop e celular;
- base de demonstração criada automaticamente no primeiro uso.

## Requisitos

- Node.js 20 ou mais recente;
- npm 10 ou mais recente.

## Rodar localmente

```bash
npm install
npm run dev
```

Abra [http://localhost:5173](http://localhost:5173). A interface roda na porta
`5173` e a API na porta `3001`; o Vite encaminha as chamadas automaticamente.

O banco SQLite é criado em `data/caoschat.sqlite` e as sessões em
`data/sessions.sqlite`. Para recomeçar a demonstração do zero, pare o servidor,
apague a pasta `data/` e execute `npm run dev` novamente.

## Testar com duas pessoas

Na primeira execução, estas contas são criadas:

| Nome | Senha |
| --- | --- |
| `Ana Demo` | `demo1234` |
| `Bruno Demo` | `demo1234` |
| `Clara Demo` | `demo1234` |

1. Abra o CaosChat em uma janela normal e use **Entrar como Ana**.
2. Abra o mesmo endereço em uma janela anônima ou em outro perfil do navegador.
3. Na segunda janela, use **Entrar como Bruno**.
4. Abra a conversa entre Ana e Bruno e envie mensagens nas duas direções.
   Elas aparecem imediatamente, sem recarregar a página.

Também é possível criar contas próprias. Os nomes de exibição são únicos e
funcionam como identificação para login neste MVP.

## Scripts

```bash
npm run dev      # interface e API com recarga automática
npm test         # teste de integração do fluxo entre duas contas
npm run build    # valida TypeScript e gera a interface em dist/
npm start        # serve API e interface gerada na porta 3001
```

Para testar o modo de produção:

```bash
npm run build
npm start
```

Abra [http://localhost:3001](http://localhost:3001).

## Configuração

Variáveis opcionais:

| Variável | Padrão | Uso |
| --- | --- | --- |
| `PORT` | `3001` | porta da API e do servidor de produção |
| `SESSION_SECRET` | valor local de desenvolvimento | segredo de assinatura da sessão |
| `DATA_DIR` | `./data` | diretório dos bancos SQLite |
| `COOKIE_SECURE` | `false` | defina como `true` ao publicar somente em HTTPS |
| `DISABLE_DEMO_SEED` | `false` | desativa a criação das contas e conversas demo |

Em produção, use um `SESSION_SECRET` longo e aleatório.

## Estrutura

```text
server/
  db.ts          esquema SQLite e conteúdo de demonstração
  store.ts       operações de User, Chat, ChatMember e Message
  index.ts       API HTTP, autenticação, sessões e Socket.IO
  app.test.ts    teste de integração com duas contas
src/
  api.ts         cliente da API
  types.ts       tipos do domínio usados pela interface
  App.tsx        autenticação e experiência do mensageiro
  styles.css     identidade visual e responsividade
```

O modelo separa `users`, `chats`, `chat_members` e `messages`. Funcionalidades
sociais futuras podem adicionar `posts`, `comments`, `reactions` e mídia
referenciando `users.id`, sem misturar o feed com o domínio de mensagens.

## Fora deste MVP

Criptografia ponta a ponta, chamadas, mensagens de operadora/RCS, stories,
feed, canais e publicação em lojas não estão implementados. Antes de uso
público, também devem ser adicionados recuperação de conta, proteção contra
abuso, moderação, upload de mídia e uma estratégia de criptografia ponta a
ponta.
