import { isActiveMember, isBoardMember } from "@/domain/team";
import { queueCreationNotices } from "@/services/creation-notifications";
import { captureChanges } from "@/services/activity-service";
import type { ActivityEvent } from "@/domain/integration-model";
import { randomUUID } from "node:crypto";
import type { Entity, Member, PullRequest, Store } from "@/domain/model";
import {
  captureKinds,
  projectStatuses,
  siteKinds,
  stages,
  taskSizes,
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
  const action = text(command.action, "Action", 50);
  const me = data.members.find((m) => m.id === actor.id);
  if (!me || !isActiveMember(me)) throw new AppError("Invalid session.", 401);
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
    if (!item) throw new AppError("Record not found.", 404);
    return item;
  };
  const findMember = (id: string) => data.members.find((m) => m.id === id)!;
  const member = (value: unknown) => {
    const id = text(value, "Person", 100);
    if (!data.members.some((m) => m.id === id && isActiveMember(m)))
      throw new AppError("Select a team member.");
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
    const s = text(value, "Date", 10);
    if (!isDateKey(s)) throw new AppError("Invalid date.");
    return s;
  };
  const instant = (value: unknown) => {
    const s = text(value, "Date and time", 40);
    const parsed = toInstant(s);
    if (!parsed) throw new AppError("Invalid date or time in Lisbon.");
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
    const visibility = choice(
      values.visibility ?? existing?.visibility ?? "team",
      ["private", "team", "board"] as const,
      "Visibility",
    );
    const project =
      visibility !== "team"
        ? null
        : values.projectId !== undefined
          ? projectId(values.projectId)
          : (existing?.projectId ?? null);

    const rawAssignees: string[] = Array.isArray(values.assigneeIds)
      ? values.assigneeIds.map(String).filter(Boolean)
      : typeof values.assigneeIds === "string"
        ? values.assigneeIds
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : values.ownerId
          ? [String(values.ownerId)]
          : existing?.assigneeIds?.length
            ? existing.assigneeIds
            : existing?.ownerId
              ? [existing.ownerId]
              : [me.id];

    const assigneeIds = rawAssignees.length
      ? [...new Set(rawAssignees)]
      : [me.id];
    assigneeIds.forEach((id) => owner(id, project));
    if (visibility === "board") {
      allow(isBoardMember(me));
      if (assigneeIds.some((id) => !isBoardMember(findMember(id))))
        throw new AppError(
          "Board tasks can only be assigned to Miguel and Roque.",
        );
    }

    if (
      visibility === "private" &&
      (assigneeIds.length !== 1 || assigneeIds[0] !== me.id)
    )
      throw new AppError("A private task must be assigned to you.");

    if (project) {
      const linkedProject = find(data.projects, project);
      for (const aId of assigneeIds) {
        if (
          aId !== linkedProject.ownerId &&
          !linkedProject.memberIds.includes(aId)
        )
          throw new AppError(
            "Add the assignee to the project team before assigning this task.",
          );
      }
    }
    const ownerId = assigneeIds[0];

    const taskStatus = choice(
      values.status ?? existing?.status ?? "todo",
      Object.keys(taskStatuses),
      "Status",
    ) as keyof typeof taskStatuses;

    let pullRequestId =
      values.pullRequestId !== undefined
        ? values.pullRequestId
          ? String(values.pullRequestId)
          : null
        : (existing?.pullRequestId ?? null);

    if (values.pullRequestUrl && typeof values.pullRequestUrl === "string") {
      const url = values.pullRequestUrl.trim();
      if (url) {
        const match =
          /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)\/?$/.exec(
            url,
          );
        if (!match) {
          throw new AppError(
            "Use a GitHub link in the format https://github.com/team/repo/pull/123.",
          );
        }
        let pr = data.pullRequests.find(
          (p) => p.url.replace(/\/$/, "") === url.replace(/\/$/, ""),
        );
        if (!pr) {
          pr = {
            ...base(),
            projectId: project ?? existing?.projectId ?? "",
            number: Number(match[3]),
            title: `PR #${match[3]}`,
            url,
            state: "open",
            author: me.name,
            branch: "main",
          };
          data.pullRequests.push(pr);
        }
        pullRequestId = pr.id;
      }
    }

    if (pullRequestId && (taskStatus === "todo" || taskStatus === "backlog")) {
      throw new AppError(
        "Pull requests can only be linked when the task is in progress.",
      );
    }

    const task = {
      ...(existing ?? base()),
      visibility,
      title: text(values.title ?? existing?.title, "Title", 160),
      body: body(values.body ?? existing?.body),
      status: taskStatus,
      ownerId,
      assigneeIds,
      dueOn: day(values.dueOn === undefined ? existing?.dueOn : values.dueOn),
      projectId: project,
      organizationId: organizationId(
        values.organizationId === undefined
          ? existing?.organizationId
          : values.organizationId,
      ),
      priority: choice(
        values.priority ?? existing?.priority ?? "none",
        ["none", "low", "medium", "high", "urgent"] as const,
        "Priority",
      ),
      size: (() => {
        const raw = values.size !== undefined ? values.size : existing?.size;
        if (!raw || raw === "" || raw === "none") return null;
        return choice(
          String(raw).toLowerCase(),
          Object.keys(taskSizes) as (keyof typeof taskSizes)[],
          "Size",
        );
      })(),
      pullRequestId,
      issueNumber:
        values.issueNumber !== undefined
          ? values.issueNumber
            ? Number(values.issueNumber)
            : null
          : (existing?.issueNumber ?? null),
      issueUrl:
        values.issueUrl !== undefined
          ? values.issueUrl
            ? String(values.issueUrl).trim()
            : null
          : (existing?.issueUrl ?? null),
    };
    if (existing) {
      if (existing.status !== task.status)
        data.taskActivity.push({
          ...base(),
          taskId: existing.id,
          body: `Status: ${taskStatuses[existing.status]} → ${taskStatuses[task.status]}`,
        });
      if (existing.size !== task.size && (task.size || existing.size))
        data.taskActivity.push({
          ...base(),
          taskId: existing.id,
          body: `Size: ${existing.size ? existing.size.toUpperCase() : "none"} → ${task.size ? task.size.toUpperCase() : "none"}`,
        });
      Object.assign(existing, task);
      touch(existing);
    } else {
      data.tasks.push(task);
      data.taskActivity.push({
        ...base(),
        taskId: task.id,
        body: "Task created",
      });
    }
    return task.id;
  };
  const saveMeeting = (values: Values, trustedGroupId?: string) => {
    const existing = values.id ? find(data.meetings, values.id) : null;
    if (existing) {
      allow(canEditMeeting(me, existing));
      version(existing, values.version);
    }
    const calendarOwnerId = member(
      values.calendarOwnerId ?? existing?.calendarOwnerId ?? me.id,
    );
    const calendarKey = choice(
      values.calendarKey ??
        existing?.calendarKey ??
        (values.organizationId
          ? "contacto"
          : me.role === "admin"
            ? "office"
            : "personal"),
      ["office", "contacto", "personal"] as const,
      "Calendar",
    );
    allow(
      me.role === "admin" ||
        calendarKey === "contacto" ||
        (calendarKey === "personal" && calendarOwnerId === me.id),
    );
    const allDay = boolean(values.allDay, existing?.allDay ?? false);
    let startsAt: string;
    let endsAt: string;
    if (allDay) {
      // All-day ranges are stored with an exclusive end: the agenda reads the last
      // covered day as `endsAt - 1ms`. A range that begins and ends on the same day
      // therefore still covers that whole day, so it must stop at the next midnight.
      const firstDay = dateKey(instant(values.startsAt));
      const lastDay = dateKey(instant(values.endsAt));
      if (lastDay < firstDay)
        throw new AppError("The end must be after the start.");
      startsAt = instant(`${firstDay}T00:00`);
      endsAt = instant(
        `${lastDay === firstDay ? addDays(firstDay, 1) : lastDay}T00:00`,
      );
    } else {
      startsAt = instant(values.startsAt);
      endsAt = instant(values.endsAt);
      if (endsAt <= startsAt)
        throw new AppError("The end must be after the start.");
    }
    if (Date.parse(endsAt) - Date.parse(startsAt) > 7 * 86400000)
      throw new AppError("The event cannot exceed seven days.");
    const participants = stringList(
      values.participantIds ?? existing?.participantIds ?? [calendarOwnerId],
    );
    if (calendarKey === "personal" && !participants.includes(calendarOwnerId))
      participants.push(calendarOwnerId);
    participants.forEach(member);
    const meeting = {
      ...(existing ?? base()),
      title: text(values.title ?? existing?.title, "Title", 160),
      body: body(values.body ?? existing?.body),
      kind: choice(
        values.kind ?? "meeting",
        ["meeting", "event"] as const,
        "Type",
      ),
      startsAt,
      endsAt,
      calendarOwnerId,
      participantIds: participants,
      calendarKey,
      externalParticipants: (() => {
        const emails = Array.isArray(values.externalParticipants)
          ? stringList(values.externalParticipants)
          : String(
              values.externalParticipants ??
                existing?.externalParticipants?.join(",") ??
                "",
            )
              .split(/[,;\s]+/)
              .filter(Boolean);
        if (
          emails.length > 50 ||
          emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        )
          throw new AppError("Invalid external participants.");
        return [...new Set(emails)];
      })(),
      organizationId: organizationId(
        values.organizationId === undefined
          ? existing?.organizationId
          : values.organizationId,
      ),
      projectId: projectId(values.projectId),
      groupId: trustedGroupId ?? existing?.groupId,
      allDay: boolean(values.allDay, existing?.allDay ?? false),
      cancelled: existing?.cancelled ?? false,
      reminderMinutes: 10,
      visibility: choice(
        values.visibility ?? existing?.visibility ?? "team",
        ["private", "team"] as const,
        "Visibility",
      ),
    };
    if (existing) {
      Object.assign(existing, meeting);
      touch(existing);
    } else {
      data.meetings.push(meeting);
      if (meeting.organizationId)
        data.interactions.push({
          ...base(),
          organizationId: meeting.organizationId,
          channel: "meeting",
          body: `Event scheduled: ${meeting.title}`,
          meetingId: meeting.id,
        });
    }
    return meeting.id;
  };
  const coordinates = (value: unknown) => {
    if (value === null) return undefined;
    const { lat, lng } = (value ?? {}) as { lat?: unknown; lng?: unknown };
    // Mainland Portugal, Madeira and the Azores.
    if (typeof lat !== "number" || typeof lng !== "number" || lat < 29 || lat > 43 || lng < -32 || lng > -6)
      throw new AppError("Coordenadas inválidas.");
    return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
  };
  const nif = (value: unknown) => {
    const digits = text(value, "NIF", 20, false).replace(/\s/g, "");
    if (!digits) return undefined;
    if (!/^\d{9}$/.test(digits)) throw new AppError("NIF inválido: são 9 dígitos.");
    const sum = [...digits.slice(0, 8)].reduce((total, digit, index) => total + Number(digit) * (9 - index), 0);
    const check = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (check !== Number(digits[8])) throw new AppError("NIF inválido: o dígito de controlo não confere.");
    return digits;
  };
  const siteKind = (value: unknown) => value ? choice(value, Object.keys(siteKinds), "Tipo de instalação") as keyof typeof siteKinds : undefined;
  const sites = (value: unknown) => {
    if (!Array.isArray(value)) throw new AppError("Instalações inválidas.");
    if (value.length > 10) throw new AppError("Máximo de 10 instalações por empresa.");
    return value.map((site: Values) => ({
      id: typeof site.id === "string" && site.id ? site.id : randomUUID(),
      kind: siteKind(site.kind) ?? "sede",
      address: text(site.address, "Morada da instalação", 300),
      location: text(site.location, "Concelho da instalação", 160, false),
      ...(site.coordinates ? { coordinates: coordinates(site.coordinates) } : {}),
    }));
  };
  const financials = (value: unknown) => {
    if (!Array.isArray(value)) throw new AppError("Dados financeiros inválidos.");
    if (value.length > 15) throw new AppError("Máximo de 15 anos de dados financeiros.");
    const years = value.map((entry: Values) => {
      const year = Number(entry.year);
      if (!Number.isInteger(year) || year < 1990 || year > 2100) throw new AppError("Ano inválido nos dados financeiros.");
      const number = (raw: unknown, label: string) => {
        if (raw === undefined || raw === null || raw === "") return undefined;
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) throw new AppError(`${label} inválido.`);
        return n;
      };
      const turnover = number(entry.turnover, "Volume de negócios");
      const employees = number(entry.employees, "Número de empregados");
      return { year, ...(turnover !== undefined ? { turnover } : {}), ...(employees !== undefined ? { employees: Math.round(employees) } : {}) };
    });
    if (new Set(years.map((y) => y.year)).size !== years.length) throw new AppError("Há anos repetidos nos dados financeiros.");
    return years.sort((a, b) => a.year - b.year);
  };
  const companySize = (value: unknown) => {
    if (value === null) return undefined;
    const v = (value ?? {}) as Values;
    if (v.source !== "Iberinform" || typeof v.url !== "string" || !/^https:\/\/www\.iberinform\.pt\/empresa\//.test(v.url))
      throw new AppError("Dados de dimensão inválidos.");
    const bracket = (b: unknown) => {
      if (b === undefined || b === null) return undefined;
      const { label, min, max } = b as Values;
      if (typeof label !== "string" || label.length > 60) throw new AppError("Escalão inválido.");
      const ok = (n: unknown) => n === undefined || (typeof n === "number" && Number.isFinite(n) && n >= 0);
      if (!ok(min) || !ok(max)) throw new AppError("Escalão inválido.");
      return { label, ...(min !== undefined ? { min: min as number } : {}), ...(max !== undefined ? { max: max as number } : {}) };
    };
    return {
      source: "Iberinform" as const,
      url: v.url,
      ...(typeof v.nif === "string" && /^\d{9}$/.test(v.nif) ? { nif: v.nif } : {}),
      ...(v.turnover ? { turnover: bracket(v.turnover) } : {}),
      ...(v.trend ? { trend: choice(v.trend, ["aumenta", "diminui", "igual"] as const, "Tendência") } : {}),
      ...(v.employees ? { employees: bracket(v.employees) } : {}),
      ...(v.capital ? { capital: bracket(v.capital) } : {}),
      checkedAt: typeof v.checkedAt === "string" && !Number.isNaN(Date.parse(v.checkedAt)) ? new Date(v.checkedAt).toISOString() : new Date().toISOString(),
    };
  };
  const saveOrganization = (values: Values) => {
    const existing = values.id ? find(data.organizations, values.id) : null;
    if (existing) version(existing, values.version);
    const email = text(values.email, "Email", 200, false);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new AppError("Invalid email.");
    const name = text(values.name, "Organization", 160);
    const location = text(values.location ?? existing?.location, "Location", 160, false);
    const address = text(values.address ?? existing?.address, "Address", 300, false);
    // Coordinates follow the address: when either text changes without new coordinates, drop the stale pin.
    const moved = !!existing && (location !== (existing.location ?? "") || address !== (existing.address ?? ""));
    if (
      !existing &&
      data.organizations.some(
        (o) => o.name.toLocaleLowerCase("pt") === name.toLocaleLowerCase("pt"),
      )
    )
      throw new AppError(
        "This organization already exists. Open it to record the conversation.",
      );
    const item = {
      ...(existing ?? base()),
      name,
      person: text(values.person, "Person", 160, false),
      email,
      phone: text(values.phone, "Phone", 50, false),
      location,
      address,
      nif: values.nif !== undefined ? nif(values.nif) : existing?.nif,
      siteKind: values.siteKind !== undefined ? siteKind(values.siteKind) : existing?.siteKind,
      sites: values.sites !== undefined ? sites(values.sites) : existing?.sites,
      financials: values.financials !== undefined ? financials(values.financials) : existing?.financials,
      size: values.size !== undefined ? companySize(values.size) : existing?.size,
      coordinates:
        values.coordinates !== undefined
          ? coordinates(values.coordinates)
          : moved
            ? undefined
            : existing?.coordinates,
      stage: choice(
        values.stage ?? "new",
        Object.keys(stages),
        "Status",
      ) as keyof typeof stages,
      ownerId: member(values.ownerId ?? me.id),
      nextStep: text(values.nextStep, "Next step", 500, false),
      followUpOn: day(values.followUpOn),
      pinned: boolean(values.pinned, existing?.pinned ?? false),
      archived: boolean(values.archived, existing?.archived ?? false),
    };
    if (item.nif && data.organizations.some((o) => o.id !== item.id && o.nif === item.nif))
      throw new AppError("Já existe uma empresa com este NIF.");
    if (existing && item.stage !== existing.stage) {
      const statusNote = text(values.statusNote, "Status note", 10000);
      data.interactions.push({
        ...base(),
        organizationId: existing.id,
        channel: "note",
        body: statusNote,
        stageFrom: existing.stage,
        stageTo: item.stage,
      });
    }
    if (existing) {
      Object.assign(existing, item);
      touch(existing);
    } else {
      data.organizations.push(item);
      // A company created from a prospect keeps where it came from in its timeline.
      const initialNote = text(values.initialNote, "Nota inicial", 2000, false);
      if (initialNote)
        data.interactions.push({ ...base(), organizationId: item.id, channel: "note", body: initialNote });
    }
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
      "Visibility",
    );
    if (visibility === "private" && existing)
      allow(existing.createdBy === me.id);
    const recipientIds =
      visibility === "shared"
        ? stringList(values.recipientIds ?? existing?.recipientIds ?? [])
        : [];
    recipientIds.forEach(member);
    if (visibility === "shared" && !recipientIds.length)
      throw new AppError("Select at least one person for the note.");
    const item = {
      ...(existing ?? base()),
      title: text(values.title ?? existing?.title, "Title", 160),
      body: body(values.body ?? existing?.body),
      projectId: projectId(
        values.projectId === undefined ? existing?.projectId : values.projectId,
      ),
      organizationId: organizationId(
        values.organizationId === undefined
          ? existing?.organizationId
          : values.organizationId,
      ),
      meetingId:
        values.meetingId === undefined
          ? (existing?.meetingId ?? null)
          : values.meetingId
            ? find(data.meetings, values.meetingId).id
            : null,
      contactId:
        values.contactId === undefined
          ? (existing?.contactId ?? null)
          : values.contactId
            ? find(data.contacts, values.contactId).id
            : null,
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
  const clockTime = /^([01]\d|2[0-3]):[0-5]\d$/;
  // One visit of a route, as planned (route.save) or added during the day (route.replan).
  const visitStop = (value: unknown) => {
    const stop = record(value);
    const lat = Number(stop.lat), lng = Number(stop.lng);
    const arrival = text(stop.arrival, "Hora de chegada", 5), departure = text(stop.departure, "Hora de saída", 5);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
      throw new AppError("Posição inválida numa visita.");
    if (!clockTime.test(arrival) || !clockTime.test(departure)) throw new AppError("Horário inválido numa visita.");
    const kind = choice(stop.kind, ["crm", "prospect"] as const, "Tipo de visita");
    const id = text(stop.id, "Empresa", 200);
    return {
      kind, id, lat, lng, arrival, departure,
      name: text(stop.name, "Empresa", 160),
      location: text(stop.location, "Localização", 160, false),
      reasons: (Array.isArray(stop.reasons) ? stop.reasons : []).slice(0, 8).map((reason) => text(reason, "Motivo", 200)),
      organizationId: kind === "crm" ? organizationId(id) : null,
    };
  };
  switch (action) {
    case "member.github": {
      allow(!v.memberId || v.memberId === me.id);
      const login = text(v.githubLogin, "GitHub username", 39, false);
      if (login && !/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(login))
        throw new AppError("Enter a GitHub username, without a URL or @.");
      if (login && data.members.some((other) => isActiveMember(other) && other.id !== me.id && other.githubLogin?.toLowerCase() === login.toLowerCase()))
        throw new AppError("This GitHub username is already linked to another profile.");
      if (login) me.githubLogin = login;
      else delete me.githubLogin;
      return { message: login ? "GitHub username linked." : "GitHub username removed." };
    }
    case "meeting.participants": {
      const event = find(data.meetings, v.id);
      allow(canEditMeeting(me, event));
      version(event, v.version);
      const participants = stringList(v.participantIds);
      participants.forEach(member);
      if (
        event.calendarKey === "personal" &&
        !participants.includes(event.calendarOwnerId)
      )
        participants.push(event.calendarOwnerId);
      event.participantIds = participants;
      touch(event);
      return { message: "Participants linked." };
    }

    case "inbox.save": {
      data.inbox.push({
        ...base(),
        ownerId: me.id,
        body: text(v.body, "Capture", 10000),
        resolved: false,
      });
      return { message: "Saved to Inbox." };
    }
    case "task.linkPR": {
      const task = find(data.tasks, v.id);
      allow(canSeeTask(me, task, data));
      version(task, v.version);
      if (
        (v.pullRequestId || v.pullRequestUrl) &&
        (task.status === "todo" || task.status === "backlog")
      ) {
        throw new AppError(
          "Pull requests can only be linked when the task is in progress.",
        );
      }
      let pr = null;
      if (v.pullRequestUrl && typeof v.pullRequestUrl === "string") {
        const url = text(v.pullRequestUrl, "Pull request link", 500);
        const match =
          /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)\/?$/.exec(
            url,
          );
        if (!match) {
          throw new AppError(
            "Use a GitHub link in the format https://github.com/team/repo/pull/123.",
          );
        }
        pr =
          data.pullRequests.find(
            (p) => p.url.replace(/\/$/, "") === url.replace(/\/$/, ""),
          ) ?? null;
        if (!pr) {
          const newPr: PullRequest = {
            ...base(),
            projectId: task.projectId ?? "",
            number: Number(match[3]),
            title: `PR #${match[3]}`,
            url,
            state: "open",
            author: me.name,
            branch: "main",
          };
          data.pullRequests.push(newPr);
          pr = newPr;
        }
      } else if (v.pullRequestId) {
        pr = find(data.pullRequests, v.pullRequestId);
      }
      if (
        pr &&
        task.projectId &&
        pr.projectId &&
        pr.projectId !== task.projectId
      ) {
        throw new AppError("The pull request belongs to another project.");
      }
      task.pullRequestId = pr?.id ?? null;
      touch(task);
      return { message: "Pull request linked." };
    }
    case "task.linkIssue": {
      const task = find(data.tasks, v.id);
      allow(canSeeTask(me, task, data));
      version(task, v.version);
      task.issueNumber = v.issueNumber ? Number(v.issueNumber) : null;
      task.issueUrl = v.issueUrl ? String(v.issueUrl).trim() : null;
      touch(task);
      return { message: "Issue linked." };
    }

    case "task.save":
      saveTask(v);
      return { message: "Task saved." };
    case "task.delete": {
      const task = find(data.tasks, v.id);
      allow(canSeeTask(me, task, data));
      version(task, v.version);
      data.tasks = data.tasks.filter((item) => item.id !== task.id);
      data.taskComments = data.taskComments.filter(
        (item) => item.taskId !== task.id,
      );
      data.taskAttachments = data.taskAttachments.filter(
        (item) => item.taskId !== task.id,
      );
      data.taskActivity = data.taskActivity.filter(
        (item) => item.taskId !== task.id,
      );
      data.activity = data.activity.filter(
        (item) => !(item.entityType === "task" && item.entityId === task.id),
      );
      return { message: "Task deleted." };
    }
    case "task.status": {
      const task = find(data.tasks, v.id);
      allow(canSeeTask(me, task, data));
      version(task, v.version);
      const previous = task.status;
      task.status = choice(
        v.status,
        Object.keys(taskStatuses),
        "Status",
      ) as keyof typeof taskStatuses;
      touch(task);
      if (previous !== task.status)
        data.taskActivity.push({
          ...base(),
          taskId: task.id,
          body: `Status: ${taskStatuses[previous]} → ${taskStatuses[task.status]}`,
        });
      return {
        message: task.status === "done" ? "Task completed." : "Status updated.",
      };
    }
    case "task.comment": {
      const task = find(data.tasks, v.taskId);
      allow(canSeeTask(me, task, data));
      const comment = {
        ...base(),
        taskId: task.id,
        body: text(v.body, "Comment", 10000),
      };
      data.taskComments.push(comment);
      // Comments are separate entities: don't invalidate concurrent field edits.
      return { message: "Comment added.", ids: [comment.id] };
    }
    case "task.tomorrow": {
      const task = find(data.tasks, v.id);
      allow(canSeeTask(me, task, data));
      version(task, v.version);
      task.dueOn = addDays(dateKey(now), 1);
      touch(task);
      return { message: "Task postponed until tomorrow." };
    }
    case "meeting.save": {
      if (!Array.isArray(v.calendarTargets)) {
        const event = v.id ? find(data.meetings, v.id) : null;
        if (
          event &&
          (event.groupId ||
            (v.calendarKey === "personal" && event.googleEventId))
        ) {
          const siblings = event.groupId
            ? data.meetings.filter(
                (m) =>
                  m.groupId === event.groupId &&
                  !m.cancelled &&
                  canEditMeeting(me, m),
              )
            : [event];
          v.calendarTargets = siblings.map((m) =>
            m.calendarKey === "personal"
              ? `personal:${m.calendarOwnerId}`
              : (m.calendarKey ?? "office"),
          );
          if (v.calendarKey && v.calendarKey !== event.calendarKey)
            v.calendarTargets = [
              v.calendarKey === "personal"
                ? `personal:${v.calendarOwnerId ?? event.calendarOwnerId}`
                : v.calendarKey,
            ];
        } else {
          saveMeeting(v);
          return { message: "Event saved." };
        }
      }
      const targets = [...new Set(stringList(v.calendarTargets))];
      if (!targets.length) throw new AppError("Select at least one calendar.");
      const original = v.id ? find(data.meetings, v.id) : null;
      if (original) {
        allow(canEditMeeting(me, original));
        version(original, v.version);
      }
      let groupId = original?.groupId ?? original?.id ?? randomUUID();
      const allSiblings = original
        ? data.meetings.filter(
            (m) => m.id === original.id || m.groupId === groupId,
          )
        : [];
      const siblings = allSiblings.filter((m) => canEditMeeting(me, m));
      // Editing a visible destination must not modify hidden calendars, even indirectly
      // through a later Google webhook. Detach only the destinations this user controls.
      if (siblings.length !== allSiblings.length) groupId = randomUUID();
      const targetOf = (m: (typeof data.meetings)[number]) =>
        m.calendarKey === "personal"
          ? `personal:${m.calendarOwnerId}`
          : (m.calendarKey ?? "office");
      for (const target of targets) {
        const key = target.startsWith("personal:")
          ? "personal"
          : choice(target, ["office", "contacto"] as const, "Calendário");
        const match = siblings.find(
          (m) => targetOf(m) === target && !m.cancelled,
        );
        saveMeeting(
          {
            ...v,
            id: match?.id,
            version: match?.version,
            calendarKey: key,
            calendarOwnerId: key === "personal" ? target.slice(9) : me.id,
          },
          groupId,
        );
      }
      for (const sibling of siblings.filter(
        (m) => !targets.includes(targetOf(m)),
      )) {
        sibling.cancelled = true;
        sibling.groupId = groupId;
        touch(sibling);
      }
      return { message: "Event saved to the selected calendars." };
    }
    case "meeting.cancel": {
      const item = find(data.meetings, v.id);
      allow(canEditMeeting(me, item));
      version(item, v.version);
      if (item.cancelled && item.googleEventId)
        throw new AppError(
          "Create a new event to replace the canceled Google event.",
        );
      const allSiblings = item.groupId
        ? data.meetings.filter((m) => m.groupId === item.groupId)
        : [item];
      const siblings = allSiblings.filter((m) => canEditMeeting(me, m));
      const groupId =
        siblings.length === allSiblings.length ? item.groupId : randomUUID();
      const cancelled = !item.cancelled;
      for (const sibling of siblings) {
        sibling.cancelled = cancelled;
        sibling.groupId = groupId;
        touch(sibling);
      }
      return {
        message: item.cancelled ? "Event canceled." : "Event restored.",
      };
    }
    case "organization.save":
      return { message: "Contact saved.", ids: [saveOrganization(v)] };
    case "organization.delete": {
      const organization = find(data.organizations, v.id);
      version(organization, v.version);
      data.organizations = data.organizations.filter(
        (item) => item.id !== organization.id,
      );
      data.contacts = data.contacts.filter(
        (item) => item.organizationId !== organization.id,
      );
      data.interactions = data.interactions.filter(
        (item) => item.organizationId !== organization.id,
      );
      data.tasks.forEach((item) => {
        if (item.organizationId === organization.id) item.organizationId = null;
      });
      data.meetings.forEach((item) => {
        if (item.organizationId === organization.id) item.organizationId = null;
      });
      data.projects.forEach((item) => {
        if (item.organizationId === organization.id) item.organizationId = null;
      });
      data.activity = data.activity.filter(
        (item) => item.companyId !== organization.id,
      );
      return { message: "Company deleted." };
    }
    case "organization.stage": {
      const organization = find(data.organizations, v.id);
      version(organization, v.version);
      const stage = choice(
        v.stage,
        Object.keys(stages),
        "Status",
      ) as keyof typeof stages;
      if (stage === organization.stage) return { message: "Status unchanged." };
      const note = text(v.note, "Status note", 10000);
      data.interactions.push({
        ...base(),
        organizationId: organization.id,
        channel: "note",
        body: note,
        stageFrom: organization.stage,
        stageTo: stage,
      });
      organization.stage = stage;
      touch(organization);
      return { message: "Status and note saved." };
    }
    case "organization.pin": {
      const organization = find(data.organizations, v.id);
      version(organization, v.version);
      organization.pinned = !organization.pinned;
      touch(organization);
      return {
        message: organization.pinned
          ? "Empresa destacada no topo do CRM."
          : "Empresa retirada dos destaques.",
      };
    }
    case "organization.note": {
      const organization = find(data.organizations, v.id);
      data.interactions.push({
        ...base(),
        organizationId: organization.id,
        channel: "note",
        body: text(v.body, "Nota", 10000),
      });
      touch(organization);
      return { message: "Note added to the timeline." };
    }
    case "contact.add": {
      const organizationId = find(data.organizations, v.organizationId).id;
      const contact = {
        ...base(),
        organizationId,
        name: text(v.name, "Name", 160),
        email: text(v.email, "Email", 200, false),
        phone: text(v.phone, "Phone", 50, false),
      };
      data.contacts.push(contact);
      return {
        message: "Person added to the organization.",
        ids: [contact.id],
      };
    }
    case "inbox.resolve": {
      const item = find(data.inbox, v.id);
      allow(item.ownerId === me.id);
      item.resolved = true;
      touch(item);
      return { message: "Item handled." };
    }
    case "interaction.add": {
      const organization = find(data.organizations, v.organizationId);
      version(organization, v.version);
      const nextStage = choice(
        v.stage ?? organization.stage,
        Object.keys(stages),
        "Status",
      ) as keyof typeof stages;
      data.interactions.push({
        ...base(),
        organizationId: organization.id,
        body: text(v.body, "Conversation", 10000),
        channel: choice(
          v.channel ?? "note",
          ["note", "call", "email", "meeting"] as const,
          "Channel",
        ),
        stageFrom: nextStage !== organization.stage ? organization.stage : null,
        stageTo: nextStage !== organization.stage ? nextStage : null,
      });
      organization.nextStep = text(v.nextStep, "Next step", 500, false);
      organization.followUpOn = day(v.followUpOn);
      organization.stage = nextStage;
      touch(organization);
      return { message: "Conversation and next step saved." };
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
      const repositoryUrl = text(v.repositoryUrl, "Repository", 500, false);
      if (
        repositoryUrl &&
        !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/.test(repositoryUrl)
      )
        throw new AppError("Use the repository's HTTPS address on GitHub.");
      const item = {
        ...(existing ?? base()),
        name: text(v.name, "Nome", 160),
        objective: body(v.objective),
        nextStep: text(v.nextStep, "Next step", 500, false),
        status: choice(
          v.status ?? "active",
          Object.keys(projectStatuses),
          "Status",
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
      return { message: "Project saved." };
    }
    case "project.delete": {
      const project = find(data.projects, v.id);
      allow(canSeeProject(me, project));
      version(project, v.version);
      const taskIds = new Set(
        data.tasks
          .filter((item) => item.projectId === project.id)
          .map((item) => item.id),
      );
      data.projects = data.projects.filter((item) => item.id !== project.id);
      data.tasks = data.tasks.filter((item) => !taskIds.has(item.id));
      data.taskComments = data.taskComments.filter(
        (item) => !taskIds.has(item.taskId),
      );
      data.taskAttachments = data.taskAttachments.filter(
        (item) => !taskIds.has(item.taskId),
      );
      data.taskActivity = data.taskActivity.filter(
        (item) => !taskIds.has(item.taskId),
      );
      data.updates = data.updates.filter(
        (item) => item.projectId !== project.id,
      );
      data.pullRequests = data.pullRequests.filter(
        (item) => item.projectId !== project.id,
      );
      data.meetings.forEach((item) => {
        if (item.projectId === project.id) item.projectId = null;
      });
      data.activity = data.activity.filter(
        (item) =>
          !(
            item.projectId === project.id ||
            (item.entityType === "task" && taskIds.has(item.entityId))
          ),
      );
      return { message: "Project and its tasks deleted." };
    }
    case "project.update": {
      const id = projectId(v.projectId);
      if (!id) throw new AppError("Select the project.");
      data.updates.push({
        ...base(),
        projectId: id,
        body: text(v.body, "Update", 10000),
      });
      return { message: "Update recorded." };
    }
    case "note.save":
      saveNote(v);
      return { message: "Note saved." };
    case "note.delete": {
      const note = find(data.notes, v.id);
      allow(note.createdBy === me.id || me.role === "admin");
      version(note, v.version);
      data.notes = data.notes.filter((item) => item.id !== note.id);
      return { message: "Note deleted." };
    }
    case "note.pin": {
      const note = find(data.notes, v.id);
      allow(canSeeNote(me, note, data));
      version(note, v.version);
      note.pinned = !note.pinned;
      touch(note);
      return {
        message: note.pinned ? "Note pinned to Today." : "Note unpinned.",
      };
    }
    case "pr.save": {
      const existing = v.id ? find(data.pullRequests, v.id) : null;
      if (existing) {
        projectId(existing.projectId);
        version(existing, v.version);
      }
      const id = projectId(v.projectId);
      if (!id) throw new AppError("Select the project.");
      const url = text(v.url, "Pull request link", 500);
      const match =
        /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)\/?$/.exec(
          url,
        );
      if (!match)
        throw new AppError(
          "Use a GitHub link in the format https://github.com/team/repo/pull/123.",
        );
      if (
        data.pullRequests.some(
          (pr) =>
            pr.id !== existing?.id &&
            pr.url.replace(/\/$/, "") === url.replace(/\/$/, ""),
        )
      )
        throw new AppError("This pull request is already linked.");
      const item = {
        ...(existing ?? base()),
        projectId: id,
        title: text(v.title, "Title", 160),
        url,
        number: Number(match[3]),
        state: choice(
          v.state ?? "open",
          ["open", "draft", "merged", "closed"] as const,
          "Status",
        ),
      };
      if (existing) {
        Object.assign(existing, item);
        touch(existing);
      } else data.pullRequests.push(item);
      return {
        message: "Pull request saved. Status updated manually.",
      };
    }
    case "pr.delete": {
      const pr = find(data.pullRequests, v.id);
      projectId(pr.projectId);
      version(pr, v.version);
      data.pullRequests = data.pullRequests.filter((item) => item.id !== pr.id);
      data.tasks.forEach((task) => {
        if (task.pullRequestId === pr.id) task.pullRequestId = null;
      });
      return { message: "Pull request removed from the project." };
    }
    case "reminder.done": {
      const reminder = find(data.reminders, v.id);
      allow(reminder.ownerId === me.id);
      version(reminder, v.version);
      reminder.done = true;
      touch(reminder);
      return { message: "Reminder dismissed." };
    }
    case "reminder.ack": {
      const key = text(v.key, "Reminder", 300);
      const available = alertsFor(
        { ...data, reminderReceipts: [] },
        me,
        now,
      ).some((a) => a.key === key);
      if (!available)
        throw new AppError("This reminder is no longer active.", 409);
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
        message: snooze ? "Remind me again in one hour." : "Reminder handled.",
      };
    }
    case "capture.commit": {
      const key = text(v.key, "Capture identifier", 100);
      const previous = data.captureReceipts.find(
        (r) => r.memberId === me.id && r.key === key,
      );
      if (previous)
        return { message: "Capture already saved.", ids: previous.ids };
      if (!Array.isArray(v.drafts) || !v.drafts.length || v.drafts.length > 10)
        throw new AppError("Review the records before saving (maximum 10).");
      const ids: string[] = [];
      for (const value of v.drafts) {
        const d = record(value);
        const kind = choice(d.kind, Object.keys(captureKinds), "Tipo");
        if (
          !d.organizationId &&
          d.organizationName &&
          kind !== "inbox" &&
          kind !== "crm"
        ) {
          const name = text(d.organizationName, "Organization", 160);
          const existing = data.organizations.find(
            (organization) =>
              organization.name.toLocaleLowerCase("pt") ===
              name.toLocaleLowerCase("pt"),
          );
          d.organizationId =
            existing?.id ??
            saveOrganization({
              name,
              person: "",
              email: "",
              phone: "",
              ownerId: d.ownerId,
              stage: "new",
              nextStep: "",
              followUpOn: "",
            });
        }
        if (kind === "task") ids.push(saveTask({ ...d, dueOn: d.date }));
        else if (kind === "note") ids.push(saveNote(d));
        else if (kind === "meeting" || kind === "event") {
          const start = instant(
            `${text(d.date, "Date", 10)}T${text(d.time, "Time", 5)}`,
          );
          const duration = Number(d.duration);
          if (!Number.isInteger(duration) || duration < 5 || duration > 1440)
            throw new AppError("Choose a duration between 5 and 1440 minutes.");
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
              body: text(d.body || d.title, "Conversation", 10000),
            });
            if (d.nextStep) org.nextStep = text(d.nextStep, "Next step", 500);
            if (d.date) org.followUpOn = day(d.date);
            if (
              d.person &&
              !data.contacts.some(
                (contact) =>
                  contact.organizationId === id &&
                  contact.name.toLocaleLowerCase("pt") ===
                    String(d.person).toLocaleLowerCase("pt"),
              )
            ) {
              const contact = {
                ...base(),
                organizationId: id,
                name: text(d.person, "Person", 160),
                email: "",
                phone: "",
              };
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
          if (!id)
            throw new AppError(
              "Choose an existing organization to update the CRM.",
            );
          const org = find(data.organizations, id);
          const stage = choice(
            d.stage,
            Object.keys(stages),
            "Status",
          ) as keyof typeof stages;
          const note = text(d.body, "Status note", 10000);
          if (stage !== org.stage) {
            data.interactions.push({
              ...base(),
              organizationId: id,
              channel: "note",
              body: note,
              stageFrom: org.stage,
              stageTo: stage,
            });
            org.stage = stage;
          } else
            data.interactions.push({
              ...base(),
              organizationId: id,
              channel: "note",
              body: note,
            });
          touch(org);
          ids.push(id);
        } else if (kind === "update") {
          const id = projectId(d.projectId);
          if (!id) throw new AppError("Choose the project for the update.");
          const update = {
            ...base(),
            projectId: id,
            body: text(d.body || d.title, "Update", 10000),
          };
          data.updates.push(update);
          ids.push(update.id);
        } else if (kind === "reminder") {
          const reminder = {
            ...base(),
            title: text(d.title, "Reminder", 160),
            ownerId: owner(d.ownerId, null),
            at: instant(
              `${text(d.date, "Date", 10)}T${text(d.time, "Time", 5)}`,
            ),
            done: false,
          };
          data.reminders.push(reminder);
          ids.push(reminder.id);
        } else if (kind === "inbox") {
          const item = {
            ...base(),
            body: text(d.body || d.title, "Capture", 10000),
            ownerId: me.id,
            resolved: false,
          };
          data.inbox.push(item);
          ids.push(item.id);
        }
      }
      data.captureReceipts.push({ memberId: me.id, key, ids });
      return {
        message:
          ids.length === 1 ? "Record saved." : `${ids.length} records saved.`,
        ids,
      };
    }
    case "route.save": {
      const date = day(v.date);
      if (!date) throw new AppError("Escolhe o dia das visitas.");
      if (!Array.isArray(v.stops) || !v.stops.length || v.stops.length > 12)
        throw new AppError("Uma rota tem entre 1 e 12 visitas.");
      const stops = v.stops.map(visitStop);
      const route = {
        ...base(),
        name: text(v.name, "Nome da rota", 120),
        date,
        ownerId: v.ownerId ? member(v.ownerId) : me.id,
        stops,
        currentIndex: 0,
        visits: [],
      };
      data.routes.push(route);
      return { message: "Rota guardada.", ids: [route.id] };
    }
    case "route.owner": {
      const route = find(data.routes, v.id);
      allow(me.role === "admin" || route.ownerId === me.id || route.createdBy === me.id);
      version(route, v.version);
      route.ownerId = member(v.ownerId);
      touch(route);
      return { message: "Responsável da rota atualizado." };
    }
    case "route.visit": {
      const route = find(data.routes, v.id);
      // The responsible person registers the visits; an admin can step in on any route.
      allow(me.role === "admin" || route.ownerId === me.id);
      version(route, v.version);
      const stop = route.stops[route.currentIndex];
      if (!stop) throw new AppError("Esta rota já está concluída.");
      // A prospect becomes a company when the visits are scheduled or it is added to the CRM; names are unique there.
      const organization =
        data.organizations.find((o) => o.id === (stop.organizationId ?? (stop.kind === "crm" ? stop.id : null))) ??
        data.organizations.find((o) => !o.archived && o.name.toLocaleLowerCase("pt") === stop.name.toLocaleLowerCase("pt"));
      if (!organization)
        throw new AppError("Esta visita é a um prospeto que ainda não está no CRM. Marca a rota no calendário ou adiciona a empresa ao CRM primeiro.");
      const stage = choice(v.stage, Object.keys(stages), "Estado") as keyof typeof stages;
      const note = text(v.note, "Resumo da visita", 10000);
      data.interactions.push({
        ...base(),
        organizationId: organization.id,
        channel: "note",
        body: `Visita em rota: ${note}`,
        ...(stage !== organization.stage ? { stageFrom: organization.stage, stageTo: stage } : {}),
      });
      organization.stage = stage;
      // Next step and follow-up date are optional: only what was filled in replaces the company's current ones.
      const nextStep = text(v.nextStep, "Próximo passo", 500, false);
      const followUpOn = day(v.followUpOn);
      if (nextStep) organization.nextStep = nextStep;
      if (followUpOn) organization.followUpOn = followUpOn;
      touch(organization);
      stop.organizationId = organization.id;
      route.visits.push({ stopId: stop.id, organizationId: organization.id, at: now, by: me.id, stage, note });
      route.currentIndex++;
      touch(route);
      return {
        message: route.currentIndex >= route.stops.length ? "Visita registada. Rota concluída." : "Visita registada.",
      };
    }
    case "route.skip": {
      const route = find(data.routes, v.id);
      allow(me.role === "admin" || route.ownerId === me.id);
      version(route, v.version);
      const stop = route.stops[route.currentIndex];
      if (!stop) throw new AppError("Esta rota já está concluída.");
      route.visits.push({ stopId: stop.id, at: now, by: me.id, note: text(v.note, "Motivo", 500, false), skipped: true });
      route.currentIndex++;
      touch(route);
      return { message: `${stop.name} ficou fora da rota.` };
    }
    case "route.replan": {
      const route = find(data.routes, v.id);
      allow(me.role === "admin" || route.ownerId === me.id);
      version(route, v.version);
      // A company added during the day joins the visits still to do; the plan must then contain it too.
      const added = v.add === undefined ? null : visitStop(v.add);
      if (added && route.stops.some((stop) => stop.id === added.id || (!!added.organizationId && stop.organizationId === added.organizationId)))
        throw new AppError(`${added.name} já está nesta rota.`);
      if (added && route.stops.length >= 20) throw new AppError("Uma rota tem no máximo 20 visitas.");
      const remaining = [...route.stops.slice(route.currentIndex), ...(added ? [added] : [])];
      if (!Array.isArray(v.stops) || v.stops.length !== remaining.length)
        throw new AppError("O novo plano tem de ter as mesmas visitas que faltam.");
      const used = new Set<string>();
      const reordered = v.stops.map((value) => {
        const item = record(value);
        const stop = remaining.find((candidate) => candidate.id === item.id && !used.has(candidate.id));
        if (!stop) throw new AppError("O novo plano tem de ter as mesmas visitas que faltam.");
        used.add(stop.id);
        const arrival = text(item.arrival, "Hora de chegada", 5), departure = text(item.departure, "Hora de saída", 5);
        if (!clockTime.test(arrival) || !clockTime.test(departure)) throw new AppError("Horário inválido no novo plano.");
        return { ...stop, arrival, departure };
      });
      route.stops = [...route.stops.slice(0, route.currentIndex), ...reordered];
      touch(route);
      return { message: added ? `${added.name} acrescentada à rota.` : "Rota replaneada a partir daqui." };
    }
    case "route.delete": {
      const route = find(data.routes, v.id);
      allow(me.role === "admin" || route.ownerId === me.id || route.createdBy === me.id);
      data.routes = data.routes.filter((item) => item.id !== route.id);
      return { message: "Rota apagada." };
    }
    default:
      throw new AppError("Unknown action.");
  }
}

import { localDateTime as localTime } from "@/domain/time";

export function executeCommand(
  data: Store,
  actor: Member,
  input: unknown,
  now = new Date().toISOString(),
  source: ActivityEvent["source"] = "os",
) {
  const before = structuredClone(data);
  const result = executeCore(data, actor, input, now);
  captureChanges(data, before, actor, source, now);
  queueCreationNotices(data, before, actor, now);
  return result;
}
