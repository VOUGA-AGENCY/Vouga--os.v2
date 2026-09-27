# Vouga OS na barra de menus

Companion macOS em AppKit + WKWebView. Abre `/painel` numa janela de 420 × 690 a partir do símbolo Vouga na barra de menus. Lê os mesmos dados e usa as mesmas permissões do workspace; não mantém uma segunda base de dados.

1. Na raiz do projeto: `bun run dev` (ou `bun run build` e `bun run start`).
2. Compilar com as Apple Command Line Tools: `bash desktop/macos/build.sh`.
3. Abrir `desktop/macos/build/Vouga OS.app`.
4. Entrar como Miguel ou Afonso. A sessão do WebKit é independente da sessão do browser e persiste entre aberturas. O engineer usa o workspace normal.

Clique no símbolo: abrir/fechar painel. Clique direito: abrir workspace, recarregar ou sair.

O binário recebe uma assinatura ad hoc apenas para execução local; não é uma distribuição assinada/notarizada. Não instala um serviço, não arranca automaticamente com o sistema e não pede permissões de microfone, acessibilidade ou notificações. O servidor local deve estar a funcionar.

Próxima etapa de distribuição: empacotar o runtime e o arranque do servidor, assinatura/notarização e um atalho global escolhido pelo utilizador. As notificações atuais continuam a ser internas; não há entrega garantida com o servidor ou aplicação fechados.
