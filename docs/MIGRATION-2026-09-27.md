# Migração para o novo Vouga OS

Decisão: criar um NOVO projeto Supabase. O antigo é apenas fonte dos CSV; não alterar nem apagar a sua base de dados. O novo OS continua local até existir um adaptador Supabase, autenticação de produção, armazenamento remoto dos anexos e execução pública do worker. Configurar secrets não realiza essa migração.

## Dados recebidos

52 empresas, 5 contactos, 47 interações, 3 modelos de mensagem e 7 perfis históricos. Tasks, projects e task_companies vazios por confirmação do utilizador. Não é um backup integral da base antiga.

Importação: identificadores determinísticos com prefixo da origem; datas, contacto principal, email, telefone, autoria e responsável preservados. Website, CAE, riscos e contexto preservados como notas. Estados: to_contact → New; contacted → Contacted; not_interested → Dormant; agreed → Client. 47 interações originais + 52 notas de contexto de empresa + 5 notas de contexto dos contactos = 104 entradas de timeline. Os 3 modelos de mensagem ficam no arquivo de importação, sem criar um módulo novo. Dados locais anteriores preservados.

Miguel e Roque são admins. Vasco continua Engineer segundo a especificação atual, mesmo que o CSV antigo diga admin. A Inês não tem registos nestas três tabelas. Decisão do utilizador para futuras referências: manter autoria histórica e atribuir trabalho atual ao Miguel; não criar um login automaticamente.

## Supabase novo

1. Dashboard → New project, organização Vouga, nome `vouga-os-next`.
2. Região europeia; password forte guardada no gestor de passwords. Não enviar no chat.
3. Esperar que a base fique disponível.
4. Connect / Settings → API Keys: localizar Project URL e chaves. Ainda não importar CSV diretamente nem recriar à mão as tabelas antigas.
5. Implementação pendente: tabelas novas, RLS/permissões, adaptador transacional, migração dos dados e anexos, autenticação de produção. O programador prepara e valida o SQL antes de o aplicar no projeto novo.
6. Validar contagens e permissões. Só depois passar a aplicação para Supabase. Não manter JSON e Supabase como fontes concorrentes.

## Repositório e publicação

GitHub → New repository → organização Vouga → `vouga-os-next` (ou nome escolhido), Private, sem README/licença/gitignore gerados. O projeto local correto é `/Users/miguel/Documents/GitHub/Vouga-os-next`. Não é `/Users/miguel/Documents/GitHub/Vouga--os`.

Antes do primeiro commit, excluir `.env*`, `.local`, exports CSV, `.pem`, builds e node_modules; examinar o conteúdo a publicar. Criar um projeto de alojamento separado e importar o novo repo apenas quando o código estiver pronto para produção. Nesta entrega não foi criado repo, feito commit/push ou deployment.

Vercel é uma possibilidade para Next.js, mas Hobby é pessoal/não comercial. Para uso empresarial, verificar o plano aplicável. Não usar Cron Hobby para lembretes de hora a hora: só suporta execução diária e sem precisão necessária. Uma alternativa é Supabase Cron a chamar o endpoint protegido a cada minuto, depois de o backend estar público; medir a duração do worker e garantir que cabe nos limites do host. O worker atual também precisa de adaptação para execução serverless confiável. Não se promete alojamento empresarial gratuito.

## Domínio os.vouga-agency.pt

1. Identificar o alojamento e DNS atuais; `vercel.json` no código antigo não prova onde está publicado.
2. Manter o antigo a funcionar durante a migração.
3. Testar o novo numa URL temporária fornecida pelo alojamento, com a nova base Supabase.
4. Antes da troca, parar edições no antigo, exportar alterações finais e validar a importação.
5. Se ambos os projetos estiverem na Vercel: Settings → Domains, mover o domínio do projeto antigo para o novo; se a interface exigir, remover do antigo e adicionar ao novo. Pode haver uma breve interrupção. Seguir os registos DNS concretos fornecidos pelo projeto novo.
6. Se mudar de fornecedor: adicionar o domínio no novo host, depois alterar APENAS o registo de `os` no gestor DNS. Não alterar MX nem registos do email, nem nameservers indiscriminadamente.
7. Confirmar HTTPS, login, leitura/escrita, webhooks e scheduler. Preservar o deployment antigo e anotar DNS anterior para rollback.
8. Desativar integrações e jobs do antigo que possam duplicar sincronizações ou lembretes.

