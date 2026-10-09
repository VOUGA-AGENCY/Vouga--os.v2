# Supabase da V2

Ativo em 27/09/2026. Migração inicial verificada: 55 empresas, 8 contactos, 105 interações e 4 tasks; 213 registos totais. Inclui dados demo já existentes. Backup privado preservado em .local/backups.

Reutiliza o projeto Supabase existente; não altera tabelas da V1. A API continua em localhost nesta etapa. O login do OS mantém-se: a chave pública não autentica utilizadores nem dá acesso ao novo schema.

## Ativação

1. `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY` (secret key ou service_role, apenas servidor). Manter `VOUGA_LOCAL_MODE=1`.
2. No SQL Editor do projeto existente executar `supabase/migrations/20260927_vouga_next.sql`. Não é necessário expor o schema vouga_next na Data API.
3. Parar o servidor e o integration worker. Executar `bun run db:preview` e `bun run db:migrate` na pasta deste projeto.
4. Só depois de obter “Dados e anexos verificados”, definir `VOUGA_STORAGE=supabase`, executar `bun run build`, `bun run start` e, separadamente, `bun run integrations:worker`.

O migrador preserva backup privado em `.local/backups`, não cria dados demo e recusa substituir um workspace remoto já existente. Repetir uma tentativa com os mesmos dados usa o mesmo recibo; não apagar o recibo para contornar um conflito. A comparação final verifica todo o conteúdo, ignorando apenas a revisão e a ordem das propriedades JSON.

## Rotas e base de prospeção partilhadas (07/10/2026)

1. No SQL Editor executar `supabase/migrations/20261007_routes_prospects.sql`. É aditivo: cria `visit_routes` (coleção normal do workspace), `prospects` e três funções `vouga_next_prospects_*`; não altera tabelas, linhas nem funções existentes.
2. `bun run prospects:migrate` (pré-visualização) e `bun run prospects:migrate --apply` copiam os prospetos de `data/prospects.json` para a base. Repetir é seguro.
3. `prospects:sync` e `prospects:import` passam a gravar diretamente na base; prospetos corrigidos na app ou já convertidos no CRM nunca são substituídos.

Os prospetos ficam fora de `vouga_next_read`: o workspace é lido inteiro em cada pedido e a base de prospeção pode ter milhares de empresas, por isso é consultada por zona do mapa ou por id. Antes do passo 1, o modo Prospeção do mapa mostra erro e guardar uma rota falha; o resto do OS não é afetado. Em modo local, a base é `.local/prospects.json`, criada a partir de `data/prospects.json` na primeira gravação.

## Armazenamento e segurança

Cada coleção tem uma tabela própria no schema privado, com payload JSONB por entidade e colunas geradas para pesquisa. As duas funções `public.vouga_next_read` e `public.vouga_next_commit` só podem ser executadas com service_role; anon e authenticated não têm acesso. As permissões por pessoa continuam a ser validadas no backend, antes de devolver a projeção autorizada ao browser. Accounts, sessões e credenciais encriptadas nunca são devolvidas ao cliente.

As mutações enviam apenas linhas alteradas, usam comparação de revisão e ficam na mesma transação que Activity. Um ID de mutação estável permite repetir pedidos com resposta perdida sem executar duas vezes. Não existe fallback silencioso para ficheiro quando o Supabase falha.

O bucket `vouga-next-attachments` é privado. Downloads passam pelo endpoint do OS que verifica acesso à task. Um upload cujo resultado de gravação seja incerto fica preservado; uma futura rotina de reconciliação pode limpar objetos sem referência. Não se apaga um ficheiro que possa ter ficado associado a uma task.

## Limites desta etapa

O adaptador lê o workspace inteiro (~0,5 MB em outubro de 2026) e serializa transações curtas por revisão. Ler tudo em cada pedido, polling de 30 s e tick do worker gastou 7 GB de Egress num mês (Free: 5 GB). Desde 08/10/2026 cada processo guarda a última leitura em memória e, com `vouga_next_revision` (migração 20261007), só volta a descarregar quando a revisão muda; sem essa função, reutiliza a leitura durante 60 s. Transações sem alterações já não escrevem. Adequado à dimensão atual; antes de crescimento significativo, migrar consultas para projeções SQL por entidade. Recibos de idempotência são conservados sem limpeza automática.

A autenticação ainda é restrita a loopback. Não publicar apenas removendo essa validação. O alojamento público, autenticação HTTPS, credenciais individuais definitivas e scheduler 24/7 requerem uma etapa própria. O Supabase guarda os dados mesmo com o Mac desligado; os lembretes só são enviados quando o worker está a correr.

Rollback: o backup local anterior à migração não contém alterações feitas depois no Supabase. Nunca alternar para local sem primeiro parar os escritores e exportar/reconciliar o estado remoto.
