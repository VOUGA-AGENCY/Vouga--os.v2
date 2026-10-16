# Verificação da entrega local

24 de setembro de 2026.

## Verificações automáticas

- TypeScript: passou.
- ESLint: passou.
- Vitest: **32 testes**, nos três ficheiros `auth`, `workspace` e `persistence`, passaram.
- Build Next.js de produção: passou.
- Companion macOS: compilação Swift/AppKit/WebKit e assinatura local ad hoc passaram.

Os testes cobrem autorização por objeto, função forjada, notas privadas, versão desatualizada, referências inválidas, tarefas simples, CRM, reunião delegada, captura idempotente, fallback para nota, datas em Lisboa, mudança de horário, lembretes pessoais, adiamento, exportação ICS, reinicialização da persistência, escritores concorrentes, rollback de uma captura parcial e proteção contra sobrescrita de ficheiro corrompido.

## Verificação HTTP contra o servidor real

Confirmados: recusa sem sessão; login dos dois perfis; reunião criada pelo engineer visível no calendário do Afonso; projeção do engineer restrita ao seu projeto; exportação admin recusada ao engineer; escrita indevida recusada mesmo com função forjada; CSRF recusado; exportação ICS; redirecionamento do engineer fora de `/painel`; invalidação da sessão no logout.

## Verificação no browser

- Login de Miguel e do engineer.
- Hoje com a visão da empresa e com o trabalho pessoal.
- Captura de duas linhas, revisão e gravação de tarefa + nota.
- Reconhecimento de “amanhã às 14h30 para o Afonso” e criação pelo engineer.
- Navegação na agenda e apresentação de semana/dia.
- Mini CRM: consulta do histórico e gravação de uma interação com novo próximo passo.
- Composições desktop e mobile; a leitura do DOM na vista estreita não apresentou overflow horizontal.
- Foco de teclado inicial corrigido para entrar no primeiro campo do diálogo e voltar ao controlo de origem ao fechar.

Os registos usados nestas verificações ficaram apenas na pasta temporária de desenvolvimento; a pasta final é iniciada com os dados sintéticos de origem.

## Limite da validação nativa

A ferramenta de controlo de UI excedeu o tempo ao tentar abrir a app da barra de menus. O binário foi compilado e assinado, mas o popover nativo **não foi validado visualmente** nesta sessão. A rota web que utiliza partilha os mesmos dados e permissões. Não se deve confundir compilação com teste visual do companion.

## Ambiente anterior

O estado Git da pasta `Vouga--os` foi confirmado limpo. Não foram criados commits, remotes ou pushes. Nenhum ambiente Supabase, Google, GitHub ou Vercel foi alterado.

## Supabase activation · 2026-09-27

- TypeScript, lint and all 72 tests passed; production build passed.
- Exact migration SQL exercised on PostgreSQL (PGlite): repeated installation, denied anon/authenticated access, optimistic conflict, stable mutation replay, rejected mismatched replay, transaction rollback, 1201-row aggregate read, legacy sentinel preservation and private bucket.
- Actual workspace also roundtripped through that SQL with deep equality before remote migration.
- Existing Supabase project: schema installed; 213 records migrated and deeply compared, including 55 companies, 8 contacts, 105 interactions and 4 tasks. Private local backup preserved. VOUGA_STORAGE=supabase activated.
- Real RPC checks: server key HTTP 200, public key HTTP 401. Real Storage upload/download succeeded and public download was denied; synthetic object removed.
- Web and worker restarted against Supabase. Existing browser session survived; CRM showed 55 companies.
- GitHub App installation token/list repositories succeeded (1 accessible repository). No repository content changed.
- Groq model availability verified; real Agent call created a task and Activity in isolated synthetic memory. No business data sent for that test. Voice model available; real microphone transcription not yet tested.
- Telegram getMe succeeded for @vouga_bot. No test messages sent; public webhook not configured here.
- Google OAuth credentials configured, but Office/Contacto user authorization still required. Public hosting, HTTPS authentication and continuous scheduler remain pending.

