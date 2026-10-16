import type { Member, Store } from "./model";
import { uniqueEvents } from "./calendars";
import { canSeeMeeting, canSeeTask } from "./permissions";
import { isTaskAssignee } from "./team";
import { dateKey, timeLabel } from "./time";

export const busyDayPhrases = [
  "Bom dia! O sucesso não cai do céu. Infelizmente, as tarefas também não.",
  "Mais um dia para fazer história. Ou pelo menos fechar umas tarefas.",
  "Acordaste. Já estás à frente de quem ainda está a dormir.",
  "Hoje pode ser o teu dia. Estatisticamente, algum há de ser.",
  "Grandes coisas começam com pequenos passos. E, geralmente, com café.",
  "Não precisas de mudar o mundo hoje. Mas podes começar por melhorar uma parte.",
  "O teu futuro eu agradece o que fizeres hoje. Não o desiludas.",
  "Confia no processo. Mas confirma se está a funcionar.",
  "A motivação é temporária. As deadlines, infelizmente, não.",
  "Hoje é um excelente dia para surpreender quem duvidou de ti. Incluindo tu.",
  "Bom dia! Se não funciona, é uma oportunidade de melhoria.",
  "O mundo não se vai automatizar sozinho. Pelo menos ainda não.",
  "Hoje é dia de transformar café em soluções.",
  "A vida não tem Ctrl+Z. O Git, felizmente, tem.",
  "Não é um bug. É uma oportunidade de aprendizagem com personalidade.",
  "Mais um dia a construir o futuro. Ainda em versão beta.",
  "Os problemas de ontem são as funcionalidades de amanhã.",
  "Bom dia! Que os teus sistemas sejam estáveis e as reuniões curtas.",
  "Pensa em grande. Implementa em pequeno. Faz deploy.",
  "Ainda não inventámos uma IA que trabalhe por nós. Por isso, bom dia!",
  "Hoje é sexta-feira em algum lugar. Provavelmente não aqui.",
  "Bom dia! A tua presença foi requisitada pelo capitalismo.",
  "Mais um dia para provar que não somos só bons a fazer apresentações.",
  "A produtividade começa na mente. E acaba quando alguém marca uma reunião.",
  "Trabalha com inteligência, não apenas com esforço. Os dois também é válido.",
  "O impossível demora um pouco mais. Especialmente sem documentação.",
  "Não deixes para amanhã o que podes delegar hoje. Com responsabilidade.",
  "O teu calendário acredita em ti. Talvez demasiado.",
  "Hoje vamos dar 100%. Ou pelo menos os 80% que fazem a diferença.",
  "Sê a razão pela qual alguém diz: afinal, isto era possível.",
  "Não tens de ser extraordinário todos os dias. Mas podes fazer algo extraordinário hoje.",
  "O progresso raramente faz barulho. Continua.",
  "O segredo não é ter sempre vontade. É aparecer mesmo quando não tens.",
  "Hoje não precisas de saber tudo. Só de estar disposto a aprender.",
  "Pequenas melhorias. Grandes consequências.",
  "As melhores ideias começam muitas vezes com um 'e se...?'",
  "Daqui a um ano, vais agradecer por não teres desistido hoje.",
  "A sorte costuma encontrar quem está a construir alguma coisa.",
  "Não esperes pelo momento perfeito. Faz uma primeira versão.",
  "O melhor dia para começar foi ontem. O segundo melhor é depois do café.",
  "Bom dia, engenheiro do caos. Vamos dar-lhe alguma estrutura?",
  "Outro dia, outra oportunidade para fingir que temos tudo sob controlo.",
  "O futuro é incerto. O teu calendário, nem tanto.",
  "A tua cama acredita em ti. Mas nós precisamos mais.",
  "Dizem que o céu é o limite. Claramente nunca trabalharam com APIs.",
  "Acorda com ambição. Executa com método. Reclama só um bocadinho.",
  "Hoje vamos construir algo incrível. Primeiro, encontrar o carregador.",
  "Ninguém sabe exatamente o que está a fazer. Alguns é que têm melhores dashboards.",
  "O teu potencial é ilimitado. O teu tempo, infelizmente, não.",
  "Bom dia! Ainda não somos a próxima Google. Mas a Google também começou numa garagem.",
] as const;
export const emptyDayPhrases = [
  "Agenda vazia? Mau sinal. Ou és um génio da produtividade ou esqueceste-te do OS.",
  "Zero tarefas hoje? Que vida é essa que andas a levar?",
  "O OS está preocupado contigo. Está tudo bem?",
  "Nada planeado? Ou és muito eficiente ou estamos perante um problema.",
  "Bom dia! O teu calendário está tão vazio que até faz eco.",
  "Acordaste sem tarefas? O departamento de produtividade quer falar contigo.",
  "Nenhuma tarefa? Suspeito. Muito suspeito.",
  "O teu calendário está de férias. Tu também?",
  "Zero compromissos. Confiança máxima. Organização questionável.",
  "Se não está no OS, aconteceu sequer?",
  "Zero tarefas registadas. Vou assumir que estás a preparar algo revolucionário.",
  "Tens o dia livre? Excelente. Agora explica isso ao Roque.",
  "A tua produtividade é um mistério. Literalmente, não há registos.",
  "Nada para hoje? Vou fingir que acredito.",
  "O teu potencial é enorme. O teu calendário ainda não sabe.",
  "Hoje tens uma página em branco. Faz com que valha a pena.",
  "As melhores ideias não aparecem no calendário. Mas deviam acabar lá.",
  "Sem tarefas, sem reuniões, sem desculpas. O que vamos construir hoje?",
  "O OS não consegue organizar aquilo que te esqueces de registar. Just saying.",
] as const;

