# Dados e operação local

## Onde ficam

O primeiro login inicializa `.local/workspace.json`. Inclui dados de exemplo, hashes scrypt das palavras-passe, hashes dos tokens de sessão e dados operacionais. A pasta é criada com modo 0700 e os ficheiros com 0600. Não existe gravação em Supabase, Google ou GitHub.

`.env.local`, `.local`, `.next`, `node_modules` e o build macOS estão ignorados para um futuro repositório. Nenhum `.git` é criado por setup ou build. A `.env.local` desta base vem do novo `.env.example`; não é copiada da aplicação anterior.

As contas são inicializadas só uma vez. `bun run setup` não sobrescreve uma configuração existente. Os dados não são repostos ao reiniciar. Para começar outra demonstração, conserva a pasta atual e define `VOUGA_DATA_DIR` para uma **nova pasta vazia** antes de iniciar o servidor.

## Guardar uma cópia

Fecha o servidor e copia `.local` para um local seguro. Para restaurar, fecha o servidor, conserva a pasta atual e repõe a cópia na pasta de dados configurada. Esta cópia inclui sessões e hashes; deve ser tratada como privada.

A opção “Exportar dados visíveis em JSON” é uma exportação operacional sem credenciais. Não é um backup integral: não inclui as notas privadas de outras pessoas, contas ou sessões e não tem um fluxo de importação nesta versão.

## Se uma gravação ficar bloqueada

Cada transação adquire `.local/write.lock`. A espera é limitada a seis segundos. Em caso de encerramento abrupto do processo, o lock pode ficar no disco.

1. Fecha todos os processos do servidor que usam essa pasta de dados.
2. Faz uma cópia de `.local`.
3. Confirma que `write.lock` é apenas o diretório de lock vazio e remove-o.
4. Reinicia o servidor.

Nunca remover o lock enquanto outro processo puder estar a gravar. Um ficheiro JSON inválido causa um erro; a aplicação conserva-o em vez de o substituir por dados de demonstração.

## Âmbito

Servidor no loopback `127.0.0.1:3100`. Os endpoints recusam hosts remotos e mutações com origem diferente do host local. Sessões HTTP-only/SameSite Strict, validade de sete dias e invalidação no logout. O rate limit de login é local ao processo.

Esta edição não deve ser exposta publicamente, servida por túnel ou usada com dados de produção sem a etapa de autenticação/armazenamento de produção descrita na arquitetura. Não é necessário ler ou copiar qualquer segredo da aplicação anterior.
