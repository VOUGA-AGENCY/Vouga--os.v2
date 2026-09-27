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
