# Vouga OS · integração operacional

Estado atualizado em 27/09/2026: Supabase ativo no schema vouga_next do projeto existente; 213 registos migrados e comparados integralmente. GitHub App, chave Groq e identidade do bot Telegram verificadas por chamadas reais. Google ainda requer autorização de Office/Contacto. Deployment e webhooks públicos ainda não ativos. Ver `SUPABASE.md` para a ligação ao mesmo projeto da V1.

## Auditoria inicial (histórico)

- Next.js 16.2.10, React 19.2.7, TypeScript e Bun. API routes no mesmo processo da aplicação.
- Sessões aleatórias com hash SHA-256 no servidor; passwords scrypt com salt; cookie HttpOnly, SameSite=Strict; validação de Host loopback e Origin em mutações. Mantidos.
- `LocalWorkspaceRepository`: JSON em `.local/workspace.json`, lock entre processos, escrita por rename atómico, versões para conflitos. Anexos em disco. Não existe Postgres, Supabase, D1 ou serviço remoto que possa ser reutilizado.
- Capture anterior: parser determinístico, sem LLM. Voz anterior: SpeechRecognition do browser. As interfaces antigas de integrações eram contratos sem adaptadores.
- Execução: `127.0.0.1:3100`; sem domínio público nem processo 24/7. A base de dados fica no Mac. O companion macOS usa a mesma aplicação.

## Implementado

Calendários operacionais `Office` e `Contacto`, independentes das pessoas. Defaults: CRM → Contacto; projeto/interno → Office. Participantes internos dirigem My Day e Telegram; externos são emails enviados ao Google como convidados. Miguel e Roque são admins; o identificador interno `afonso` foi mantido para preservar referências. O acesso local de Roque é `roque@vouga.local`, com a password existente.

Home contém My Day e Inbox de intervenção. Sem alertas progressivos, sino de notificações ou notas permanentes. Notas continuam na pesquisa e nas tools do Agent. Eventos Google sem participantes internos produzem um pedido de classificação, não um alerta de proximidade.

Activity é uma coleção estruturada no mesmo armazenamento, separada de comunicações. As mutações de tasks, comentários, empresas, notas comerciais e calendário registam eventos na mesma transação. Webhooks GitHub/Google acrescentam eventos idempotentes. Projeções filtram Activity pelas permissões da entidade. Os projetos têm Board/List/Activity; tasks podem associar uma PR do projeto.

Serviços em `src/services`: activity, calendar, github, agent, telegram, transcription, integration-worker. React chama apenas endpoints locais; as chamadas a fornecedores ficam nestes serviços. `externalConnections`, `integrationJobs`, `pendingActions`, `notificationDeliveries` e recibos do Agent são estruturas comuns no Store v5.

## Infraestrutura: decisão e limite explícito

Um worker público isolado NÃO consegue consultar o JSON num Mac fechado. Um túnel HTTPS é a alternativa gratuita mais simples para testar webhooks enquanto o Mac está ligado; não dá disponibilidade 24/7. Apenas as rotas de webhook autenticadas aceitam esse tráfego; a autenticação da aplicação continua bloqueada a loopback.

A persistência escolhida passou a ser **o mesmo projeto Supabase da V1, num schema isolado `vouga_next`**, sem D1 nem segunda fonte de verdade. O adaptador guarda cada entidade numa linha e executa alterações e Activity numa transação com controlo de concorrência. Anexos ficam num bucket privado.

A API web e o worker continuam no Mac. Supabase remoto não torna o processo Next disponível 24/7. Antes de trocar os.vouga-agency.pt, falta alojar a aplicação e o worker, adaptar autenticação à origem HTTPS e substituir credenciais de demonstração. A escolha do hosting deve reutilizar o alojamento existente quando compatível com Next/Node; não foi criado nenhum recurso público nesta entrega.

O passo de publicação deve ser aprovado apenas depois de rever os recursos, origem pública e migração concreta. Nada foi enviado para Git nem publicado.

