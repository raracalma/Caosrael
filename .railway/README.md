# Infraestrutura Railway

`railway.ts` declara o serviço único `caoschat` e o volume
`caoschat-data`. A configuração espera uma variável compartilhada
`SESSION_SECRET` já criada no projeto Railway.

```bash
railway config plan
railway config apply
railway service caoschat
railway domain
```

O serviço acompanha a branch `main` do repositório GitHub. O domínio gerado
pelo último comando recebe HTTPS automaticamente. Mantenha uma única réplica
enquanto o armazenamento for SQLite.
