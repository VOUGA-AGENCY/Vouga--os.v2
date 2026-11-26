# Intelligence

## Ativar em produção

1. No projeto Google Cloud do cliente OAuth atual do OS, ativa Google Drive API, Google Docs API e Google Sheets API. Acrescenta o scope `https://www.googleapis.com/auth/drive.readonly` à configuração de acesso a dados. As duas contas operacionais mantêm o cliente OAuth e as permissões de Calendar existentes.
2. No Supabase **do Vouga OS**, executa `supabase/migrations/20261126180301_intelligence.sql` uma vez. É uma migração do schema privado `vouga_next`. Os relatórios ficam fora das coleções e do cache do workspace. O SQL cria uma role de leitura sem login que fica sujeita às políticas RLS. Os RPC públicos só aceitam chamadas do servidor com a service role.
3. Na Vercel, confirma `TELEGRAM_ENABLED=true` em Production, o token do bot existente, o webhook secret, `VOUGA_PUBLIC_URL` e `INTEGRATION_CRON_SECRET`. Mantém Preview e ambientes locais com Telegram desativado se partilharem credenciais de produção. Publica a versão pelo fluxo normal da equipa.
4. Em Settings, usa **Connect / Reconnect** com Office e depois Contacto. Autoriza o acesso de leitura ao Drive em ambas as contas. Cada conta precisa de acesso à respetiva pasta. Uma ligação a Calendar anterior pode aparecer como ligada mesmo antes deste consentimento.
5. Abre **Intelligence** e sincroniza. A primeira leitura importa e notifica todas as entregas válidas já existentes. Usa um relatório real pronto, ou valida primeiro num ambiente isolado. O número de perfis com Telegram ligado aparece em Settings. Uma pessoa ainda sem ligação pode usar **Link my Telegram** e depois **Start** no bot.
6. Executa `supabase/operations/enable-intelligence-cron.sql` no SQL Editor. Reutiliza o segredo `vouga_os_cron` do Vault e cria o job `vouga-os-intelligence`. Verifica as duas pastas dez minutos após cada horário das automatizações, em Lisboa. Todos os dias às 07:10, 07:40, 08:10 e 09:10. Nos dias úteis também às 08:25, 08:40 e 16:40. À segunda e ao domingo também às 10:10, e à sexta às 17:10. Horários coincidentes geram um único pedido. O filtro está no PostgreSQL, antes da chamada à Vercel.
7. Confirma também que o job existente `vouga-os-integrations` está ativo com `supabase/operations/check-integration-cron.sql`. Se estiver ausente, usa `enable-integration-cron.sql`. Se estiver suspenso, ativa o job existente no dashboard Supabase Cron. Este job entrega a mensagem de trabalho nos dias úteis às 08:00, incluindo dias vazios, e recupera até às 09:00. O texto e os destinatários seguem a rotina original.

## Acesso e processamento

Miguel e Roque (ID histórico afonso) recebem ambos os públicos. Todos os engineers ativos recebem Commercial Intelligence. Uma conta desativada perde o acesso. A API valida a sessão e a origem das mutações. A leitura na base de dados volta a aplicar o âmbito do membro e a pasta do ficheiro. O browser recebe apenas resumos paginados ou o conteúdo do relatório selecionado.

Office lê `1FTP-3cMLlczpn-M-VVUR8Qsu5Fg_ERTf`. Contacto lê `1CxCH8m3qzSCDO05SuUqjeQzilDb1UlRW`. O catálogo está em `src/domain/intelligence.ts`. O par task_key/público também tem integridade referencial na base de dados. Apenas documentos e folhas diretamente nestas pastas são elegíveis. O título do ficheiro serve de apresentação.

A primeira sincronização obtém o token de alterações antes de listar a pasta. A seguir lê apenas as mudanças do Drive, atualiza o inventário e avança o cursor na mesma transação. Se um cursor expirar, reconstrói o inventário. Documentos pendentes e inválidos voltam a ser lidos no ciclo seguinte mesmo sem nova entrada no feed. Ficheiros movidos, eliminados ou em revalidação deixam de aparecer. Os conteúdos de outras pastas não são importados.

A fila de Telegram é criada na transação da primeira importação. Cada combinação de relatório, pessoa e tipo é única. Atualizações do documento não criam uma nova entrega. O worker confirma novamente a autorização e a ligação ao bot antes de reservar o envio. Respostas 429 ou credenciais temporariamente rejeitadas permitem nova tentativa no ciclo seguinte. Resultados ambíguos, incluindo um processo interrompido depois da reserva, ficam para revisão. O link abre o relatório pelo ID no OS.

## Diagnóstico

Estas consultas podem ser executadas no SQL Editor do OS sem apresentar conteúdos comerciais, identificadores de chat ou credenciais.

```sql
select audience, last_sync, last_error from vouga_next.intelligence_folders;
select folder_id, state, last_error, count(*) from vouga_next.intelligence_files group by 1,2,3;
select state, count(*), max(sent_at), max(attempts) from vouga_next.intelligence_notifications group by 1;
select jobname,schedule,active from cron.job where jobname in ('vouga-os-intelligence','vouga-os-integrations');
```

Google HTTP 403 exige verificar o consentimento, as APIs habilitadas e o acesso à pasta pela conta indicada. Se o cabeçalho estiver incorreto, corrigir o primeiro parágrafo ou a célula A1 e sincronizar novamente. Antes de qualquer reenvio de uma notificação incerta, verificar com o destinatário se foi recebida.

Para verificar a migração numa base de testes descartável, executar `supabase/tests/intelligence.sql` depois das migrações. O script usa perfis e entregas sintéticos numa transação com rollback. A suite Vitest usa fornecedores simulados.
