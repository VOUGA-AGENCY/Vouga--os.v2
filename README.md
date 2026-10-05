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

- **Home:** My tasks (cinco, In progress → To do, incluindo sem prazo), Next event com contexto, Needs me (Review/PRs/Agent) e Follow-ups vencidos. Inbox apenas para capturas por organizar. Resumo manual abaixo; sem centro de notificações nem parede de notas. Em Settings → GitHub, associar o username uma vez para identificar PR reviews.
- **Tasks:** vários responsáveis, estado, prioridade, dimensão, prazo e contexto opcionais. Board por defeito, List, filtros, drag-and-drop, comentários, anexos e Activity. `ownerId` conserva o primeiro responsável para compatibilidade; `assigneeIds` é a lista efetiva usada nos filtros, Agent, resumo e Telegram.
- **Visibility:** `Team` segue as permissões do projeto e atribuição; `Private` é uma task pessoal só do utilizador; `Board` é visível exclusivamente a Miguel e Roque, atribuída a um deles ou aos dois, sem projeto. Board é uma visibilidade, distinta da vista Kanban.
- **Calendar:** Month por defeito e Week. Office/Contacto sincronizam com Google; calendários pessoais ficam no OS. Um evento pode ter vários destinos. Admin vê todos; engineer vê Contacto e o próprio pessoal. Participantes internos definem My Day e destinatários Telegram.
- **Projects:** acesso direto na sidebar, tasks Board/List e Activity unificada com GitHub; progresso calculado pelas tasks.
- **CRM:** empresas e timeline; etapas New → Contacted → Meeting → Proposal → Client → Dormant. Uma mudança de estado exige nota. Agendar evento associa calendário e histórico da empresa.
- **Agent/Voice:** `⌘K`/`Ctrl+K`, painel global, tools internas com validação de permissões. Web e Telegram partilham Agent e transcrição. Informação ambígua/destrutiva pede confirmação.
- **Notas:** acessíveis por pesquisa, contexto e Agent. Privadas ou partilhadas com pessoas escolhidas; só o autor edita.

## Gravação e desempenho

Editar uma task, projeto, empresa, evento, nota ou ligação PR existente grava automaticamente: texto ao sair do campo, seleções imediatamente com pequena agregação. Estado de gravação e erros ficam visíveis; Retry conserva o draft. Criar registos, apagar e confirmar mudanças CRM continuam a exigir ação explícita. Versões impedem sobrescrever uma edição concorrente.

A navegação principal reutiliza o workspace em memória. GET usa uma única leitura e ETag por utilizador/revisão; sem alterações responde 304. POST autentica dentro da transação e devolve uma projeção da gravação confirmada, sem releitura. Se o cliente tem a revisão correta recebe apenas deltas filtrados; caso contrário recebe snapshot completo. Atualização externa ocorre com a tab visível a cada 60 segundos e ao recuperar foco, com limitação de pedidos. A persistência ainda lê o Store completo por transação: otimizações futuras de consultas não estão implementadas.

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