## Public scheduler verified · 2026-09-27 16:23 Europe/Lisbon

Local integration worker PID 48857 stopped and confirmed absent. Enqueued an Office calendar.pull at 15:22:15 UTC; no manual invocation of the cron endpoint during the test. The public scheduler completed it in one attempt, with Office lastSyncAt 15:23:04 UTC and connected status. The local worker remains stopped. This verifies cloud queue processing independently of the Mac; it does not by itself constitute an end-to-end test of timed Telegram reminder delivery.

## Calendar/privacy update · 2026-09-27

- 93 tests pass: server permissions for private tasks/comments/files/activity, Office isolation, personal calendars, multi-calendar create/update/delete, scoped edits without indirect Google writes to hidden calendars, all-day/recurring occurrence edits, calendar import without Inbox noise, deduplicated reminders, GitHub commit backfill and idempotent cleanup.
- Browser (isolated synthetic workspace): month default, multi-calendar creation appears once, six alphabetized participants, Home summary, immediate navigation and project selection clears CRM highlight.
- Existing production Supabase: resolved 117 generated participant-assignment Inbox items; archived only the demo Engineer account, revoked its sessions, preserved authorship and reassigned three active records to Miguel. Normalized one current CRM stage. Backup stored privately before cleanup. No Google events changed by cleanup.
- Real GitHub read/backfill: two existing commits imported into Vouga OS project Activity. App read permissions correct and webhook URL correct, but subscribed events were empty: owner action required in GitHub App settings. No commits/pushes performed by this update.
- Telegram getWebhookInfo confirmed expected public endpoint, zero pending updates. Miguel linked; remaining five users must link their own accounts. Cloud cron was independently verified earlier (above); no unsolicited test Telegram messages sent.
- Real Groq voice + Agent test: 4.3-second synthetic Portuguese WAV transcribed correctly; shared Agent created exactly one private task in an isolated in-memory store. No real task/event created by this test. Earlier HTTP 400 was an empty synthetic audio file generated inside the sandbox, not a production transcription failure.
- Agent datetime parser now accepts validated ISO instants with timezone as well as Lisbon wall-clock values. Temporary Groq 429 limits still apply; summary uses the same service's permission-filtered data directly and does not consume LLM requests.
- Code changes require release to Vercel before the public UI/permissions reflect this update. Existing schema supports optional JSON fields; no SQL migration required.

## 27 September — creation notices and minimal login

- Creation notifications are committed with domain commands into the existing integration outbox, and delivered using Telegram templates without any LLM call. Covers task owners, event participants, project members, note authors/explicit recipients, company owners and reminder owners. Self-created work is included.
- Revalidates visibility/membership/active accounts at delivery. Grouped calendar copies and repeated jobs do not duplicate messages. Edits and existing imports do not backfill creation notices. Ambiguous sends retain the existing no-automatic-resend policy.
- 105 tests passed, including 11 new notification checks with mocked Telegram only. Typecheck and lint passed. No live Telegram messages were sent for testing.
- Browser: email sign-in worked against an isolated local fixture; login contains only white Vouga logo, email, password and submit. Login keeps dark contrast even when the workspace preference is light.
- Requires deployment of the updated public worker/backend before cloud creation notices run. Existing queue/store structures suffice; no SQL migration or new scheduler needed.

## Current local update · 2026-10-04

- Multiple task assignees work across form serialization, Agent queries, personal summaries and Telegram creation notices. Board visibility is restricted server-side to Miguel/Roque, including comments/files/Activity; engineers and other admin IDs are excluded.
- Existing-record autosave queues/coalesces writes, retains failed drafts and optimistic versions, and flushes before navigation/closing. Creating and deleting remain explicit. Comments/attachments have their own entities and do not invalidate task field versions.
- Workspace GET authenticates from one read and supports per-user ETags. POST authenticates within the write transaction and returns filtered changes when revisions match, with a full snapshot fallback. No extra post-commit database read. Main navigation reuses client state.
- UI browser validation could not run: computer-use inventory has no available browsers/apps in this session. HTTP and automated checks are distinct from visual validation. No production deployment or Git push is performed by this update.

