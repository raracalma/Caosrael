# Infraestrutura Railway

`railway.ts` declara o serviço único `caoschat` e o volume
`caoschat-data`. É recomendado definir `SESSION_SECRET` como variável
compartilhada; quando ela não existe, o app gera um segredo persistente em
`/data/.session-secret` e ainda consegue iniciar.

```bash
railway config plan
railway config apply
railway service caoschat
railway domain
```

O serviço acompanha a branch `main` do repositório GitHub. O domínio gerado
pelo último comando recebe HTTPS automaticamente. Mantenha uma única réplica
enquanto o armazenamento for SQLite.