## Google Calendar

Reutilizar o projeto Google Cloud existente, se apropriado, com um cliente OAuth separado para o OS novo. Calendar API ativa. Google Auth Platform: branding Vouga OS; Audience Internal, se o projeto estiver na organização Workspace; Clients → Web application.

Callbacks autorizados:
- Local: `http://127.0.0.1:3100/api/integrations/google/callback`
- Produção: `https://os.vouga-agency.pt/api/integrations/google/callback`

No servidor: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI e INTEGRATION_ENCRYPTION_KEY. Em produção VOUGA_PUBLIC_URL=https://os.vouga-agency.pt. A chave AES é gerada com `openssl rand -base64 32` e guardada em segurança.

Depois de publicar o novo backend: Settings → Google → Connect Office com office@vouga-agency.pt; concluir ligação; repetir Contacto com contacto@vouga-agency.pt. Webhook `/api/webhooks/google` gerido pelo serviço. Testar criação e edição nos dois sentidos. Não copiar automaticamente tokens encriptados da base antiga. Recorrências e eventos all-day editam-se no Google nesta V1.

## GitHub App (diferente do repo do OS)

Organização → Settings → Developer settings → GitHub Apps → New. Nome único; homepage da organização ou do OS; Only on this account. Contents Read, Pull requests Read, Metadata Read. Subscrever Push, Pull request, Pull request review. Webhook `https://os.vouga-agency.pt/api/webhooks/github`, SSL ativo. Segredo próprio (`openssl rand -hex 32`).

Gerar private key .pem; guardar App ID; Install App → só os repos pretendidos; guardar Installation ID. No servidor: GITHUB_APP_ID, GITHUB_INSTALLATION_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET. Ativar webhook só quando o domínio já aponta para o backend novo. Settings → Check connection; Project → Link repository; task → associar PR. Não exige permissões de escrita no código.

## Agent e Voice

Groq Console → API Keys → Create API Key; manter Free se suficiente. Settings → Data Controls → verificar e ativar ZDR quando disponível.

Servidor: GROQ_API_KEY; GROQ_AGENT_MODEL=openai/gpt-oss-120b; GROQ_TRANSCRIPTION_MODEL=whisper-large-v3-turbo. Uma única integração para texto e voz, web e Telegram. Depois de reiniciar, Settings → AI / Voice → Check connection. Testar pergunta, criação de task e áudio curto. Microfone precisa de autorização do browser; em produção requer HTTPS.

## Telegram

BotFather oficial → /newbot → nome Vouga Agent → username disponível terminado em bot. Guardar token em TELEGRAM_BOT_TOKEN. Gerar TELEGRAM_WEBHOOK_SECRET com `openssl rand -hex 32`. Opcional: /setjoingroups → Disable.

Com novo backend público: Settings → Telegram → Connect webhook. Cada pessoa entra no seu perfil OS e usa Link my Telegram → abrir bot → Start. Link expira em dez minutos. /start avulso não dá acesso. Não associar todas as pessoas através do perfil Miguel.

## Lembretes e Activity

Activity é interno, não precisa de conta/chave: ações OS e GitHub/Google entram no histórico apropriado. Não envia notificações automaticamente.

Worker/scheduler deve executar pelo menos uma vez por minuto. Local: `bun run integrations:worker`, apenas com Mac ligado. Produção: agendar POST `/api/integrations/cron`, Authorization Bearer INTEGRATION_CRON_SECRET, segredo forte separado e guardado no scheduler. Não colocar segredo na URL. Exige backend e base públicos, limites de execução validados.

08:00 Europe/Lisbon: resumo de reuniões de cada participante interno. Cerca de uma hora antes: aviso por reunião. Office/Contacto não determinam automaticamente quem recebe. Testar atribuição, cancelamento, mudança de horário e ausência de duplicados. Google pode manter notificações nativas; Inbox não replica alertas.

## Fontes

- https://supabase.com/docs/guides/getting-started/quickstarts/reactjs
- https://supabase.com/docs/guides/cron
- https://vercel.com/docs/domains/working-with-domains/transfer-your-domain
- https://vercel.com/docs/plans/hobby
- https://vercel.com/docs/cron-jobs/usage-and-pricing
- https://developers.google.com/workspace/guides/configure-oauth-consent
- https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app
- https://console.groq.com/docs/quickstart
- https://core.telegram.org/bots/features#botfather