- Final validation: TypeScript, ESLint and 127 tests passed. Production build passed. Login responds HTTP 200 on 127.0.0.1:3001.
- Applied member removal in existing vouga_next: five active profiles, no Patrick OS account or session, seven reassigned records. Protected backup created before mutation; repeat preview reports zero additional reassignment. Legacy Supabase Auth/tables remain unchanged.
- Read-only payload experiment: full Miguel snapshot 377,931 bytes; one synthetic task title/version patch 562 bytes (not a saved command, so no new Activity row). This measures transfer size, not live latency.

## Home operacional · 2026-10-05

- Implementadas as seis áreas autorizadas: cinco tasks doing/todo (mesmo sem prazo), próximo evento com contexto, Review/PRs/confirmações do Agent, seguimentos existentes vencidos, três itens recentes e nota rápida privada. Inbox continua só para capturas por organizar; resumo abaixo das áreas.
- O histórico recente guarda IDs/tipos por utilizador/browser, resolve apenas dados ainda autorizados e sincroniza tabs. Eventos terminados/cancelados e confirmações expiradas saem da Home pelo relógio local, sem novas leituras do backend.
- PR reviews usam o username associado uma vez em Settings → GitHub; nenhuma identidade é inferida pela conta da organização. Campo opcional guardado nos registos JSON existentes, sem SQL novo.
- TypeScript, ESLint e 135 testes (20 ficheiros) passaram. Casos novos verificam múltiplos responsáveis, ordem/limite, eventos agrupados e tempo, identidade GitHub, datas Lisbon, Activity em start/complete, privacidade/findNotes e histórico inacessível/eliminado.
- Build de produção passou. Servidor local responde HTTP 200 em 127.0.0.1:3001/login. Validação visual indisponível: inventário computer-use sem apps/browsers e native pipe indisponível. Nenhuma publicação, commit/push ou mensagem Telegram de teste.


## Simplificação da Home · 2026-10-05

- Retirados Continue e a entrada de nota rápida por pedido do utilizador, incluindo tracking local e estilos exclusivos. My tasks, Next event, Needs me, Follow-ups, Inbox e resumo permanecem. Notas já guardadas não foram eliminadas.

## Telegram daily greeting · 2026-10-16

- Restored 08:00 Europe/Lisbon daily templates: only that person's meetings today and unfinished assigned tasks due today, respecting task/calendar visibility. Empty days still send; routes/PRs/overdue tasks are excluded. All 50 busy-day and 19 empty-day phrases supplied by the user are present; selection is stable per member/day. No AI or transcription calls.
- Recovery window runs until 09:00 exclusive. Existing daily receipt keys prevent duplicates, including the earlier implementation's receipts. Hour-before and creation notices remain. Long digests split without truncating entries. One recipient's failure no longer blocks other recipients; uncertain sends retain the no-automatic-resend policy.
- Read-only live check: Telegram getWebhookInfo returned HTTP 200/ok, expected production webhook, zero pending incoming updates. All five active members are linked. Stored daily receipts for Miguel/Roque/Vasco on 2026-10-15 around 08:00 Lisbon are sent; zero non-sent daily receipts were found. This confirms API acceptance, not human reading. Prior code suppressed empty days and did not include due tasks. No live Telegram message was sent for this diagnostic.
- Current cron execution cannot be established from application receipts alone. The app's server key does not grant cron/net operational SQL access; a read-only audit is available in supabase/operations/check-integration-cron.sql. No scheduler, Vault secret or production deployment was changed.
- TypeScript, lint and 225 tests passed (32 files), including privacy, DST/date selection, empty days, random phrase pools, multipart completeness, per-recipient failures and deduplication.

## Home agenda rebuild · 2026-10-16

