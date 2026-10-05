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

A Home reúne quatro atalhos operacionais sem novos campos obrigatórios:

- My tasks: cinco tasks atribuídas à pessoa, In progress antes de To do, com e sem prazo. Dentro de cada estado, prazo mais próximo primeiro. Abrir, começar e concluir usam as mesmas permissões, versões e Activity do resto do OS.
- Next event: próximo compromisso (incluindo o que decorre agora), com hora e calendário. Acesso ao evento, empresa/projeto e última nota de contexto. Eventos cancelados/terminados e cópias do mesmo evento não se repetem.
- Needs me: tasks em Review, PRs abertas com review pedida ao username GitHub associado ao perfil e confirmações pendentes do Agent. Username associa-se uma vez em Settings → GitHub; não concede acesso nem é inferido pelo nome.
- Follow-ups: empresas atribuídas à pessoa com followUpOn já existente e vencido/hoje. Não cria novos campos nem contactos automáticos.

Continue e a entrada de nota rápida foram retirados da Home. As notas existentes permanecem acessíveis no contexto, pesquisa e Agent.

Inbox mantém apenas captures por organizar; confirmações estão em Needs me e alertas continuam externos. O resumo manual fica abaixo dos atalhos. Listas longas de revisões/seguimentos expandem apenas quando necessário. O relógio local avança o próximo evento sem novas consultas ao backend.

## Fora do objetivo

ERP, financeiro, sprints, epics, milestones complexos, métricas decorativas e gestão duplicada de documentos. O companion reutiliza o backend web.
