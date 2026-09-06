# CaosChat

MVP web de mensagens do repositório **Caosrael**. O CaosChat tem identidade
visual própria, interface responsiva, conversas individuais e em grupo,
mensagens em tempo real e dados persistidos localmente.

## Acesso público

**URL HTTPS:** use o domínio público exibido em **Networking** no serviço
Railway. Ele ainda não foi registrado neste README.

O deploy está preparado para servir interface, API e WebSocket no mesmo domínio.
O SQLite e as sessões ficam em um volume persistente de 512 MB. A URL
`.railway.app` será registrada aqui assim que o primeiro deploy autenticado for
concluído.

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

- Node.js 22.12 ou mais recente;
- npm 10 ou mais recente.

## Rodar localmente

```bash
npm install
npm run dev
```

Abra [http://localhost:5173](http://localhost:5173). A interface roda na porta
`5173` e a API na porta `3001`; o Vite encaminha as chamadas automaticamente.

O banco SQLite é criado em `data/caoschat.sqlite`, incluindo as sessões
persistentes. Para recomeçar a demonstração do zero, pare o servidor, apague a
pasta `data/` e execute `npm run dev` novamente.

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

## Ticks das mensagens

Os ticks aparecem apenas nas mensagens enviadas por você:

| Indicador | Estado |
| --- | --- |
| 1 tick | mensagem persistida pelo servidor |
| 2 ticks | entregue ao destinatário; em grupos, entregue à maioria |
| 2 ticks ciano | lida; em grupos, lida pela maioria |

Cada destinatário tem seu próprio recibo com horários de envio, entrega e
leitura. O app confirma entrega ao receber ou sincronizar a mensagem e confirma
leitura quando a conversa é aberta ou volta ao foco. Recibos de leitura ficam
ativos por padrão neste MVP; o modelo permite adicionar uma preferência de
privacidade depois. Em canais, a entrega exige todos os inscritos.

## Presença, perfil e identidade

Os pontos de presença lembram mensageiros clássicos, sem se confundirem com os
ticks ciano:

| Cor | Significado |
| --- | --- |
| Verde | a pessoa está com esta conversa aberta e em foco |
| Amarelo | o CaosChat está aberto, mas em outra tela ou conversa |
| Vermelho | app em segundo plano, fechado ou sem heartbeat |

O navegador reporta presença pelo Socket.IO a cada 15 segundos; o servidor
considera uma conexão ausente após 40 segundos sem heartbeat e agrega várias
abas/dispositivos do mesmo usuário.

O perfil saiu da home: acesse **⋯ → Configurações → Configuração de perfil**
para editar nome de exibição, bio de até 300 caracteres, avatar e banner.
Avatares aceitam JPG, PNG, WebP e GIF até 8 MB, ou vídeos MP4/WebM de até 12 MB
em loop e sem áudio. Banners aceitam imagens e GIF até 8 MB. Os arquivos ficam
em `/data/uploads` no mesmo volume persistente do SQLite no Railway.

Cada conta recebe no cadastro um identificador permanente de 10 caracteres em
base36 maiúscula (`0-9A-Z`). O espaço comporta mais de 3,6 quadrilhões de
combinações; colisões são verificadas no banco e geradas novamente. Esse ID é
interno: não aparece na UI, nas buscas ou nos JSONs públicos de perfil.

## Canais e pastas

A home contém somente marca, menu, busca, pastas e lista de conversas. O botão
`+` fica na barra inferior. O menu `⋯` dá acesso a novo grupo, novo canal e
Configurações.

Canais são conversas de broadcast: o dono publica e os membros leem. Cada canal
possui um convite permanente em `/join/<token>`, disponível como link e QR Code.
O dono pode adicionar pessoas ao criar o canal; qualquer usuário autenticado
pode entrar pelo convite. A permissão foi isolada no domínio para permitir
administradores e outras funções depois.

Cada usuário começa com três pastas protegidas e atualizadas automaticamente:
**Pessoal** para chats 1:1, **Grupos** e **Canais**. É possível criar, renomear,
editar e remover pastas personalizadas em **Configurações → Conversas**, até o
limite total de 10. Os chips acima da busca/lista filtram a pasta ativa.

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
COOKIE_SECURE=false npm start
```

Abra [http://localhost:3001](http://localhost:3001).

## Publicar no Railway

O projeto usa o arquivo `.railway/railway.ts` para declarar um serviço na região
US East, uma única réplica e um volume persistente montado em `/data`. O
`Dockerfile` gera os artefatos do frontend e da API em uma imagem única.

### Primeiro deploy

1. Crie uma conta em [railway.com](https://railway.com) usando GitHub e autorize
   o Railway a acessar o repositório `raracalma/Caosrael`.
2. Crie um projeto vazio chamado `caoschat`.
3. Em **Project Settings → Shared Variables**, é recomendado criar
   `SESSION_SECRET` com um valor aleatório longo, por exemplo o resultado de
   `openssl rand -hex 32`. Sem a variável, o app cria um segredo seguro no
   volume e continua iniciando.
4. Instale e autentique a CLI:

   ```bash
   npm install --global @railway/cli
   railway login
   railway link
   ```

5. No diretório do repositório, revise e aplique a infraestrutura:

   ```bash
   railway config plan
   railway config apply
   railway service caoschat
   railway domain
   ```

O último comando gera um domínio público `.railway.app` com HTTPS automático.
Não use mais de uma réplica enquanto o app utilizar SQLite, pois o volume é
anexado a uma única instância.

### Redeploy

Depois da vinculação com o GitHub, cada push em `main` gera um novo deploy. Para
repetir manualmente o último deploy:

```bash
railway redeploy --service caoschat
```

O banco, as contas demo e as sessões sobrevivem aos redeploys porque ficam no
volume `caoschat-data`. Para reiniciar os dados, remova
`/data/caoschat.sqlite` pelo navegador de arquivos do volume e faça redeploy.

### Conferência do serviço

Se o serviço foi criado diretamente pelo botão **Deploy from GitHub** sem
aplicar `.railway/railway.ts`, confira:

- **Source:** branch `main`;
- **Builder:** Dockerfile; deixe Build Command e Start Command vazios. Se
  precisar definir Start Command manualmente, use
  `node dist-server/index.js`;
- **Networking:** gere um domínio público; o Railway fornece HTTPS e suporta o
  WebSocket do Socket.IO no mesmo domínio;
- **Healthcheck Path:** `/api/health`;
- **Volume:** anexe um volume ao serviço com mount path `/data`;
- **Replicas:** mantenha `1` enquanto usar SQLite.

## Configuração

Variáveis opcionais:

| Variável | Padrão | Uso |
| --- | --- | --- |
| `PORT` | `3001` | fornecida automaticamente pelo Railway; não defina manualmente |
| `HOST` | `0.0.0.0` | interface de rede em que a API escuta |
| `SESSION_SECRET` | segredo aleatório salvo no diretório de dados | recomendado para assinatura estável da sessão |
| `DATA_DIR` | `./data` | diretório dos bancos SQLite |
| `COOKIE_SECURE` | `true` em produção | use `false` apenas em HTTP local |
| `DISABLE_DEMO_SEED` | `false` | desativa a criação das contas e conversas demo |

No Railway, use `DATA_DIR=/data`, `HOST=0.0.0.0` e, de preferência, um
`SESSION_SECRET` longo e aleatório. Não crie uma variável `PORT`: o Railway
injeta a porta correta em cada execução.

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
