import { captureChanges } from "@/services/activity-service";
import type { ActivityEvent } from "@/domain/integration-model";
import { randomUUID } from "node:crypto";
import type { Entity, Member, Store } from "@/domain/model";
import {
  captureKinds,
  projectStatuses,
  stages,
  taskStatuses,
} from "@/domain/model";
import {
  allow,
  canEditMeeting,
  canSeeNote,
  canSeeProject,
  canSeeTask,
} from "@/domain/permissions";
import {
  AppError,
  boolean,
  choice,
  record,
  stringList,
  text,
  version,
} from "@/domain/validation";
import { addDays, dateKey, isDateKey, toInstant } from "@/domain/time";
import { alertsFor } from "@/projections/workspace";

type Values = Record<string, unknown>;
function executeCore(
  data: Store,
  actor: Member,
  input: unknown,
  now = new Date().toISOString(),
): { message: string; ids?: string[] } {
  const command = record(input);
  const action = text(command.action, "Ação", 50);
  const me = data.members.find((m) => m.id === actor.id);
  if (!me) throw new AppError("Sessão inválida.", 401);
  const v = record(command.values ?? {});
  const base = (): Entity => ({
    id: randomUUID(),
    version: 1,
    createdAt: now,
    updatedAt: now,
    createdBy: me.id,
  });
  const touch = (e: Entity) => {
    e.version++;
    e.updatedAt = now;
  };
  const find = <T extends Entity>(items: T[], id: unknown): T => {
    const item = items.find((x) => x.id === id);
    if (!item) throw new AppError("Registo não encontrado.", 404);
    return item;
  };
  const member = (value: unknown) => {
    const id = text(value, "Pessoa", 100);
    if (!data.members.some((m) => m.id === id))
      throw new AppError("Seleciona uma pessoa da equipa.");
    return id;
  };
  const projectId = (value: unknown) => {
    if (!value) return null;
    const project = find(data.projects, value);
    allow(canSeeProject(me, project));
    return project.id;
  };
  const organizationId = (value: unknown) =>
    value ? find(data.organizations, value).id : null;
  const day = (value: unknown) => {
    if (!value) return null;
    const s = text(value, "Data", 10);
    if (!isDateKey(s)) throw new AppError("Data inválida.");
    return s;
  };
  const instant = (value: unknown) => {
    const s = text(value, "Data e hora", 40);
    const parsed = toInstant(s);
    if (!parsed) throw new AppError("Data ou hora inválida em Lisboa.");
    return parsed;
  };
  const body = (value: unknown) => text(value, "Contexto", 10000, false);
  const owner = (value: unknown, project: string | null) => {
    const id = member(value);
    allow(
      me.role === "admin" ||
        id === me.id ||
        !!data.projects.find(
          (p) =>
            p.id === project &&
            canSeeProject(me, p) &&
            (p.ownerId === id || p.memberIds.includes(id)),
        ),
    );
    return id;
  };
  const saveTask = (values: Values) => {
    const existing = values.id ? find(data.tasks, values.id) : null;
    if (existing) {
      allow(canSeeTask(me, existing, data));
      version(existing, values.version);
    }
    const project = projectId(values.projectId);
    const ownerId = owner(values.ownerId ?? me.id, project);
    if (project) {
      const linkedProject = find(data.projects, project);
      if (
        ownerId !== linkedProject.ownerId &&
        !linkedProject.memberIds.includes(ownerId)
      )
        throw new AppError(
          "Adiciona o responsável à equipa do projeto antes de lhe atribuir a tarefa.",
        );
    }
    const task = {
      ...(existing ?? base()),
      title: text(values.title, "Título", 160),
      body: body(values.body),
      status: choice(
        values.status ?? "todo",
        Object.keys(taskStatuses),
        "Estado",
      ) as keyof typeof taskStatuses,
      ownerId,
      dueOn: day(values.dueOn),
      projectId: project,
      organizationId: organizationId(values.organizationId),
      priority: choice(values.priority ?? existing?.priority ?? "none", ["none", "low", "medium", "high", "urgent"] as const, "Prioridade"),
    };
    if (existing) {
      if (existing.status !== task.status)
        data.taskActivity.push({ ...base(), taskId: existing.id, body: `Estado: ${taskStatuses[existing.status]} → ${taskStatuses[task.status]}` });
      Object.assign(existing, task);
      touch(existing);
    } else {
      data.tasks.push(task);
      data.taskActivity.push({ ...base(), taskId: task.id, body: "Tarefa criada" });
    }
    return task.id;
  };
  const saveMeeting = (values: Values) => {
    const existing = values.id ? find(data.meetings, values.id) : null;
    if (existing) {
      allow(canEditMeeting(me, existing));
      version(existing, values.version);
    }
    const calendarOwnerId = member(values.calendarOwnerId ?? existing?.calendarOwnerId ?? me.id);
    // Engineers can place a requested meeting on an administrator's internal calendar.
    allow(
      me.role === "admin" ||
        calendarOwnerId === me.id ||
        data.members.some(
          (m) => m.id === calendarOwnerId && m.role === "admin",
        ),
    );
    if (existing?.recurringEventId || existing?.allDay) throw new AppError("Edita este evento recorrente ou de dia inteiro no Google Calendar.");
    const startsAt = instant(values.startsAt);
    const endsAt = instant(values.endsAt);
    if (endsAt <= startsAt)
      throw new AppError("O fim tem de ser depois do início.");
    if (Date.parse(endsAt) - Date.parse(startsAt) > 7 * 86400000)
      throw new AppError("O compromisso não pode exceder sete dias.");
    const participants = stringList(values.participantIds ?? existing?.participantIds ?? [calendarOwnerId]);
    if (!participants.length) throw new AppError("Escolhe pelo menos um participante.");
    participants.forEach(member);
    const meeting = {
      ...(existing ?? base()),
      title: text(values.title, "Título", 160),
      body: body(values.body),
      kind: choice(
        values.kind ?? "meeting",
        ["meeting", "event"] as const,
        "Tipo",
      ),
      startsAt,
      endsAt,
      calendarOwnerId,
      participantIds: participants,
      calendarKey: choice(values.calendarKey ?? existing?.calendarKey ?? (values.organizationId && !values.projectId ? "contacto" : "office"), ["office", "contacto"] as const, "Calendário"),
      externalParticipants: (() => { const emails = Array.isArray(values.externalParticipants) ? stringList(values.externalParticipants) : String(values.externalParticipants ?? existing?.externalParticipants?.join(",") ?? "").split(/[,;\s]+/).filter(Boolean); if (emails.length > 50 || emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new AppError("Participantes externos inválidos."); return [...new Set(emails)]; })(),
      organizationId: organizationId(values.organizationId),
      projectId: projectId(values.projectId),
      cancelled: existing?.cancelled ?? false,
      reminderMinutes: 10,
      visibility: choice(values.visibility ?? existing?.visibility ?? "team", ["private", "team"] as const, "Visibilidade"),
    };
    if (existing) {
      Object.assign(existing, meeting);
      touch(existing);
    } else {
      data.meetings.push(meeting);
      if (meeting.organizationId) data.interactions.push({
        ...base(), organizationId: meeting.organizationId, channel: "meeting",
        body: `Evento marcado: ${meeting.title}`, meetingId: meeting.id,
      });
    }
    return meeting.id;
  };
  const saveOrganization = (values: Values) => {
    const existing = values.id ? find(data.organizations, values.id) : null;
    if (existing) version(existing, values.version);
    const email = text(values.email, "Email", 200, false);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new AppError("Email inválido.");
    const name = text(values.name, "Organização", 160);
    if (
      !existing &&
      data.organizations.some(
        (o) => o.name.toLocaleLowerCase("pt") === name.toLocaleLowerCase("pt"),
      )
    )
      throw new AppError(
        "Esta organização já existe. Abre-a para registar a conversa.",
      );
    const item = {
      ...(existing ?? base()),
      name,
      person: text(values.person, "Pessoa", 160, false),
      email,
      phone: text(values.phone, "Telefone", 50, false),
      stage: choice(
        values.stage ?? "new",
        Object.keys(stages),
        "Estado",
      ) as keyof typeof stages,
      ownerId: member(values.ownerId ?? me.id),
      nextStep: text(values.nextStep, "Próximo passo", 500, false),
      followUpOn: day(values.followUpOn),
      archived: boolean(values.archived, existing?.archived ?? false),
    };
    if (existing && item.stage !== existing.stage) {
      const statusNote = text(values.statusNote, "Nota de estado", 10000);
      data.interactions.push({ ...base(), organizationId: existing.id,
        channel: "note", body: statusNote, stageFrom: existing.stage, stageTo: item.stage });
    }
    if (existing) {
      Object.assign(existing, item);
      touch(existing);
    } else data.organizations.push(item);
    return item.id;
  };
  const saveNote = (values: Values) => {
    const existing = values.id ? find(data.notes, values.id) : null;
    if (existing) {
      allow(existing.createdBy === me.id);
      version(existing, values.version);
    }
    const visibility = choice(
      values.visibility ?? existing?.visibility ?? "private",
      ["team", "private", "shared"] as const,
      "Visibilidade",
    );
    if (visibility === "private" && existing)
      allow(existing.createdBy === me.id);
    const recipientIds = visibility === "shared" ? stringList(values.recipientIds ?? existing?.recipientIds ?? []) : [];
    recipientIds.forEach(member);
    if (visibility === "shared" && !recipientIds.length) throw new AppError("Escolhe pelo menos uma pessoa para a nota.");
    const item = {
      ...(existing ?? base()),
      title: text(values.title, "Título", 160),
      body: body(values.body),
      projectId: projectId(values.projectId),
      organizationId: organizationId(values.organizationId),
      meetingId: values.meetingId ? find(data.meetings, values.meetingId).id : null,
      contactId: values.contactId ? find(data.contacts, values.contactId).id : null,
      visibility,
      recipientIds,
      pinned: boolean(values.pinned, existing?.pinned ?? false),
      archived: boolean(values.archived, existing?.archived ?? false),
    };
    if (existing) {
      Object.assign(existing, item);
      touch(existing);
    } else data.notes.push(item);
    return item.id;
  };
  switch (action) {
    case "meeting.participants": {
      const event = find(data.meetings, v.id); allow(canEditMeeting(me, event)); version(event, v.version);
      const participants = stringList(v.participantIds); participants.forEach(member);
      if (!participants.length) throw new AppError("Escolhe pelo menos um participante.");
      event.participantIds = participants; touch(event); return {message:"Participantes associados."};
    }

    case "inbox.save": { data.inbox.push({...base(), ownerId:me.id, body:text(v.body,"Captura",10000),resolved:false}); return {message:"Guardado na Inbox."}; }
    case "task.linkPR": {
      const task = find(data.tasks, v.id); allow(canSeeTask(me, task, data)); version(task, v.version);
      const pr = v.pullRequestId ? find(data.pullRequests, v.pullRequestId) : null;
      if (pr) { allow(pr.projectId === task.projectId); projectId(pr.projectId); }
      task.pullRequestId = pr?.id ?? null; touch(task); return { message: "Pull request associada." };
    }

    case "task.save":
      saveTask(v);
      return { message: "Tarefa guardada." };
    case "task.status": {
      const task = find(data.tasks, v.id);
      allow(canSeeTask(me, task, data));
      version(task, v.version);
      const previous = task.status;
      task.status = choice(
        v.status,
        Object.keys(taskStatuses),
        "Estado",
      ) as keyof typeof taskStatuses;
      touch(task);
      if (previous !== task.status) data.taskActivity.push({ ...base(), taskId: task.id,
        body: `Estado: ${taskStatuses[previous]} → ${taskStatuses[task.status]}` });
      return {
        message:
          task.status === "done" ? "Tarefa concluída." : "Estado atualizado.",
      };
    }
    case "task.comment": {
      const task = find(data.tasks, v.taskId);
      allow(canSeeTask(me, task, data));
      const comment = { ...base(), taskId: task.id, body: text(v.body, "Comentário", 10000) };
      data.taskComments.push(comment);
      touch(task);
      return { message: "Comentário adicionado.", ids: [comment.id] };
    }
    case "task.tomorrow": {
      const task = find(data.tasks, v.id);
      allow(canSeeTask(me, task, data));
      version(task, v.version);
      task.dueOn = addDays(dateKey(now), 1);
      touch(task);
      return { message: "Tarefa adiada para amanhã." };
    }
    case "meeting.save":
      saveMeeting(v);
      return { message: "Guardado no calendário interno." };
    case "meeting.cancel": {
      const item = find(data.meetings, v.id);
      allow(canEditMeeting(me, item));
      version(item, v.version);
      if (item.cancelled && item.googleEventId) throw new AppError("Cria um novo evento para substituir o compromisso cancelado no Google.");
      item.cancelled = !item.cancelled;
      touch(item);
      return {
        message: item.cancelled
          ? "Compromisso cancelado."
          : "Compromisso recuperado.",
      };
    }
    case "organization.save":
      saveOrganization(v);
      return { message: "Contacto guardado." };
    case "organization.stage": {
      const organization = find(data.organizations, v.id);
      version(organization, v.version);
      const stage = choice(v.stage, Object.keys(stages), "Estado") as keyof typeof stages;
      if (stage === organization.stage) return { message: "Estado sem alterações." };
      const note = text(v.note, "Nota de estado", 10000);
      data.interactions.push({ ...base(), organizationId: organization.id,
        channel: "note", body: note, stageFrom: organization.stage, stageTo: stage });
      organization.stage = stage;
      touch(organization);
      return { message: "Estado e nota guardados." };
    }
    case "organization.note": {
      const organization = find(data.organizations, v.id);
      data.interactions.push({ ...base(), organizationId: organization.id,
        channel: "note", body: text(v.body, "Nota", 10000) });
      touch(organization);
      return { message: "Nota adicionada à timeline." };
    }
    case "contact.add": {
      const organizationId = find(data.organizations, v.organizationId).id;
      const contact = {
        ...base(), organizationId,
        name: text(v.name, "Nome", 160),
        email: text(v.email, "Email", 200, false),
        phone: text(v.phone, "Telefone", 50, false),
      };
      data.contacts.push(contact);
      return { message: "Pessoa adicionada à organização.", ids: [contact.id] };
    }
    case "inbox.resolve": {
      const item = find(data.inbox, v.id);
      allow(item.ownerId === me.id);
      item.resolved = true;
      touch(item);
      return { message: "Item tratado." };
    }
    case "interaction.add": {
      const organization = find(data.organizations, v.organizationId);
      version(organization, v.version);
      const nextStage = choice(v.stage ?? organization.stage, Object.keys(stages), "Estado") as keyof typeof stages;
      data.interactions.push({
        ...base(),
        organizationId: organization.id,
        body: text(v.body, "Conversa", 10000),
        channel: choice(
          v.channel ?? "note",
          ["note", "call", "email", "meeting"] as const,
          "Canal",
        ),
        stageFrom: nextStage !== organization.stage ? organization.stage : null,
        stageTo: nextStage !== organization.stage ? nextStage : null,
      });
      organization.nextStep = text(v.nextStep, "Próximo passo", 500, false);
      organization.followUpOn = day(v.followUpOn);
      organization.stage = nextStage;
      touch(organization);
      return { message: "Conversa e próximo passo guardados." };
    }
    case "project.save": {
      const existing = v.id ? find(data.projects, v.id) : null;
      if (existing) {
        allow(canSeeProject(me, existing));
        version(existing, v.version);
      }
      const ownerId = member(v.ownerId ?? me.id);
      if (!existing) allow(me.role === "admin" || ownerId === me.id);
      const memberIds = stringList(v.memberIds ?? [me.id]);
      memberIds.forEach(member);
      if (me.role === "engineer")
        allow(ownerId === me.id || memberIds.includes(me.id));
      const repositoryUrl = text(v.repositoryUrl, "Repositório", 500, false);
      if (
        repositoryUrl &&
        !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/.test(repositoryUrl)
      )
        throw new AppError("Usa o endereço HTTPS do repositório no GitHub.");
      const item = {
        ...(existing ?? base()),
        name: text(v.name, "Nome", 160),
        objective: body(v.objective),
        nextStep: text(v.nextStep, "Próximo passo", 500, false),
        status: choice(
          v.status ?? "active",
          Object.keys(projectStatuses),
          "Estado",
        ) as keyof typeof projectStatuses,
        ownerId,
        memberIds,
        organizationId: organizationId(v.organizationId),
        dueOn: day(v.dueOn),
        repositoryUrl,
      };
      if (existing) {
        Object.assign(existing, item);
        touch(existing);
      } else data.projects.push(item);
      return { message: "Projeto guardado." };
    }
    case "project.update": {
      const id = projectId(v.projectId);
      if (!id) throw new AppError("Escolhe o projeto.");
      data.updates.push({
        ...base(),
        projectId: id,
        body: text(v.body, "Atualização", 10000),
      });
      return { message: "Atualização registada." };
    }
    case "note.save":
      saveNote(v);
      return { message: "Nota guardada." };
    case "note.pin": {
      const note = find(data.notes, v.id);
      allow(canSeeNote(me, note, data));
      version(note, v.version);
      note.pinned = !note.pinned;
      touch(note);
      return {
        message: note.pinned
          ? "Nota destacada em Hoje."
          : "Nota retirada dos destaques.",
      };
    }
    case "pr.save": {
      const existing = v.id ? find(data.pullRequests, v.id) : null;
      if (existing) {
        projectId(existing.projectId);
        version(existing, v.version);
      }
      const id = projectId(v.projectId);
      if (!id) throw new AppError("Escolhe o projeto.");
      const url = text(v.url, "Link do pull request", 500);
      const match =
        /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)\/?$/.exec(
          url,
        );
      if (!match)
        throw new AppError(
          "Usa um link GitHub no formato https://github.com/equipa/repo/pull/123.",
        );
      if (
        data.pullRequests.some(
          (pr) =>
            pr.id !== existing?.id &&
            pr.url.replace(/\/$/, "") === url.replace(/\/$/, ""),
        )
      )
        throw new AppError("Este pull request já está ligado.");
      const item = {
        ...(existing ?? base()),
        projectId: id,
        title: text(v.title, "Título", 160),
        url,
        number: Number(match[3]),
        state: choice(
          v.state ?? "open",
          ["open", "draft", "merged", "closed"] as const,
          "Estado",
        ),
      };
      if (existing) {
        Object.assign(existing, item);
        touch(existing);
      } else data.pullRequests.push(item);
      return {
        message: "Pull request guardado. Estado atualizado manualmente.",
      };
    }
    case "reminder.done": {
      const reminder = find(data.reminders, v.id);
      allow(reminder.ownerId === me.id);
      version(reminder, v.version);
      reminder.done = true;
      touch(reminder);
      return { message: "Lembrete dispensado." };
    }
    case "reminder.ack": {
      const key = text(v.key, "Lembrete", 300);
      const available = alertsFor(
        { ...data, reminderReceipts: [] },
        me,
        now,
      ).some((a) => a.key === key);
      if (!available)
        throw new AppError("Este lembrete já não está ativo.", 409);
      data.reminderReceipts = data.reminderReceipts.filter(
        (r) => !(r.key === key && r.memberId === me.id),
      );
      const snooze = boolean(v.snooze);
      data.reminderReceipts.push({
        key,
        memberId: me.id,
        dismissed: !snooze,
        snoozedUntil: snooze
          ? new Date(Date.parse(now) + 3600000).toISOString()
          : null,
      });
      if (!snooze && key.startsWith("reminder:")) {
        const reminder = data.reminders.find(
          (r) => key.startsWith(`reminder:${r.id}:`) && r.ownerId === me.id,
        );
        if (reminder) {
          reminder.done = true;
          touch(reminder);
        }
      }
      return {
        message: snooze
          ? "Lembrar novamente daqui a uma hora."
          : "Lembrete tratado.",
      };
    }
    case "capture.commit": {
      const key = text(v.key, "Identificador de captura", 100);
      const previous = data.captureReceipts.find(
        (r) => r.memberId === me.id && r.key === key,
      );
      if (previous)
        return { message: "Captura já guardada.", ids: previous.ids };
      if (!Array.isArray(v.drafts) || !v.drafts.length || v.drafts.length > 10)
        throw new AppError("Revê os registos antes de guardar (máximo 10).");
      const ids: string[] = [];
      for (const value of v.drafts) {
        const d = record(value);
        const kind = choice(d.kind, Object.keys(captureKinds), "Tipo");
        if (!d.organizationId && d.organizationName && kind !== "inbox" && kind !== "crm") {
          const name = text(d.organizationName, "Organização", 160);
          const existing = data.organizations.find((organization) =>
            organization.name.toLocaleLowerCase("pt") === name.toLocaleLowerCase("pt"));
          d.organizationId = existing?.id ?? saveOrganization({
            name, person: "", email: "", phone: "", ownerId: d.ownerId,
            stage: "new", nextStep: "", followUpOn: "",
          });
        }
        if (kind === "task") ids.push(saveTask({ ...d, dueOn: d.date }));
        else if (kind === "note") ids.push(saveNote(d));
        else if (kind === "meeting" || kind === "event") {
          const start = instant(
            `${text(d.date, "Data", 10)}T${text(d.time, "Hora", 5)}`,
          );
          const duration = Number(d.duration);
          if (!Number.isInteger(duration) || duration < 5 || duration > 1440)
            throw new AppError("Escolhe uma duração entre 5 e 1440 minutos.");
          const end = new Date(
            Date.parse(start) + duration * 60000,
          ).toISOString();
          // Convert back to Lisbon wall time for the common validation path.
          ids.push(
            saveMeeting({
              ...d,
              kind,
              calendarOwnerId: d.ownerId,
              participantIds: [d.ownerId || me.id],
              startsAt: `${d.date}T${d.time}`,
              endsAt: localTime(end),
            }),
          );
        } else if (kind === "contact") {
          const id = organizationId(d.organizationId);
          if (id) {
            const org = find(data.organizations, id);
            data.interactions.push({
              ...base(),
              organizationId: id,
              channel: "note",
              body: text(d.body || d.title, "Conversa", 10000),
            });
            if (d.nextStep)
              org.nextStep = text(d.nextStep, "Próximo passo", 500);
            if (d.date) org.followUpOn = day(d.date);
            if (d.person && !data.contacts.some((contact) =>
              contact.organizationId === id && contact.name.toLocaleLowerCase("pt") === String(d.person).toLocaleLowerCase("pt"))) {
              const contact = { ...base(), organizationId: id,
                name: text(d.person, "Pessoa", 160), email: "", phone: "" };
              data.contacts.push(contact);
              if (!org.person) org.person = contact.name;
            }
            touch(org);
            ids.push(id);
          } else
            ids.push(
              saveOrganization({ ...d, name: d.title, followUpOn: d.date }),
            );
        } else if (kind === "crm") {
          const id = organizationId(d.organizationId);
          if (!id) throw new AppError("Escolhe uma organização existente para atualizar o CRM.");
          const org = find(data.organizations, id);
          const stage = choice(d.stage, Object.keys(stages), "Estado") as keyof typeof stages;
          const note = text(d.body, "Nota de estado", 10000);
          if (stage !== org.stage) {
            data.interactions.push({ ...base(), organizationId: id, channel: "note", body: note,
              stageFrom: org.stage, stageTo: stage });
            org.stage = stage;
          } else data.interactions.push({ ...base(), organizationId: id, channel: "note", body: note });
          touch(org);
          ids.push(id);
        } else if (kind === "update") {
          const id = projectId(d.projectId);
          if (!id) throw new AppError("Escolhe o projeto da atualização.");
          const update = {
            ...base(),
            projectId: id,
            body: text(d.body || d.title, "Atualização", 10000),
          };
          data.updates.push(update);
          ids.push(update.id);
        } else if (kind === "reminder") {
          const reminder = {
            ...base(),
            title: text(d.title, "Lembrete", 160),
            ownerId: owner(d.ownerId, null),
            at: instant(
              `${text(d.date, "Data", 10)}T${text(d.time, "Hora", 5)}`,
            ),
            done: false,
          };
          data.reminders.push(reminder);
          ids.push(reminder.id);
        } else if (kind === "inbox") {
          const item = { ...base(), body: text(d.body || d.title, "Captura", 10000),
            ownerId: me.id, resolved: false };
          data.inbox.push(item);
          ids.push(item.id);
        }
      }
      data.captureReceipts.push({ memberId: me.id, key, ids });
      return {
        message:
          ids.length === 1
            ? "Registo guardado."
            : `${ids.length} registos guardados.`,
        ids,
      };
    }
    default:
      throw new AppError("Ação desconhecida.");
  }
}

import { localDateTime as localTime } from "@/domain/time";

export function executeCommand(data: Store, actor: Member, input: unknown, now = new Date().toISOString(), source: ActivityEvent["source"] = "os") {
  const before = structuredClone(data);
  const result = executeCore(data, actor, input, now);
  captureChanges(data, before, actor, source, now);
  return result;
}
