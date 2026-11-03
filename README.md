# Vouga OS v2

Workspace interno da Vouga Agency, com Home, Tasks, Calendar, CRM e Projects. Next.js 16, React 19, TypeScript e CSS semântico, com temas dark/light. Produção: https://os.vouga-agency.pt.

## Desenvolvimento

Requer Bun 1.3.14. Instalar dependências com `bun install --frozen-lockfile`. Com `.env.local` já configurado, executar:

```sh
bun run dev -- --port 3001
```

Abrir http://127.0.0.1:3001. A porta padrão do script é 3100. Para uma demonstração isolada sem dados empresariais, usar `bun run setup` e armazenamento local; não executar setup por cima da configuração de produção existente.

## Equipa e acesso

Miguel e Roque são admins. Ana, Pedro e Vasco são engineers. Roque conserva o ID histórico `afonso`. Perfis arquivados não aparecem nos seletores e não podem iniciar sessão. A remoção de um membro preserva o identificador histórico e reatribui trabalho, sem apagar clientes, projetos ou tasks.

O servidor valida sessões e permissões. O login atual aceita email/password através do Supabase Auth e mantém o caminho interno de utilizador/password; estes dois caminhos ainda precisam de consolidação. Não há passwords ou chaves de demonstração publicadas neste documento.

## Fluxos

- **Home:** criação rápida Today / This week / No date, com prazo automático e apenas título, descrição, responsáveis e visibilidade. Agenda de hoje e dos próximos sete dias com todas as tarefas visíveis ao perfil, com tarefas e reuniões separadas, listas abertas e próximos dias agrupados por data. Sem cards de dashboard.
- **Tasks:** vários responsáveis, estado, prioridade, dimensão, prazo e contexto opcionais. Board por defeito, List, filtros, drag-and-drop, comentários, anexos e Activity. `ownerId` conserva o primeiro responsável para compatibilidade; `assigneeIds` é a lista efetiva usada nos filtros, Agent, resumo e Telegram.
- **Visibility:** `Team` segue as permissões do projeto e atribuição; `Private` é uma task pessoal só do utilizador; `Board` é visível exclusivamente a Miguel e Roque, atribuída a um deles ou aos dois, sem projeto. Board é uma visibilidade, distinta da vista Kanban.
- **Calendar:** Month por defeito e Week. Office/Contacto sincronizam com Google; calendários pessoais ficam no OS. Um evento pode ter vários destinos. Admin vê todos; engineer vê Contacto e o próprio pessoal. Participantes internos definem My Day e destinatários Telegram.
- **Projects:** acesso direto na sidebar, tasks Board/List e Activity unificada com GitHub; progresso calculado pelas tasks.
- **CRM:** empresas e timeline; etapas New → Contacted → Meeting → Proposal → Client → Dormant. Uma mudança de estado exige nota. Agendar evento associa calendário e histórico da empresa.
- **Prospect:** entrada em Sales com fundo Beams e Sales Playbook dividido em Approach (cinco capítulos) e Knowledge Academy (oito módulos e anexos). Pesquisa por área e resoluções de exercícios recolhidas. Approach em `src/content/sales-playbook.ts`; Academy tem como fonte `docs/Vouga_Sales_Knowledge_Academy_Case_Library.md`, convertida por `bun run content:build` para JSON na build. Markdown com tabelas, sem HTML executável. Case Library removida por agora; Live Pitch ainda indisponível. Componentes reutilizáveis ficam em `src/components/ui` (alias `@/components/ui`), estilos em `src/app`. O fundo foi adaptado para CSS semântico e canvas: não requer shadcn, Tailwind ou Motion. Limite de 30 fps, pausa fora de vista e respeito por reduced motion.
- **Agent/Voice:** `⌘K`/`Ctrl+K`, painel global, tools internas com validação de permissões. Web e Telegram partilham Agent e transcrição. Informação ambígua/destrutiva pede confirmação.
- **Notas:** acessíveis por pesquisa, contexto e Agent. Privadas ou partilhadas com pessoas escolhidas; só o autor edita.

## Gravação e desempenho

Editar uma task, projeto, empresa, evento, nota ou ligação PR existente grava automaticamente: texto ao sair do campo, seleções imediatamente com pequena agregação. Estado de gravação e erros ficam visíveis; Retry conserva o draft. Criar registos, apagar e confirmar mudanças CRM continuam a exigir ação explícita. Versões impedem sobrescrever uma edição concorrente.

A navegação principal reutiliza o workspace em memória, sem animação de entrada nas mudanças internas. A animação fica reservada à entrada no documento. CRM, projetos e Settings são carregados quando utilizados. A projeção enviada ao browser conserva os eventos completos e a Activity de tasks/projetos/empresas; histórico de sincronização sem contexto visível continua disponível no servidor, Agent e exportação. Os filtros de Activity usam índices de permissões em vez de percorrer todas as reuniões por cada entrada. A validação de leituras Supabase não volta a serializar todas as linhas. GET usa uma única leitura e ETag por utilizador/revisão; sem alterações responde 304. POST autentica dentro da transação e devolve uma projeção da gravação confirmada, sem releitura. Se o cliente tem a revisão correta recebe apenas deltas filtrados; caso contrário recebe snapshot completo. Atualização externa ocorre com a tab visível a cada 60 segundos e ao recuperar foco, com limitação de pedidos. As transações continuam a ler o Store completo. O arranque e o GET do workspace podem usar a função adicional `vouga_next_read_browser`, instalada por `supabase/migrations/20261103_browser_workspace_read.sql`: devolve todos os eventos e a Activity usada pela interface, sem filas técnicas nem histórico de sync sem contexto. A cache desta leitura é separada e nunca serve de base a gravações. Sem esta função instalada, mantém-se a leitura completa como fallback. A revisão é sempre revalidada para respeitar alterações de acesso/sessão.

## Integrações e dados

Supabase guarda dados no schema isolado `vouga_next` do projeto existente, através de RPCs exclusivas do servidor. Não se alteram tabelas antigas. O adaptador JSON existe apenas para desenvolvimento local; nunca usar `.local` como BD em Vercel.

Google Calendar API, GitHub App/webhooks, Groq Agent/transcrição e Telegram têm serviços próprios. Activity guarda acontecimentos; não envia notificações por si. Telegram envia templates sem AI na criação de objetos para os destinatários relevantes, agenda diária às 08:00 e lembrete individual uma hora antes de reuniões, com deduplicação e revalidação de acesso. Exige scheduler e webhook públicos configurados.

Secrets só no backend. `.env.local`, `.local`, exportações empresariais e backups não entram no Git. Ver [Integrações](docs/INTEGRATIONS.md), [Arquitetura](docs/ARCHITECTURE.md) e [Acesso](docs/TEAM-ACCESS.md).

## Verificar

```sh
bun run check
bun run build
```

Os testes externos usam providers simulados; passar testes não prova saúde das ligações em produção. O companion macOS em `desktop/macos` reutiliza `/painel` e o mesmo backend.
