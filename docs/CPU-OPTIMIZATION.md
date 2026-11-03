# Otimização de CPU · 3 novembro 2026

## Estado e limites

Implementado e testado localmente. Sem commit, push, deploy, alterações ao cron ou execução de SQL em produção. Nenhum registo existente foi apagado. UI e estilos preservados.

A migração `supabase/migrations/20261103_scoped_workspace_read.sql` é aditiva e só cria uma função de leitura para `service_role`. Não altera tabelas, eventos, credenciais, funções de commit ou agendamentos. A função devolve coleções completas selecionadas e arrays vazios nas restantes. Isso preserva posições, revisão global e o contrato de commit existente. Nunca usar este modelo reduzido como snapshot do browser.

## Dependências e alterações

- `services/features.ts`: `telegramEnabled`, opt-in estrito `TELEGRAM_ENABLED=true`.
- Telegram: guardas antes de leituras em reminders, sendOnce, criação e mensagens recebidas. O webhook reconhece pedidos sem os processar durante a suspensão. Creation outbox e enqueue não criam jobs Telegram quando desativado. Configuração manual/link e UI mantidos; mensagens automáticas e processamento do bot suspensos.
- Worker: coleções `integrationJobs` para reservar/concluir/falhar jobs; `externalConnections` + `integrationJobs` para manutenção diária; `externalConnections` para renovação dos canais. Dispatch de `calendar.pull/push`, Google OAuth, endpoints, payloads, ordem e periodicidade inalterados. O serviço Google não foi editado.
- Trabalhos Telegram pendentes ou com lease expirado são preservados com estado `failed` e motivo explícito de suspensão. Não são reenviados na reativação. Um lease ainda ativo é respeitado; só após expirar é retirado da fila. Não há repetição automática de mensagens históricas.
- Repositório: scopes separados, cache por scope e verificação de revisão. Commit continua a usar a função existente, revisão esperada, validações e repetição de conflitos. Uma transação scoped não pode modificar coleções não declaradas. As caches reduzidas nunca substituem a cache completa.
- Sem a migração, existe fallback para leitura completa apenas se a função não existir. Falhas de autorização/rede não são ocultadas. Portanto, funciona com a BD atual, mas a principal melhoria exige instalar a função.
- Delta: uma serialização por versão de cada registo, sem criar cópias JSON de todos os registos; JSON parse apenas para registos realmente alterados. Preserva identificadores, posições, remoções e propriedades omitidas.
- Activity: Maps/Sets substituem pesquisas quadráticas. Comandos conhecidos `task.*` não percorrem reuniões/empresas. Captures e comandos multi-entidade mantêm deteção completa, agora linear. Before-images copiam cabeçalhos de entidades em vez de todo o histórico/credenciais/workspace.
- Workspace: valida sessão, utilizador e revisão com members/accounts/sessions antes do `304`. Continua a verificar conta desativada, expiração, mudança obrigatória de password e identidade. Resposta alterada mantém o snapshot autorizado atual. Auth calcula o hash da sessão uma vez.
- Cliente: exclusão de GET simultâneos, com libertação em finally; autosave, atualização pós-gravação, refresh ao foco e suspensão em background mantidos.

## O que não foi alterado deliberadamente

- Frequência do cron: um minuto.
- Lógica Google, janela de sincronização, recorrências, webhooks, tokens e renovação. Sem agrupamento de sincronizações nem caching de access tokens nesta fase.
- Revisão global conservada. Separar revisões visíveis exigiria alterar o contrato de patches/concorrência do autosave; não foi necessário para tornar o 304 barato e foi adiado por segurança.
- Browser continua a poder consultar todos os eventos e o histórico atualmente disponível. Não foi introduzido um corte temporal que ocultasse datas distantes, nem paginação que alterasse pesquisa/Agent. Eventos deixam de ser lidos no cron vazio, na autenticação do ETag e de ser analisados por Activity ao editar tasks.
- Processamento real de um job Google ainda pode usar o workspace completo. Esta fase elimina sobretudo o custo permanente sem trabalho; uma alteração transacional mais profunda dos jobs requer avaliação separada.
- A fila é lida como coleção completa (629 linhas na auditoria), não apenas a primeira linha elegível. Preserva exatamente ordenação, posições e lease global; separação do histórico da fila é uma otimização futura.

## Medição offline antes/depois

Bun no mesmo computador, fixture sintética de 16,13 MB: 6.747 eventos, 16.101 activities e 629 jobs concluídos. Medianas de sete execuções, após aquecimento. Código anterior extraído de HEAD para uma pasta temporária; ambos os crons comparados com Telegram desativado, isolando o ganho estrutural. Pedidos HTTP simulados; nenhuma ligação a Supabase/Google/Telegram. A simulação de RPC não mede custo do PostgreSQL, TLS ou rede.

| Operação | CPU antes | CPU depois | Variação |
| --- | ---: | ---: | ---: |
| Cron vazio | 377,829 ms | 4,478 ms | -98,8% |
| Activity, nenhuma alteração | 75,305 ms | 1,072 ms | -98,6% |
| Fase de leitura do GET sem alterações | 9,985 ms | 0,036 ms | -99,6% |

Duração local mediana: cron 384,04 → 3,43 ms; Activity 74,35 → 0,63 ms; leitura GET 10,24 → 0,04 ms. São medições dos percursos indicados, não do request HTTP completo nem de produção.

