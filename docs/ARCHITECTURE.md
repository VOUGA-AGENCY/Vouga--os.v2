# Arquitetura da nova base

## Decisão central

Uma aplicação pequena, com uma fonte de verdade por objeto e duas leituras adequadas à pessoa. O admin vê prioridades da empresa e acompanha execução; o engineer vê execução relevante para si e mantém autonomia no CRM. Não há módulos de finanças, Governance, Context Engine, Sprints, Roadmap, Decisions, Vault, gestão de uploads ou Google Docs.

Mantêm-se Next.js, React, TypeScript e Lucide nas versões instaladas e verificadas no projeto de origem. A identidade mantém o fundo quente, contraste discreto, tipografia semibold no máximo, laranja reservado a ação, estados em pequenos pontos e navegação móvel.

## Fluxo de escrita

1. O browser envia um comando conhecido para `/api/workspace`.
2. A fronteira HTTP limita o body real a 64 KiB e valida origem, host local e sessão.
3. A identidade e a função são obtidas no servidor. O comando ignora qualquer função enviada pelo cliente.
4. `executeCommand` valida campos, referências, permissões e versão do objeto.
5. O repositório faz a transação completa e substitui atomicamente o ficheiro.
6. A resposta contém uma projeção filtrada para essa pessoa, sem contas, hashes ou sessões.

Operações de captura múltipla são atómicas: todos os registos ou nenhum. A chave de idempotência por pessoa impede duplicação numa repetição do mesmo pedido. Edições normais têm `version`; um formulário aberto não adota silenciosamente uma versão mais recente durante o polling.

## Objetos

| Objeto          | Responsabilidade                                                           |
| --------------- | -------------------------------------------------------------------------- |
| Member          | Identidade e função admin/engineer                                         |
| Task            | Ação, responsável, estado, data e contexto                                 |
| Meeting         | Reunião ou evento, horário, titular do calendário, participantes e criador |
| Organization    | CRM compacto: organização, contacto principal, etapa e próximo passo       |
| Interaction     | Histórico ligado à organização                                             |
| Project         | Entrega, equipa, objetivo, estado, prazo e próxima ação                    |
| ProjectUpdate   | Contexto escrito da evolução de um projeto                                 |
| Note            | Texto pessoal/partilhado, projeto opcional, destaque e arquivo             |
| PullRequest     | Link validado para GitHub e estado atualizado manualmente                  |
| Reminder        | Lembrete explícito pessoal                                                 |
| ReminderReceipt | Estado pessoal de lembrete dispensado/adiado                               |

O CRM desta base guarda um contacto principal por organização. Vários contactos por organização podem ser acrescentados se o uso real justificar essa complexidade.

## Permissões

| Capacidade                        | Admin                              | Engineer                                     |
| --------------------------------- | ---------------------------------- | -------------------------------------------- |
| Hoje                              | Tarefas/projetos/agenda da empresa | Tarefas próprias e projetos em que participa |
| Projetos                          | Todos                              | Responsável ou membro da equipa              |
| Tarefas                           | Todas                              | Próprias ou de um projeto acessível          |
| CRM                               | Partilhado                         | Partilhado, com filtro pessoal               |
| Reuniões visíveis                 | Todas                              | Titular, participante ou criador             |
| Criar reunião para admin          | Sim                                | Sim, com criador preservado                  |
| Editar/cancelar reunião           | Todas                              | Titular ou criador                           |
| Notas partilhadas                 | Gerais e de projetos acessíveis    | Gerais e de projetos acessíveis              |
| Notas privadas                    | Só as próprias                     | Só as próprias                               |
| Lembretes                         | Pessoais                           | Pessoais                                     |
| Painel compacto                   | Sim                                | Não; redireciona para Hoje                   |
| Exportação JSON de dados visíveis | Sim                                | Não                                          |

Uma tarefa de projeto só pode ser atribuída a alguém da equipa desse projeto. Reatribuir trabalho ou escolher participantes não altera a função de uma pessoa. Não há endpoint genérico de escrita nem gestão de funções pelo cliente.

## Tempo e lembretes

Datas de tarefas e follow-ups são datas sem hora. Reuniões e lembretes explícitos são instantes UTC. Todos os campos de horário são interpretados em **Europe/Lisbon**, independentemente do fuso do computador. Horas inexistentes na mudança para horário de verão são rejeitadas. Na repetição de uma hora no outono, a conversão é determinística, mas esta interface não permite escolher explicitamente entre as duas ocorrências; é uma melhoria antes de suportar operações nessa janela.

Os avisos derivam dos objetos oficiais; não são uma segunda lista de tarefas. As confirmações pertencem à pessoa. Alterar a data de um objeto produz um novo aviso. O polling acontece com o separador visível; ao voltar ao OS, os avisos pendentes reaparecem. Não existe scheduler externo, push, email ou garantia de entrega com a aplicação fechada.

## Persistência e evolução

`WorkspaceRepository` separa os casos de uso do armazenamento. A implementação local usa JSON versionado, lock de diretório e substituição atómica por rename. Funciona entre processos no mesmo computador e não sobrescreve um ficheiro corrompido com dados novos. Não é um armazenamento para Vercel/serverless ou múltiplas máquinas; não oferece durabilidade contra falha elétrica equivalente a uma base transacional com WAL.

Uma nova implementação PostgreSQL/Supabase deve manter os invariantes, as transações e os filtros de acesso e acrescentar RLS. As migrations do projeto anterior não fazem parte desta base.

O companion macOS usa AppKit e WKWebView e abre `/painel`. Partilha a fonte de verdade e a API da web; só a sessão de login é própria do WebKit. Não duplica os objetos nem introduz permissões de integração.
