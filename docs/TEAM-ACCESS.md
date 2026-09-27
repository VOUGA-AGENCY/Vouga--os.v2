# Acesso da equipa

Utilizadores: miguel e roque (admins); vasco, patrick, ana e pedro (engineers). O login aceita o nome ou o email já associado ao perfil. O ID antigo afonso mantém-se internamente para preservar autoria; o nome de login é roque.

As contas provisionadas exigem alteração de password. A sessão inicial dura dez minutos e não permite consultar dados nem executar comandos. A nova password requer 12–200 caracteres; ao gravar, todas as sessões anteriores dessa pessoa são revogadas. Passwords temporárias expiram em 24 horas. Não existe registo público nem lista de passwords na página de login.

Cinco tentativas erradas bloqueiam a conta durante 15 minutos. O contador vive no Supabase, sendo partilhado entre processos. Hashes scrypt com salt; tokens de sessão aleatórios e guardados apenas como hash; cookie HttpOnly e SameSite=Strict.

## Configuração online

- VOUGA_LOCAL_MODE=0
- VOUGA_STORAGE=supabase
- VOUGA_APP_ORIGIN=https://os.vouga-agency.pt
- VOUGA_PUBLIC_URL=https://os.vouga-agency.pt
- GOOGLE_REDIRECT_URI=https://os.vouga-agency.pt/api/integrations/google/callback

Usar a mesma base Supabase e manter INTEGRATION_ENCRYPTION_KEY, necessária para abrir os refresh tokens existentes. Configurar os outros secrets apenas no alojamento. Não colocar dados .local nem .env no repo. VOUGA_APP_ORIGIN determina a origem permitida e cookies Secure; não se aceitam origens arbitrárias nem X-Forwarded-Host para autorizar pedidos.

Atualizar os redirect URIs autorizados na Google Cloud e os endpoints públicos Google/GitHub/Telegram. Um deployment da interface não inicia automaticamente o worker: é necessário configurar o scheduler protegido por INTEGRATION_CRON_SECRET. A troca do domínio deve acontecer com o build e as variáveis preparados.

Esta entrega prepara o código e as contas; não publica nem muda DNS. Passwords pessoais são escolhidas pelos próprios utilizadores no primeiro acesso. Não executar novamente o provisionamento em contas já ativas sem pedido explícito: isso invalida passwords e sessões.
