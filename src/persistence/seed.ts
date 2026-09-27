import type { Entity, Store } from "@/domain/model";
import { addDays, dateKey, toInstant } from "@/domain/time";
import { hashPassword } from "./password";

const engineers = ["Vasco", "Patrick", "Ana", "Pedro"];
export function addTeamProfiles(data: Store, password: string) {
  for (const name of engineers) {
    const id = name.toLowerCase();
    if (data.members.some((member) => member.id === id)) continue;
    data.members.push({
      id,
      name,
      email: `${id}@vouga.local`,
      role: "engineer",
    });
    data.accounts.push({ memberId: id, passwordHash: hashPassword(password) });
  }
}

export function createSeed(
  password: string,
  now = new Date().toISOString(),
): Store {
  const today = dateKey(now);
  const base = (id: string, by = "miguel"): Entity => ({
    id,
    version: 1,
    createdAt: now,
    updatedAt: now,
    createdBy: by,
  });
  const at = (day: string, time: string) => toInstant(`${day}T${time}`)!;
  return {
    schemaVersion: 5,
    activity: [],
    externalConnections: [],
    integrationJobs: [],
    pendingActions: [],
    notificationDeliveries: [],
    oauthStates: [],
    telegramLinks: [],
    agentReceipts: [],
    taskComments: [],
    taskAttachments: [],
    taskActivity: [],
    contacts: [],
    inbox: [],
    revision: 1,
    members: [
      {
        id: "miguel",
        name: "Miguel",
        email: "miguel@vouga.local",
        role: "admin",
      },
      {
        id: "afonso",
        name: "Roque",
        email: "roque@vouga.local",
        role: "admin",
      },
      ...engineers.map((name) => ({
        id: name.toLowerCase(),
        name,
        email: `${name.toLowerCase()}@vouga.local`,
        role: "engineer" as const,
      })),
    ],
    accounts: [
      "miguel",
      "afonso",
      ...engineers.map((name) => name.toLowerCase()),
    ].map((memberId) => ({
      memberId,
      passwordHash: hashPassword(password),
    })),
    sessions: [],
    captureReceipts: [],
    reminderReceipts: [],
    organizations: [
      {
        ...base("vale"),
        name: "Fábrica do Vale",
        person: "Joana Martins",
        email: "joana@example.com",
        phone: "",
        stage: "client",
        ownerId: "miguel",
        nextStep: "Validar o primeiro fluxo com a equipa",
        followUpOn: addDays(today, 1),
        archived: false,
      },
      {
        ...base("norte"),
        name: "Norte Metal",
        person: "Pedro Costa",
        email: "pedro@example.com",
        phone: "",
        stage: "proposal",
        ownerId: "vasco",
        nextStep: "Retomar a proposta de diagnóstico",
        followUpOn: today,
        archived: false,
      },
      {
        ...base("atlas"),
        name: "Atlas Packaging",
        person: "Sofia Rocha",
        email: "sofia@example.com",
        phone: "",
        stage: "contacted",
        ownerId: "afonso",
        nextStep: "Marcar visita à fábrica",
        followUpOn: addDays(today, 2),
        archived: false,
      },
    ],
    projects: [
      {
        ...base("operations"),
        name: "Operações, com clareza",
        objective: "Dar à equipa uma visão única dos pedidos e da produção.",
        nextStep: "Validar o fluxo de entrada de pedidos com a Joana.",
        status: "active",
        ownerId: "miguel",
        memberIds: ["miguel", "vasco"],
        organizationId: "vale",
        dueOn: addDays(today, 7),
        repositoryUrl: "",
      },
      {
        ...base("discovery"),
        name: "Diagnóstico industrial",
        objective: "Mapear os processos e escolher a primeira melhoria.",
        nextStep: "Confirmar a visita e as pessoas que participam.",
        status: "waiting",
        ownerId: "afonso",
        memberIds: ["afonso"],
        organizationId: "atlas",
        dueOn: addDays(today, 12),
        repositoryUrl: "",
      },
    ],
    tasks: [
      {
        ...base("proposal"),
        title: "Rever a proposta para a Norte Metal",
        body: "Confirmar o âmbito antes do próximo contacto.",
        status: "todo",
        ownerId: "miguel",
        dueOn: today,
        projectId: null,
        organizationId: "norte",
      },
      {
        ...base("flow"),
        title: "Validar o fluxo de entrada de pedidos",
        body: "Levar o percurso completo para a conversa com a Joana.",
        status: "doing",
        ownerId: "vasco",
        dueOn: today,
        projectId: "operations",
        organizationId: "vale",
      },
      {
        ...base("access"),
        title: "Obter acesso aos dados de produção",
        body: "A aguardar o ficheiro de exemplo do cliente.",
        status: "blocked",
        ownerId: "vasco",
        dueOn: addDays(today, -1),
        projectId: "operations",
        organizationId: "vale",
      },
      {
        ...base("visit"),
        title: "Preparar a visita à Atlas",
        body: "",
        status: "todo",
        ownerId: "afonso",
        dueOn: addDays(today, 2),
        projectId: "discovery",
        organizationId: "atlas",
      },
    ],
    meetings: [
      {
        ...base("alignment"),
        title: "Alinhamento da equipa",
        kind: "meeting",
        body: "Próximos passos das entregas da semana.",
        startsAt: at(today, "10:00"),
        endsAt: at(today, "10:30"),
        calendarOwnerId: "miguel",
        participantIds: ["miguel", "afonso", "vasco"],
        organizationId: null,
        projectId: null,
        cancelled: false,
        reminderMinutes: 10,
      },
      {
        ...base("review"),
        title: "Revisão do fluxo de pedidos",
        kind: "meeting",
        body: "Conversa com a Joana · dados de exemplo",
        startsAt: at(today, "15:00"),
        endsAt: at(today, "15:45"),
        calendarOwnerId: "miguel",
        participantIds: ["miguel", "vasco"],
        organizationId: "vale",
        projectId: "operations",
        cancelled: false,
        reminderMinutes: 10,
      },
      {
        ...base("industry-event"),
        title: "Encontro da indústria",
        kind: "event",
        body: "",
        startsAt: at(addDays(today, 1), "17:00"),
        endsAt: at(addDays(today, 1), "18:00"),
        calendarOwnerId: "afonso",
        participantIds: ["afonso", "miguel"],
        organizationId: null,
        projectId: null,
        cancelled: false,
        reminderMinutes: 10,
      },
    ],
    interactions: [
      {
        ...base("conversation"),
        organizationId: "norte",
        body: "A equipa quer começar por perceber onde perde mais tempo. Proposta de diagnóstico enviada.",
        channel: "email",
      },
    ],
    updates: [
      {
        ...base("initial-update", "vasco"),
        projectId: "operations",
        body: "Primeiro fluxo preparado. Falta validar os campos com o cliente.",
      },
    ],
    notes: [
      {
        ...base("important"),
        title: "Antes da conversa com a Joana",
        body: "Começar pelo percurso de um pedido real.\n\nPerceber quem recebe, quem valida e onde o contexto se perde. Só depois discutir a solução.",
        projectId: "operations",
        pinned: true,
        archived: false,
        visibility: "team",
      },
      {
        ...base("principle"),
        title: "Uma regra para este workspace",
        body: "Capturar rápido. Organizar automaticamente. Mostrar apenas o que importa.\n\nAs organizações e os projetos deste ambiente são exemplos fictícios.",
        projectId: null,
        pinned: false,
        archived: false,
        visibility: "team",
      },
    ],
    reminders: [],
    pullRequests: [],
  };
}