## Configuração local

1. Preencher `.env.local` usando `.env.integrations.example`; este ficheiro de exemplo não contém credenciais. Criar uma chave AES-256 local com `openssl rand -base64 32`. Guardar a chave fora do Store e incluí-la no plano de recuperação: perdê-la impede recuperar refresh tokens.
2. `bun run build` e `bun run start` (3100).
3. Noutro processo, `bun run integrations:worker`. Processa a fila e verifica lembretes a cada minuto. Para um scheduler alojado, existe `POST /api/integrations/cron` protegido por `INTEGRATION_CRON_SECRET`.
4. Abrir `/settings`. Não colocar tokens em campos React, query strings de configuração, logs, Git ou mensagens.

### Google

Criar um projeto Google Cloud do Workspace, ativar Calendar API e OAuth Internal. Usar Web Client. Para teste local, redirect URI exata: `http://127.0.0.1:3100/api/integrations/google/callback`. O callback é configurado por `GOOGLE_REDIRECT_URI`, separadamente do endpoint público de webhooks; um túnel não muda o callback local. Para um futuro deployment, o callback tem de coincidir com a origem pública e com a autenticação desse deployment.

Scopes: `calendar.events` para eventos e `calendar.calendars.readonly` para verificar o calendário primário da conta autorizada. Ligar Office e Contacto separadamente. O backend verifica a conta primária; não confia apenas em `login_hint` ou `hd`. Guarda refresh token com AES-256-GCM. State aleatório, de uso único, ligado ao admin e com expiração/PKCE. O callback apresenta “Concluir ligação”: o POST same-origin permite manter o cookie Strict existente.

Insert usa ID determinístico; update usa referência externa e ETag; cancelamento usa DELETE. Alterar calendário usa events.move. Outbox guarda alterações antes de qualquer chamada externa. Erros ficam na fila e em Settings; reconnect reenvia alterações pendentes. Conflitos 412 ficam para intervenção, sem substituir silenciosamente a versão Google.

Pull usa events.list paginado, syncToken e recuperação de 410. Watch usa endpoint HTTPS `/api/webhooks/google`, token de canal, resourceId e renovação antes da expiração. Em localhost sem URL pública, Sync manual continua disponível depois de OAuth; notificações push só funcionam com endpoint público.

Eventos de dia inteiro e instâncias recorrentes são importados; horários/séries editam-se no Google nesta V1 para não transformar ou destruir a recorrência. É possível associar participantes internos no OS. A janela inicial é 90 dias passados a 366 dias futuros. Não se inferem participantes internos a partir da conta Office/Contacto. Os convites externos usam `sendUpdates=all`; confirmar emails antes de criar o evento.

### GitHub

Criar GitHub App privada e instalar apenas nos repositórios pretendidos. Permissões Contents read, Pull requests read e Metadata read. Webhooks: push, pull_request, pull_request_review. Segredo de webhook independente da chave privada. Endpoint: `/api/webhooks/github`.

O backend valida HMAC SHA-256 sobre bytes originais, delivery ID e installation ID. Tokens da instalação são obtidos por JWT assinado no servidor. Em Project → Link repository, a lista vem da instalação autorizada. A primeira associação importa PRs abertas; atualizações seguintes vêm de webhooks, sem polling constante. Vários repositórios por projeto; feed inclui commits, PRs e pedidos de review. A associação task→PR é explícita.

### Groq / Voice

Configurar uma API key de uma conta no plano Free. Defaults `openai/gpt-oss-120b` e `whisper-large-v3-turbo`. Os modelos podem ser substituídos por env sem alterar React. Verificar Data Controls e ativar Zero Data Retention na conta; o código não afirma que ZDR está ativo sem verificar a conta.

