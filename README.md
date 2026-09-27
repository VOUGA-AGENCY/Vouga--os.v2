# Integrações operacionais

Consultar [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) para a auditoria da stack, estado real, configuração das contas, limites e proposta de hosting. Esta especificação substitui as descrições de Home/Calendar/Capture abaixo: Home sem alertas/notas permanentes, Office/Contacto, Agent partilhado, Activity e Telegram.

# Vouga OS

**Capturar rápido. Organizar automaticamente. Mostrar apenas o que importa.**

Nova base independente do sistema operativo interno da Vouga Agency. Esta edição é funcional e exclusivamente local: sessões com dois perfis, dados persistidos neste computador e exemplos fictícios. Não contém histórico Git, credenciais, dados de clientes nem ligações ao Supabase, Google ou GitHub do projeto anterior.

## Abrir

Requer Bun **1.3.14** (o runtime usado no desenvolvimento).

```sh
bun install --frozen-lockfile
bun run setup
bun run dev
```

Abre **http://127.0.0.1:3100**. O servidor escuta apenas neste computador. Se as dependências já estiverem instaladas, basta `bun run dev`.

| Conta local            | Perfil   |
| ---------------------- | -------- |
| `miguel@vouga.local`   | Admin    |
| `afonso@vouga.local`   | Admin    |
| `engineer@vouga.local` | Engineer |

Palavra-passe inicial das três contas: `vouga-local-2026`. São contas de demonstração sem relação com contas reais. Para usar outro valor **antes da primeira inicialização**, altera `VOUGA_DEMO_PASSWORD` em `.env.local` (mínimo 12 caracteres). Alterar a variável posteriormente não altera os hashes já guardados.

## Experiência

- **Home:** My Day e Inbox de atenção, com notas em post-its na zona inferior. O dia reúne tarefas, reuniões e lembretes pessoais; a Inbox apresenta alertas progressivos e capturas por confirmar.
- **Tasks:** entidade única com Board por defeito ou lista, agrupamento, filtros, ordenação e mudança de estado por drag-and-drop. O painel lateral reúne detalhes, comentários, ficheiros e atividade.
- **Calendar:** vistas Week e Month, seleção de calendários pessoais, criação por clique ou arrasto e indicadores discretos de deadlines. No mês, selecionar um dia abre a sua agenda num painel sem sair da grelha. Os participantes determinam em que calendários aparece o evento; o criador pode marcar para outra pessoa sem participar. Eventos podem ser privados ou partilhados com a equipa.
- **Projects:** projetos ativos na sidebar; progresso calculado a partir das tasks, vistas List/Board e painel lateral de task.
- **CRM:** tabela compacta de empresas, estado e última nota. Mudanças de estado exigem nota, que entra na timeline. Eventos marcados na empresa entram no Calendar e na timeline.
- **Capture:** botão permanente ou `⌘K` / `Ctrl+K`, por texto ou ditado quando o browser suportar reconhecimento de voz. Uma frase pode propor vários registos associados. A revisão é sempre obrigatória. Informação ambígua vai para a Inbox.
- **Notas:** na Home, privadas por defeito ou partilhadas com destinatários escolhidos. Só o autor pode editar. As antigas páginas Notes e Inbox redirecionam para Home.
- **Lembretes:** derivados de tarefas, reuniões, follow-ups e prazos de projetos; dispensar ou adiar uma hora. Cada reunião tem um único aviso que evolui de amanhã para hoje, uma hora e dez minutos antes. Os avisos são internos à aplicação.
- **Perfis:** Miguel e Afonso são admins; Vasco, Patrick, Ana e Pedro são engineers. Os novos acessos usam nome@vouga.local e a palavra-passe configurada para a demonstração local. A antiga conta Engineer é preservada com os seus dados.
- **Companion:** `/painel` continua disponível para o companion macOS existente; o botão flutuante foi removido do workspace.

### Barra de menus do macOS

Inclui um companion local em `desktop/macos`. Com o servidor a funcionar:

```sh
bun run desktop:build
open "desktop/macos/build/Vouga OS.app"
```

Requer as Apple Command Line Tools. O símbolo Vouga aparece na barra de menus e abre o painel compacto. Entra com uma das contas admin. A sessão do companion é independente da sessão do browser. [Detalhes e limites](desktop/macos/README.md).

## Captura e voz

O interpretador é **determinístico e local**, sem LLM: propõe tipos, datas e ligações para revisão. Reconhece expressões comuns em português, incluindo dias da semana e datas com mês, e pode criar reunião mais tarefa de preparação na mesma captura. Nunca inventa uma hora ausente. O microfone usa o reconhecimento de voz disponibilizado pelo browser, quando existir; o serviço de transcrição pode depender do fornecedor do browser. Áudio não é guardado no Vouga OS. Se o browser não suportar ditado, o texto continua disponível.

Isto não é interpretação geral de linguagem natural. Frases fora dos padrões ficam na Inbox para tratamento posterior. A associação e o dono devem ser confirmados antes de guardar.

## Estrutura

```text
src/app/           Rotas Next.js, autenticação e endpoints
src/components/    Shell, quatro áreas principais, formulários, captura e painel
src/domain/        Objetos, validação, permissões, tempo e sugestões de captura
src/application/   Casos de uso, autenticação e contratos de integração
src/projections/   Leitura por perfil, lembretes e exportação de calendário
src/persistence/   Repositório local, transações, seed e hashes de passwords
src/foundation/    Tokens visuais e utilitários HTTP
desktop/macos/    Companion nativo da barra de menus
tests/            Regras, permissões, datas, gravação e concorrência
docs/             Análise da origem, arquitetura, produto e operação local
```

## Verificar

```sh
bun run typecheck
bun run lint
bun run test
bun run build
```

`bun run start` executa o build local na mesma porta. Para formatar: `bun run format`.

## O que ainda não está ligado

Google Calendar não recebe reuniões desta edição; a delegação funciona na **agenda interna**. Os PRs são links com estado manual, sem sincronização automática. Os lembretes não são push e não são entregues com a aplicação fechada. O companion requer o servidor local ativo. Integrações e distribuição autónoma do desktop estão descritas em `docs/PRODUCT.md`.

O armazenamento de ficheiro é adequado a esta edição local. Para uso real partilhado, a próxima etapa é um novo backend com autenticação de produção, políticas de acesso, backup e adaptadores de integração. Não apontar esta base ao Supabase anterior nem aplicar as migrations antigas.

[Arquitetura e permissões](docs/ARCHITECTURE.md) · [Análise do código anterior](docs/SOURCE-REVIEW.md) · [Dados locais](docs/LOCAL-DATA.md) · [Verificação](docs/VERIFICATION.md)
