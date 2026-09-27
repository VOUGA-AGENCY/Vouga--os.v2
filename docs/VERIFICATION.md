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