O Agent só vê catálogo e dados permitidos ao utilizador. Tool names e argumentos têm allowlist; as mutações passam pelo mesmo executeCommand da aplicação. Nenhuma tool permite SQL, shell ou acesso genérico ao Store. Confirmações persistentes para cancelamentos, edição de eventos e convites externos; versão e permissões verificadas de novo ao confirmar. Pedidos têm recibos para impedir execução repetida do mesmo request. IDs não autorizados são recusados. Ambiguidade depende também do modelo; testar comandos reais com a equipa antes de uso autónomo abrangente.

Texto web e Telegram passam por runAgent. Áudio web/Telegram passa pelo mesmo transcribe e depois runAgent. Áudio não é guardado no disco. Limite web 24 MB; Telegram 20 MB e 10 minutos. Sem chave Groq, o Agent informa indisponibilidade e permite guardar texto na Inbox; não simula respostas de IA.

### Telegram

Criar bot no BotFather, configurar token e webhook secret no servidor. Connect webhook em Settings requer HTTPS público. Cada pessoa autenticada gera um deep link de uso único com expiração de 10 minutos. /start sem token válido não associa contas. Apenas chats privados de IDs previamente ligados podem chamar o Agent; grupos e utilizadores desconhecidos são ignorados.

08:00 Europe/Lisbon: um resumo por utilizador com as suas reuniões. Janela de recuperação até 08:15. Uma hora antes: um lembrete por evento/participante, janela entre 55 e 60 minutos antes. Cancelamentos são excluídos; mudança de hora muda a chave do lembrete. O scheduler usa timezone IANA, incluindo horário de verão.

sendMessage não oferece chave de idempotência. O serviço reserva a entrega antes da chamada. Falha de rede com resultado incerto não é reenviada automaticamente; fica visível em Settings. Isto privilegia não duplicar, mas não promete entrega garantida durante falhas. Webhooks têm deduplicação separada de mensagens de saída.

## Por ligar / validar com contas reais

- Google Cloud OAuth Client e autorização de ambas as contas; testar insert/update/move/delete, alterações externas, revogação e renovação real de watch.
- GitHub App instalada, chave e webhook; testar uma PR e push reais num repositório escolhido.
- Groq key, Free Plan, modelos e Data Controls; testar tool calling e transcrição real.
- BotFather token, emparelhamentos individuais e endpoint HTTPS; testar lembretes e voice notes reais.
- Hosting persistente 24/7. A implementação continua local e o Mac tem de estar acordado.
- Conflitos Google 412 exigem revisão humana: abrir o link Google e escolher “Manter versão Google” ou “Manter versão OS” no painel do evento. A escolha OS usa o ETag revisto; outra alteração concorrente volta a gerar conflito. Não há merge automático.

## Fontes oficiais verificadas em 26-09-2026

- [Groq rate limits](https://console.groq.com/docs/rate-limits): GPT-OSS 120B 1.000 requests/dia, 200.000 tokens/dia e 8.000 tokens/min; Whisper Turbo 2.000 requests/dia, 28.800 segundos/dia. Limites reais da organização prevalecem; 429 deve ser respeitado, sem upgrade automático.
- [Groq Your Data](https://console.groq.com/docs/your-data): controlos de retenção e elegibilidade ZDR; não confundir “não reter por defeito” com ausência total de exceções.
- [Groq local tool calling](https://console.groq.com/docs/tool-use/local-tool-calling) e [speech to text](https://console.groq.com/docs/speech-to-text).
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/): 100.000 pedidos/dia, 5 cron triggers, 10 ms CPU no Free. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).
- [Google incremental sync](https://developers.google.com/workspace/calendar/api/guides/sync), [push/watch](https://developers.google.com/workspace/calendar/api/guides/push), [quotas](https://developers.google.com/workspace/calendar/api/guides/quota). Quotas por projeto/utilizador e limites operacionais continuam a aplicar-se; verificar a consola antes de assumir um threshold universal.
- [GitHub webhook signatures](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries) e [installation authentication](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation).
- [Telegram Bot API](https://core.telegram.org/bots/api).