// Pure templates: no Agent, transcription or provider call.
export function dailySummary(
  data: Store,
  member: Member,
  now: string,
  random = Math.random,
) {
  const today = dateKey(now);
  const events = uniqueEvents(
    data.meetings.filter(
      (event) =>
        !event.cancelled &&
        canSeeMeeting(member, event) &&
        dateKey(event.startsAt) === today &&
        (event.participantIds.includes(member.id) ||
          (event.calendarKey === "personal" &&
            event.calendarOwnerId === member.id)),
    ),
  ).sort(
    (a, b) =>
      Number(!!b.allDay) - Number(!!a.allDay) ||
      a.startsAt.localeCompare(b.startsAt),
  );
  const tasks = data.tasks
    .filter(
      (task) =>
        task.status !== "done" &&
        task.dueOn === today &&
        isTaskAssignee(task, member.id) &&
        canSeeTask(member, task, data),
    )
    .sort((a, b) => a.title.localeCompare(b.title, "pt"));
  const hasWork = events.length > 0 || tasks.length > 0;
  const phrases = hasWork ? busyDayPhrases : emptyDayPhrases;
  const phrase =
    phrases[
      Math.min(
        phrases.length - 1,
        Math.max(0, Math.floor(random() * phrases.length)),
      )
    ];
  const greeting = `Bom dia, ${member.name}!`;
  const sections = hasWork
    ? [
        greeting,
        phrase,
        ...(events.length
          ? [
              "Reuniões\n" +
                events
                  .map(
                    (event) =>
                      `${event.allDay ? "Todo o dia" : timeLabel(event.startsAt)} · ${event.title}`,
                  )
                  .join("\n"),
            ]
          : []),
        ...(tasks.length
          ? [
              "Tarefas para hoje\n" +
                tasks.map((task) => `• ${task.title}`).join("\n"),
            ]
          : []),
      ]
    : [greeting, "Não tens nada planeado para hoje.", phrase];
  return sections.join("\n\n");
}

// Keep every entry when a busy day's digest exceeds Telegram's message limit.
export function dailySummaryParts(text: string, name: string) {
  const parts: string[] = [];
  let part = "";
  const continuation = `Bom dia, ${name}!\n\n`;
  for (const line of text.split("\n")) {
    if (part && part.length + line.length + 1 > 3900) {
      parts.push(part);
      part = continuation;
    }
    part += (part ? "\n" : "") + line;
  }
  if (part) parts.push(part);
  return parts;
}
