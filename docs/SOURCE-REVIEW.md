# Leitura do código anterior e decisões

Referência: cópia local de `Vouga--os`, snapshot fornecido pelo Miguel e inspeção em 24 de setembro de 2026. A origem permaneceu sem alterações. Não foi feita auditoria do Supabase, Vercel ou integrações remotas.

## Cobertura

Foi feito um inventário estático integral de **432 ficheiros de código/schema**, totalizando **54 558 linhas**, em `src` e `supabase`. O manifesto `source-inventory.json` regista caminho, número de linhas, SHA-256, imports e símbolos exportados de cada ficheiro. A análise funcional concentrou-se nas rotas, shell, domínio, serviços, composição, permissões, persistência e projeções dos fluxos necessários à nova versão. O inventário não equivale a uma auditoria linha a linha de segurança nem a uma prova do ambiente remoto.

| Área                      | Ficheiros | Linhas |
| ------------------------- | --------: | -----: |
| App/Presentation          |       149 | 27 871 |
| Application               |        53 |  4 266 |
| Domain                    |        26 |  2 937 |
| Foundation                |        50 |  2 558 |
| Persistence               |        80 |  6 746 |
| Projections               |        28 |  4 333 |
| Proxy e suporte de testes |         3 |     42 |
| Migrations                |        35 |  4 936 |
| Seeds SQL                 |         8 |    869 |

O código local contém **35 migrations**, mais duas que o total de 33 indicado numa passagem do snapshot. Há migrations de 10 de setembro para etapas comerciais e edição de interações.

## O que vale a pena preservar

- A separação entre domínio, casos de uso, persistência e leituras compostas.
- Uma fonte de verdade por objeto; projetos ligam tarefas e contexto sem os duplicar.
- Papéis admin/engineer e verificação no servidor.
- A identidade visual quente, tipografia sóbria, laranja com função e navegação móvel.
- As organizações como centro do histórico comercial.
- Datas tratadas explicitamente em Europe/Lisbon.
- Operações multiobjeto atómicas e controlo de versão para evitar sobrescritas.

## O que mudou e porquê

| Origem observada                                                                        | Decisão nesta base                                                                       |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Navegação Calendar, Work, Contacts, Governance; logótipo abre Context Engine para admin | Entrada em Hoje; cinco áreas operacionais; painel compacto admin                         |
| Formulários por objeto e razão obrigatória em certas criações de tasks                  | Captura universal com revisão; tarefa manual exige só título                             |
| Conclusão de task exige evidência; reunião exige output para fechar                     | Tarefa concluída diretamente; notas de reunião opcionais; eventos expiram temporalmente  |
| Projects inclui âmbito, marcos, financeiro, decisões e recursos                         | Projeto reduzido a objetivo, equipa, próxima ação, tarefas, reuniões, atualizações e PRs |
| Contacts tem organizações, perfis, interações e guiões separados                        | Mini CRM por organização com contacto principal e próximo passo                          |
| Notes inclui pastas, uploads, Google Docs e sincronização                               | Notas de texto pessoais/partilhadas ligadas a projetos                                   |
| Google mirror usa a identidade do criador da reunião                                    | Titular do calendário e criador separados desde o domínio                                |
| Credenciais e schema existentes Supabase/Google                                         | Base local nova, sem reutilizar credenciais ou apontar para os ambientes anteriores      |
| Decisions, Sprints, Roadmap e Vault preservados no código                               | Não transportados para o novo projeto                                                    |

## Ligações técnicas relevantes na origem

- `src/foundation/navigation/navigation.ts` e `app-shell.tsx`: ponto de entrada e navegação.
- `src/application/auth/current-user.ts`: papéis, membro e sessão.
- `src/domain/tasks/task.ts` e `src/application/tasks/task-service.ts`: origem, conclusão obrigatória e transições.
- `src/domain/meetings/meeting.ts`, serviços e actions de reuniões: semântica temporal e fecho.
- `src/application/google/google-meeting-mirror-service.ts`: publicação ligada à identidade recebida; as actions passam o criador.
- `src/application/relations/contracts.ts` e serviços: organizações e registo de interações.
- `src/domain/projects/project.ts`, contratos, composição e página individual: amplitude do agregado e contexto financeiro.
- `src/application/notes/contracts.ts`: concorrência otimista e diferentes tipos documentais.
- `src/projections/calendar/calendar-time.ts`: datas/horas de Lisboa; a nova versão valida também horas inexistentes na mudança de horário.
- `src/foundation/design-tokens.css`: paleta, tipografia e escalas.
- `supabase/migrations`: esquema, funções transacionais, RLS e evolução de acesso.

## Estratégia de reconstrução

Não foi feita uma cópia do repositório com módulos escondidos. O novo projeto reimplementa o subconjunto pedido com objetos menores e dados sintéticos, mantém conceitos úteis e reutiliza apenas os símbolos de marca da Vouga e a direção dos tokens. Não importa os 35 schemas históricos, credenciais, Git, `.env.local`, ou ficheiros de dados da origem.

A substituição por uma base nova implica que a paridade com todas as funcionalidades antigas não é um objetivo. O README distingue fluxos locais implementados de integrações ainda por ligar.
