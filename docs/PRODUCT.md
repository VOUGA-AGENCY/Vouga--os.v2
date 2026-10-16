# Produto atual

Capturar rápido, organizar automaticamente, mostrar apenas o que importa. Um workspace compacto com dois papéis e cinco fluxos principais: Home, Tasks, Calendar, CRM e Projects. Dark/light partilham a mesma estrutura.

## Trabalho

Tasks podem ter vários responsáveis. Team segue contexto e permissões; Private só para a pessoa; Board exclusivo de Miguel/Roque, com atribuição a um ou aos dois. Os comentários, anexos e histórico pertencem à mesma task, nas vistas Board e List.

Campos existentes gravam automaticamente com feedback e recuperação de erros. Criar, eliminar e confirmar notas de mudança comercial são atos explícitos. Novas funcionalidades não devem introduzir uma segunda fonte de verdade.

## Relações e calendário

CRM deliberadamente mínimo: empresas, estados ordenados e timeline. Calendar Month/Week, Office e Contacto Google, calendários pessoais apenas internos. Engineers acedem a Contacto e ao seu pessoal; admins a todos. Event é a entidade única na interface.

## Agent e comunicação

Agent consulta dados filtrados e executa tools validadas. Voz e texto, web e Telegram usam os mesmos serviços. Activity regista o que aconteceu. Telegram entrega avisos externos; Inbox só guarda intervenções pendentes. Ver README e INTEGRATIONS para configuração e limitações.

## Home

A Home é uma agenda aberta, sem cards de dashboard. Mostra apenas Hoje e os próximos sete dias (amanhã até hoje + 7), sempre com tarefas e reuniões separadas. Todas as tarefas que o perfil pode ver entram no intervalo, mesmo atribuídas a outras pessoas; Private mantém acesso pessoal e Board fica restrito a Miguel/Roque. Fotos circulares identificam responsáveis de tasks e participantes de reuniões. Tarefas concluídas, sem data, atrasadas ou além desse intervalo não entram nesta agenda. Reuniões incluem todos os calendários acessíveis ao perfil (admin: Office, Contacto e pessoais; engineer: Contacto e pessoal próprio), mesmo sem associação como participante. Reuniões de hoje continuam visíveis depois de terminarem; cancelamentos são excluídos e cópias de um evento agrupado não se repetem. Hoje ocupa a coluna principal, com tarefas e reuniões em listas distintas. Os próximos sete dias aparecem numa coluna secundária, agrupados por data e apenas nos dias com conteúdo. Sem faixa de calendário nem contadores a zero.

No topo, Today / This week / No date abrem um composer inline com apenas título, descrição opcional, responsáveis e visibilidade. Today usa a data de Lisboa; This week usa a sexta-feira e, no sábado/domingo, o domingo dessa semana; No date guarda dueOn null. O prazo automático é mostrado antes de criar. Por defeito é privado e atribuído à própria pessoa; Team/Board e múltiplos responsáveis respeitam as permissões existentes. Criar é explícito; erros conservam o rascunho.

Abrir uma tarefa/reunião mantém o contexto no painel lateral. Concluir uma tarefa na Home usa o mesmo command, optimistic version e Activity que Tasks. Não há Inbox, CRM, PRs, resumos, notas ou Continue na Home; o Agent e a pesquisa continuam acessíveis globalmente. As notas e capturas existentes não são eliminadas por esta alteração visual. O relógio local atualiza a agenda sem novas leituras ao backend.

## Fora do objetivo

ERP, financeiro, sprints, epics, milestones complexos, métricas decorativas e gestão duplicada de documentos. O companion reutiliza o backend web.


Tasks usa quatro estados: To Do, In Progress, In Review e Done. O botão + abaixo do título de cada coluna abre a criação nesse estado. Backlog foi migrado para To Do com IDs, conteúdo e relações preservados. O script scripts/migrate-task-backlog.ts permite pré-visualizar ou aplicar (--apply) com backup local e registo em Activity.


## Telemóvel

Abaixo de 48rem, Tasks e Projects apresentam o Board por separadores To Do / In Progress / In Review / Done, com contagens e uma coluna completa de cada vez. O + cria no estado selecionado; filtros, List, editores, autosave e permissões usam os mesmos componentes e comandos. O desktop conserva as quatro colunas.

Calendar Month é um seletor compacto de datas com agenda legível por baixo. Week apresenta os sete dias numa faixa e os eventos do dia escolhido em linhas com horários, calendário e participantes; mudar de vista conserva esse dia. Filtros de calendário e edição mantêm as regras existentes. Os prazos de tasks aparecem separados dos eventos. A grelha temporal do desktop permanece.

A Home móvel mantém toda a informação e ações, com cabeçalhos/data na mesma linha, espaçamentos reduzidos, títulos que podem quebrar linha, fotos pequenas e estados de task visíveis. Navegação inferior inclui Projects; Agent, Settings e pesquisa estão no cabeçalho. Os cartões do CRM usam fundos neutros sólidos em desktop e telemóvel, tanto em dark como light.

Na Home mobile, Today tem superfície sólida e hierarquia principal; Next 7 days é uma secção secundária, agrupada em superfícies discretas com uma faixa de data por dia. O fundo decorativo mantém-se fora das listas; conteúdo, ações e layout desktop não mudam.