No cron quente: quatro consultas de revisão antes/depois, quatro bytes de payload simulado no total; não há aumento de downloads periódicos. No primeiro acesso ou revisão alterada, são transferidas as coleções específicas. GET quente: uma consulta de revisão. Cache por processo, nunca assumida como distribuída.

O delta de heap observado sofre interferência do GC: não permite concluir uma redução percentual fiável de memória. A menor quantidade de objetos clonados está confirmada pelo percurso; RSS/pico de memória devem ser medidos separadamente na Vercel. O script imprime heapDeltaMB para diagnóstico, não como garantia.

Estas percentagens NÃO são uma promessa de redução igual na faturação. Trabalho Google real, cold starts, concorrência e distribuição de pedidos continuam a contar.

Reprodução: `bun --conditions=react-server scripts/benchmark-cpu.ts /caminho/absoluto/baseline`. A pasta baseline contém repository.ts, collections.ts, worker.ts e activity.ts anteriores; ajustar os imports de client/runtime/services para o projeto e configurar o alias @ para src. Script recusa escritas e chamadas a providers. Não lê .env nem dados reais.

## Validação

Validação concluída: `bun run typecheck`, `bun run lint`, `bun run test` (260 testes, 36 ficheiros) e `bun run build`, todos sem erros. `git diff --check` passou. Testes novos cobrem:

- Cron vazio sem leitura completa, escrita ou provider.
- Concorrência/CAS entre scopes, reserva única, leases ativos/expirados e retry após falha.
- Escopo não pode alterar outra coleção; fallback SQL ausente; falhas de autorização sem fallback; cache sem contaminação.
- Telegram off sem DB/provider/outbox, webhook reconhecido sem execução, retenção sem replay de pendentes, opt-in explícito.
- Google: equivalência de pedidos e estado na renovação full/scoped; create/update/delete nos dois calendários através do worker; assinatura de canal e idempotência do webhook. Suite existente cobre OAuth, paginação, janela de recorrências, cancelamentos, conflito 412 e permissões.
- ETag autorizado sem leitura completa, revogação de conta, autosave e patches, Activity e comandos existentes.

Os providers e RPCs são simulados. Não foi executada a migração em PostgreSQL nem realizado teste end-to-end em contas Google reais. Isso evita alterar produção e é uma limitação explícita. Antes do deploy, aplicar SQL num ambiente autorizado e verificar o smoke test descrito abaixo.

## Ativação em produção (não executada)

1. Rever o diff. Guardar o identificador do deployment anterior para rollback.
2. Com autorização, executar `20261103_scoped_workspace_read.sql` no SQL Editor do Supabase. Só concede execução à service_role. Nunca mudar o cron existente.
3. Confirmar que `TELEGRAM_ENABLED` está ausente ou `false` no ambiente alvo. O código assume false por defeito. Não alterar segredos Google.
4. Fazer commit/push/deploy apenas após autorização.
5. Testar sessão, edição de task com autosave, Google → OS e OS → Google (criar/editar/cancelar um evento de teste autorizado), e verificar jobs pendentes/erros.
6. Confirmar na Observability que cron vazio continua a cada minuto, mas baixa CPU/request. Comparar 24h equivalentes, separando GET/POST e jobs Google reais. Observar também egress Supabase, 304/200, erros, filas e memória.
7. Rollback: voltar ao deployment anterior. A função aditiva pode permanecer. Atenção: código antigo não respeita a nova flag Telegram e pode voltar a enviar mensagens; rollback exige essa avaliação operacional.

## Reativação Telegram

Depois da suspensão estar aplicada e os jobs antigos retirados da fila (aguardar leases antigos), definir `TELEGRAM_ENABLED=true` no servidor e publicar essa configuração. Mantêm-se bot, tokens, associações e UI. Entradas e notificações novas voltam a funcionar. Não reabrir os jobs marcados como suspensos; os payloads ficam preservados para consulta, sem replay automático. As mensagens enviadas ao bot durante a suspensão foram reconhecidas e não serão processadas retroativamente. Os resumos/lembretes futuros retomam as regras existentes.

## Ficheiros alterados

Configuração/documentação: `.env.example`, `docs/CPU-OPTIMIZATION.md`, `supabase/migrations/20261103_scoped_workspace_read.sql`.

Infraestrutura: `src/persistence/store.ts`, `src/persistence/supabase/repository.ts`, `src/persistence/supabase/collections.ts`.

Serviços: `src/services/features.ts`, `src/services/integration-worker.ts`, `src/services/activity-service.ts`, `src/services/creation-notifications.ts`, `src/services/telegram-service.ts`.

Aplicação: `src/application/auth.ts`, `src/application/commands.ts`, `src/app/api/workspace/route.ts`, `src/app/api/webhooks/telegram/route.ts`, `src/components/workspace.tsx` (apenas controlo de pedidos, sem markup/CSS).

Validação: `scripts/benchmark-cpu.ts`, `tests/cpu-optimization.test.ts`, `tests/supabase-repository.test.ts`, `tests/workspace-api.test.ts`; fixtures Telegram explicitamente reativadas nos testes existentes `tests/integrations.test.ts`, `tests/creation-notifications.test.ts`, `tests/daily-summary.test.ts`.

Não há diff em `calendar-service.ts`, webhook Google ou endpoints OAuth Google.