- Replaced dashboard sections with an open personal agenda: Today and tomorrow through today + 7, separate task/meeting columns and a seven-date filter. Removed Home Inbox, reviews, CRM follow-ups and summary controls without deleting their data or global tools.
- Inline quick task presets Today/This week/No date set dueOn automatically in Lisbon. Week defaults to Friday, or Sunday on weekends. Only title, optional description, assignees and visibility are requested; errors keep drafts, Private defaults to self, Board remains Miguel/Roque only.
- TypeScript, ESLint, 225 tests and production build passed. Home tests cover presets, midnight/DST, exact horizon, shared assignments, privacy, multi-day exclusive event ends and creation/completion commands.
- Visual validation completed in Chrome using cua_repl. Inspected the actual local Home at 127.0.0.1:3001. Interaction checks used a separate local file-backed instance at localhost:3002, with all external integrations disabled and synthetic records only. Created a private today task, confirmed it appeared and could be completed; created an undated task and verified dueOn=null and absence from agenda. Day filtering reduced both lists correctly. Test tab was closed afterwards; main tab/draft preserved. No real Supabase records or Telegram messages were created during QA.


### Home — simplificação da hierarquia (16 outubro 2026)

Substituída a grelha de quatro listas e faixa semanal por duas colunas: Hoje (tasks e meetings separadas) e próximos sete dias por data, omitindo dias vazios. A criação rápida fica agrupada junto ao cabeçalho, com largura de leitura limitada, sem contadores vazios. Validação visual em Chrome no estado real vazio/parcial e com composer aberto; datas e permissões continuam a usar o domínio existente. TypeScript, ESLint e 225 testes passaram.


### Home autorizada e apresentação de Tasks (16 outubro 2026)

Home passou a incluir todas as tasks do Snapshot autorizado no intervalo, independentemente do assignee. Teste cobre tarefas de projeto atribuídas a outros, Private, Board e um admin que não é Miguel/Roque. Reuniões mostram fotos dos participantes; recuperadas as camadas originais do fundo raiado. A apresentação de Tasks foi limitada à página Tasks, mantendo filtros, drag-and-drop, comandos e editores. Validado em Chrome com dados existentes, sem criar/alterar registos: board com descrição/prioridade/fotos e Home com avatares de reuniões. TypeScript, ESLint, 226 testes e build passaram.


### Calendários na Home e quatro estados (16 outubro 2026)

Removido o filtro por participante da Home: usa apenas a autorização de calendário do Snapshot. Conferência read-only na base e no Chrome confirmou os oito eventos próximos indicados pelo utilizador, com A Metalúrgica deduplicada entre Office/Contacto. Testes cobrem admin com calendários pessoais de terceiros, Office sem participantes e engineer sem acesso a Office/pessoais alheios.

Migradas 8 tasks Backlog → To Do no Supabase ligado, preservando IDs, conteúdo, responsáveis, comentários e relações; 28 tasks antes e depois. Backup privado em .local/backups/before-backlog-to-do-1792158817923.json. Migração idempotente via scripts/migrate-task-backlog.ts, Activity por alteração, sem envios Telegram. UI e Agent apresentam apenas To Do / In Progress / In Review / Done; clientes antigos são normalizados no backend. Botão + no topo de cada coluna passa o estado inicial ao editor. Quatro colunas e botões confirmados no Chrome. Typecheck, lint, 227 testes e build passaram.


### Composição mobile e CRM neutro (16 outubro 2026)

Validação em Chrome com emulação iPhone 16 (393 × 852): Board sem scroll horizontal, mudança To Do → In Progress e abertura de nova task com In Progress predefinido (fechada sem guardar). Calendar Month seleciona 19 outubro e mostra as três reuniões; mudar para Week conserva o dia e apresenta os mesmos eventos, incluindo pessoal Pedro e Office. Home compactada sem remover títulos, horários, participantes ou agrupamentos; cartões CRM sólidos e neutros confirmados. Nenhum registo foi criado/alterado durante a validação. TypeScript, ESLint, 227 testes e build passaram.
