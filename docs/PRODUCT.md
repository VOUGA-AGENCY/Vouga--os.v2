# Estrutura do produto

## O compromisso desta versão

Abrir, perceber o que importa e agir. Capturar uma ideia sem escolher primeiro o módulo. Dois perfis, cinco áreas e um painel compacto para o admin. A versão inicial usa texto; a transição para voz está prevista desde o limite de entrada.

### Admin

Miguel e Afonso encontram prioridades da empresa, tarefas atrasadas/bloqueadas, próximos compromissos, prazos de projetos, conversas por retomar e notas importantes. Delegam pelo responsável da tarefa e pelo titular do calendário. O painel mostra a próxima reunião pessoal e as prioridades operacionais sem obrigar a abrir o workspace completo.

### Engineer

O ponto de partida são as próprias tarefas. O mini CRM mantém organizações, contacto principal, estados, próximos passos, datas e histórico. Nos projetos acessíveis encontra objetivo, próxima ação, tarefas, atualizações e PRs, sem financeiro ou administração.

## Captura por texto

Exemplos:

```text
Preparar a proposta para a Norte Metal amanhã
Reunião com a Fábrica do Vale sexta às 14h30 para o Miguel
Nota: o cliente quer começar pelo processo de entrada de pedidos
Lembrete: ligar ao fornecedor amanhã às 9h
Atualização: Operações, com clareza — fluxo validado com a equipa
Contacto: Nova organização
```

Cada linha propõe um registo. A revisão permite mudar o tipo, o texto, a pessoa, a data e as ligações adequadas ao tipo. O sistema não inventa pessoas nem cria organizações por mera correspondência incerta. Uma frase livre não reconhecida propõe uma nota. A captura não interpreta automaticamente todas as ações de um parágrafo; separar intenções por linha é a convenção desta versão.

## Próximos incrementos

1. **Voz:** captar áudio apenas por ação explícita, obter transcrição pt-PT, marcar incertezas, passar ao mesmo fluxo de revisão. Definir retenção de áudio; por defeito, guardar texto e eliminar o áudio após transcrição. Não autorizar ações externas diretamente a partir de uma frase ambígua.
2. **Calendário externo delegado:** selecionar a conta/calendário de destino pelo titular e preservar quem pediu e quem criou. Estado visível `pending/synced/error`, retry idempotente e reconciliação. A reunião interna não pode desaparecer por falha Google.
3. **GitHub:** ler PRs do repositório associado com credenciais no servidor, refletir estado real e indicar última sincronização. A ligação manual atual continua válida como referência.
4. **Lembretes fora da aplicação:** scheduler e canal de notificação escolhido pela pessoa. Entrega, repetição, deduplicação e confirmação devem ser observáveis antes de prometer avisos com o OS fechado.
5. **Desktop distribuível:** o companion local já abre o painel na barra de menus. Empacotar runtime/servidor, assinar/notarizar e escolher um atalho global. Não instalar arranque automático sem escolha explícita.
6. **Equipa em produção:** novo backend, autenticação real, recuperação de conta, provisionamento, RLS, backup/restauro, observabilidade e política de dados. Validar com a equipa antes de importar dados anteriores.

## Fora desta estrutura

Finanças, Governance, gráficos de contexto, sprints, decisões formais, roadmap, vault, uploads, documentos Office e uma plataforma de automações generalista. A profundidade futura deve aparecer como contexto dentro do trabalho, e não como mais áreas de navegação.

## Critérios de aceitação

- Entrar com cada perfil mostra a experiência e os dados permitidos no servidor.
- Criar uma tarefa exige apenas um título; concluir é uma ação direta.
- Um engineer consegue criar uma reunião no calendário interno de um admin.
- Contacto, estado, conversa, próximo passo e data ficam ligados.
- Projetos mostram tarefas, estado, atualizações e PRs com limites de sincronização claros.
- Registos sobrevivem a reload/reinício, e uma captura repetida não duplica objetos.
- Captura incerta conserva o texto e pede revisão.
- Não existe ligação ao ambiente anterior nem envio para Git.
