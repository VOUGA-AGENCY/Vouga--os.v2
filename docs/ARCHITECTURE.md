# Arquitetura atual

## Camadas

`src/domain` define entidades, permissões e datas. `src/application` valida e executa comandos. `src/projections` filtra a informação antes de sair do servidor. `src/persistence` implementa transações locais e Supabase. `src/services` contém Activity, Calendar, GitHub, Agent, Telegram e transcrição. Componentes não têm credenciais de providers.

## Escrita e leitura

GET workspace valida host/sessão na mesma leitura que gera a projeção. O ETag é específico da pessoa e revisão; uma revisão igual devolve 304. Não há cache partilhada de dados privados.

POST valida origem e token, autentica dentro da transação e executa apenas comandos conhecidos. A projeção retornada é calculada no estado que acabou de ser gravado. Se a revisão do cliente coincide com a anterior, a resposta contém inserções/alterações/remoções dos registos visíveis. Em caso de revisão diferente devolve toda a projeção para reconciliar. Não se devolvem accounts, sessions, secrets ou jobs internos.

As edições usam versões por entidade. O draft de autosave agrega mudanças, serializa pedidos e avança a versão apenas depois de uma gravação confirmada. Erros mantêm campos pendentes, impedem fechar o editor silenciosamente e permitem Retry. O cliente não adota versões de outros utilizadores para sobrescrever alterações concorrentes. Criações e operações destrutivas são explícitas.

A navegação não volta a pedir a página ao servidor; back/forward atualiza a vista. Refresh externo a cada 60 segundos quando visível e ao recuperar foco. O ETag reduz transferência, mas o backend ainda lê o Store completo para verificar a revisão. A transação Supabase continua a comparar uma revisão global e fazer CAS; ainda pode repetir perante concorrência. Não há promessa de tempo de resposta em produção.

## Tasks e permissões

Uma entidade Task em todo o produto. `assigneeIds` contém todos os responsáveis; em registos históricos ausentes, usa-se `[ownerId]`. `ownerId` é o primeiro responsável por compatibilidade.

- Team: admins e responsáveis, ou membros de projeto autorizado.
- Private: apenas o responsável, sem projeto e atribuição exclusiva a quem grava.
- Board: exclusivamente os IDs Miguel/Roque, independentemente de quem está atribuído. Apenas eles podem criar/editar e ser responsáveis. Sem projeto. Outros admins futuros também não ganham acesso automaticamente.

Comentários, anexos, pesquisa, Activity, Agent e Telegram usam as mesmas permissões. Tasks num projeto exigem responsáveis pertencentes à equipa desse projeto.

Equipa ativa: Miguel/Roque (admin), Ana/Pedro/Vasco (engineer). Roque mantém ID afonso. Perfis removidos são tombstones anónimos/arquivados apenas para integridade histórica; sem contas OS, sessões ou ligação Telegram. Não se apagam utilizadores Supabase do projeto antigo partilhado.

## Calendar e integrações

Office e Contacto são calendários operacionais Google. Personal é interno ao OS. Admin vê todos, engineer apenas Contacto e o seu Personal. Destinos múltiplos têm groupId para não duplicar agenda nem lembretes.

Activity é memória estruturada por entidade/origem/actor/timestamp. Jobs externos são idempotentes e executados fora das transações. Web e Telegram partilham Agent/Voice; o modelo escolhe tools, o backend valida. Telegram é a única interface de lembretes do OS. Criações usam mensagens fixas sem tokens; reuniões têm resumo diário às 08:00 e aviso uma hora antes, Europe/Lisbon. O scheduler deve correr regularmente; a implementação atual ainda tem uma janela curta para o lembrete de uma hora.

## Persistência e autenticação

Produção usa schema vouga_next no Supabase existente. RPCs read/commit só para chave de servidor; commits usam deltas JSONB e revisão global. Acesso do browser passa pelos endpoints autenticados. O adaptador local usa JSON, lock e rename atómico; exclusivo de desenvolvimento.

Login atual valida email/password via Supabase Auth ou credenciais internas. Sessões OS são tokens aleatórios cujo hash fica no servidor. A consolidação numa única identidade Supabase permanente continua pendente. Sessions, autoria e versões não são fornecidas pelo cliente.

Instantes UTC, datas sem hora YYYY-MM-DD, timezone Europe/Lisbon. Secrets e backups fora do Git; seguir docs/INTEGRATIONS.md para autorização, webhooks, scheduler e reconexão.


## Home operacional

`domain/home.ts` deriva as quatro áreas exclusivamente do Snapshot autorizado, sem pedidos adicionais. Eventos agrupados são deduplicados após seleção dos participantes. Relógio local mantém o próximo compromisso atualizado mesmo com respostas ETag 304. Alterações de task reutilizam commands e a fila existente; não existe backend/LLM paralelo.

Continue e nota rápida foram retirados da Home, incluindo o tracking de itens recentes. Notas existentes conservam os fluxos de contexto, pesquisa e Agent. `member.github` valida e associa apenas o próprio username; este campo opcional cabe nos registos JSON existentes do Supabase, sem migração SQL. É identidade de filtragem, nunca autenticação/permissão GitHub.
