import { randomBytes, randomUUID } from "node:crypto";
import type { Member, Meeting } from "@/domain/model";
import {
  operationalCalendars,
  type CalendarKey,
} from "@/domain/integration-model";
import { AppError } from "@/domain/validation";
import { toInstant, dateKey } from "@/domain/time";
import {
  api,
  hash,
  seal,
  unseal,
  required,
  publicOrigin,
  ProviderError,
  connectionError,
  type ServiceContext,
} from "./runtime";
import { enqueue, recordActivity } from "./activity-service";
const root = "https://www.googleapis.com/calendar/v3/calendars/";
type GoogleEvent = {
  id: string;
  summary?: string;
  description?: string;
  status?: string;
  etag?: string;
  htmlLink?: string;
  updated?: string;
  recurringEventId?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { email: string }[];
  extendedProperties?: { private?: Record<string, string> };
};
const calendarId = (key: CalendarKey) => operationalCalendars[key].email;
function callback(ctx: ServiceContext) {
  return (
    ctx.env.GOOGLE_REDIRECT_URI ||
    "http://127.0.0.1:3100/api/integrations/google/callback"
  );
}

export async function beginGoogleOAuth(
  ctx: ServiceContext,
  me: Member,
  key: CalendarKey,
) {
  if (me.role !== "admin" || !operationalCalendars[key])
    throw new AppError("Unauthorized.", 403);
  required(ctx.env, "INTEGRATION_ENCRYPTION_KEY");
  required(ctx.env, "GOOGLE_CLIENT_SECRET");
  const state = randomBytes(32).toString("hex"),
    verifier = randomBytes(32).toString("base64url");
  await ctx.repo.transact((data) => {
    data.oauthStates = data.oauthStates.filter(
      (item) => item.expiresAt > ctx.now(),
    );
    data.oauthStates.push({
      hash: hash(state),
      memberId: me.id,
      calendarKey: key,
      verifier,
      expiresAt: new Date(Date.parse(ctx.now()) + 600000).toISOString(),
    });
  });
  const params = new URLSearchParams({
    client_id: required(ctx.env, "GOOGLE_CLIENT_ID"),
    redirect_uri: callback(ctx),
    response_type: "code",
    scope:
      "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendars.readonly",
    access_type: "offline",
    prompt: "consent",
    state,
    login_hint: calendarId(key),
    hd: "vouga-agency.pt",
    code_challenge: Buffer.from(hash(verifier), "hex").toString("base64url"),
    code_challenge_method: "S256",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}
export async function completeGoogleOAuth(
  ctx: ServiceContext,
  me: Member,
  state: string,
  code: string,
) {
  if (!/^[a-f0-9]{64}$/.test(state) || !code || code.length > 4096)
    throw new AppError("Invalid OAuth response.", 400);
  const pending = await ctx.repo.transact((data) => {
    const index = data.oauthStates.findIndex(
      (item) =>
        item.hash === hash(state) &&
        item.memberId === me.id &&
        item.expiresAt > ctx.now(),
    );
    if (index < 0 || me.role !== "admin")
      throw new AppError("Invalid or expired OAuth request.", 403);
    const item = data.oauthStates[index];
    if (item.status === "completed") return { ...item };
    if (item.status === "processing")
      throw new AppError(
        "The connection is already being completed. Check its status in Settings before trying again.",
        409,
      );
    if (item.status === "failed")
      throw new AppError(
        "This request has already been used. Start a new connection in Settings.",
        409,
      );
    const claimed = { ...item };
    item.status = "processing";
    item.verifier = ""; // Keep the verifier only in the process exchanging this code.
    return claimed;
  });
  if (pending.status === "completed") return;
  try {
    const token = await api<{ access_token: string; refresh_token?: string }>(
      ctx,
      "google",
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: required(ctx.env, "GOOGLE_CLIENT_ID"),
          client_secret: required(ctx.env, "GOOGLE_CLIENT_SECRET"),
          redirect_uri: callback(ctx),
          grant_type: "authorization_code",
          code_verifier: pending.verifier,
        }),
      },
    );
    const primary = await api<{ id: string }>(ctx, "google", `${root}primary`, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (primary.id.toLowerCase() !== calendarId(pending.calendarKey))
      throw new AppError(
        `Authorize the ${calendarId(pending.calendarKey)} account.`,
        403,
      );
    if (!token.refresh_token)
      throw new AppError(
        "Google did not return a refresh token. Authorize the connection again.",
      );
    await ctx.repo.transact((data) => {
      const id = `google:${pending.calendarKey}`;
      const existing = data.externalConnections.find((item) => item.id === id);
      const item = {
        id,
        provider: "google" as const,
        label: operationalCalendars[pending.calendarKey].label,
        status: "connected" as const,
        externalId: primary.id,
        credentials: seal({ refreshToken: token.refresh_token }, ctx.env),
        lastError: undefined,
      };
      if (existing) Object.assign(existing, item);
      else data.externalConnections.push(item);
      const receipt = data.oauthStates.find(
        (entry) => entry.hash === hash(state) && entry.memberId === me.id,
      );
      if (receipt) {
        receipt.status = "completed";
        receipt.verifier = "";
      }
      enqueue(data, `google-connect:${randomUUID()}`, "calendar.pull", {
        calendarKey: pending.calendarKey,
      });
      for (const meeting of data.meetings.filter(
        (event) =>
          (event.calendarKey ?? "office") === pending.calendarKey &&
          ["pending", "error"].includes(event.syncStatus ?? ""),
      ))
        enqueue(
          data,
          `reconnect:${meeting.id}:${randomUUID()}`,
          "calendar.push",
          { meetingId: meeting.id },
        );
    });
  } catch (error) {
    // A failed exchange cannot safely reuse a one-time Google code.
    await ctx.repo
      .transact((data) => {
        const receipt = data.oauthStates.find(
          (entry) => entry.hash === hash(state) && entry.memberId === me.id,
        );
        if (receipt && receipt.status !== "completed") {
          receipt.status = "failed";
          receipt.verifier = "";
        }
      })
      .catch(() => undefined);
    throw error;
  }
}
async function accessToken(ctx: ServiceContext, key: CalendarKey) {
  const connection = (await ctx.repo.read()).externalConnections.find(
    (item) => item.id === `google:${key}`,
  );
  if (!connection?.credentials)
    throw new AppError(
      `${operationalCalendars[key].label} is not connected yet.`,
      503,
    );
  const credentials = unseal<{ refreshToken: string }>(
    connection.credentials,
    ctx.env,
  );
  const result = await api<{ access_token: string }>(
    ctx,
    "google",
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: required(ctx.env, "GOOGLE_CLIENT_ID"),
        client_secret: required(ctx.env, "GOOGLE_CLIENT_SECRET"),
        refresh_token: credentials.refreshToken,
        grant_type: "refresh_token",
      }),
    },
  );
  return result.access_token;
}
export async function pushCalendarEvent(ctx: ServiceContext, id: string) {
  const meeting = (await ctx.repo.read()).meetings.find(
    (item) => item.id === id,
  );
  if (!meeting || meeting.calendarKey === "personal") return;
  if (meeting.syncStatus === "conflict")
    throw new AppError("Unresolved calendar conflict.", 409);
  const key = meeting.calendarKey ?? "office",
    target = calendarId(key);
  const connection = (await ctx.repo.read()).externalConnections.find(
    (item) => item.id === `google:${key}`,
  );
  if (!connection?.credentials)
    throw new AppError(
      "Calendar not connected; change saved locally.",
      503,
    );
  try {
    const token = await accessToken(ctx, key),
      headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };
    const externalId =
      meeting.googleEventId || `v${hash(meeting.id).slice(0, 40)}`;
    if (meeting.googleCalendarId && meeting.googleCalendarId !== target) {
      const oldKey = Object.keys(operationalCalendars).find(
        (k) => calendarId(k as CalendarKey) === meeting.googleCalendarId,
      ) as CalendarKey;
      if (!oldKey) throw new AppError("Unknown source calendar.");
      const oldToken = await accessToken(ctx, oldKey);
      await api(
        ctx,
        "google",
        `${root}${encodeURIComponent(meeting.googleCalendarId)}/events/${externalId}/move?destination=${encodeURIComponent(target)}&sendUpdates=all`,
        { method: "POST", headers: { Authorization: `Bearer ${oldToken}` } },
      );
      await ctx.repo.transact((data) => {
        const event = data.meetings.find((item) => item.id === id);
        if (event) {
          event.googleCalendarId = target;
          event.googleEtag = undefined;
        }
      });
      meeting.googleEtag = undefined;
    }
    let result: GoogleEvent | undefined;
    const url = `${root}${encodeURIComponent(target)}/events`;
    if (meeting.cancelled) {
      if (meeting.googleEtag) headers["If-Match"] = meeting.googleEtag;
      try {
        await api(ctx, "google", `${url}/${externalId}?sendUpdates=all`, {
          method: "DELETE",
          headers,
        });
      } catch (error) {
        if (!(
          error instanceof ProviderError && [404, 410].includes(error.status)
        ))
          throw error;
      }
    } else {
      const payload = {
        summary: meeting.title,
        description: meeting.body,
        start: meeting.allDay
          ? { date: dateKey(meeting.startsAt) }
          : { dateTime: meeting.startsAt, timeZone: "Europe/Lisbon" },
        end: meeting.allDay
          ? { date: dateKey(meeting.endsAt) }
          : { dateTime: meeting.endsAt, timeZone: "Europe/Lisbon" },
        attendees: (meeting.externalParticipants ?? []).map((email) => ({
          email,
        })),
        extendedProperties: {
          private: {
            vougaId: meeting.id,
            vougaParticipants: meeting.participantIds.join(","),
            vougaProject: meeting.projectId ?? "",
            vougaCompany: meeting.organizationId ?? "",
          },
        },
      };
      if (meeting.googleEventId) {
        if (meeting.googleEtag) headers["If-Match"] = meeting.googleEtag;
        result = await api<GoogleEvent>(
          ctx,
          "google",
          `${url}/${externalId}?sendUpdates=all`,
          { method: "PATCH", headers, body: JSON.stringify(payload) },
        );
      } else {
        try {
          result = await api<GoogleEvent>(
            ctx,
            "google",
            `${url}?sendUpdates=all`,
            {
              method: "POST",
              headers,
              body: JSON.stringify({ ...payload, id: externalId }),
            },
          );
        } catch (error) {
          if (!(error instanceof ProviderError && error.status === 409))
            throw error;
          result = await api<GoogleEvent>(
            ctx,
            "google",
            `${url}/${externalId}`,
            { headers },
          );
          if (result.extendedProperties?.private?.vougaId !== meeting.id)
            throw new AppError("Identificador externo em conflito.");
        }
      }
    }
    await ctx.repo.transact((data) => {
      const event = data.meetings.find((item) => item.id === id);
      if (!event) return;
      event.googleCalendarId = target;
      event.googleEventId = externalId;
      event.googleEventUrl = result?.htmlLink ?? event.googleEventUrl;
      event.googleEtag = result?.etag;
      if (event.version === meeting.version) event.syncStatus = "synced";
      const connection = data.externalConnections.find(
        (item) => item.id === `google:${key}`,
      )!;
      connection.status = "connected";
      connection.lastError = undefined;
      connection.lastSyncAt = ctx.now();
    });
  } catch (error) {
    await connectionError(ctx, `google:${key}`, error);
    await ctx.repo.transact((data) => {
      const event = data.meetings.find((item) => item.id === id);
      if (event) {
        event.syncStatus =
          error instanceof ProviderError && error.status === 412
            ? "conflict"
            : "error";
        if (
          event.syncStatus === "conflict" &&
          !data.inbox.some(
            (item) => item.body.includes(event.id) && !item.resolved,
          )
        )
          data.inbox.push({
            id: randomUUID(),
            version: 1,
            createdAt: ctx.now(),
            updatedAt: ctx.now(),
            createdBy: event.createdBy,
            ownerId: event.createdBy,
            resolved: false,
            body: `Conflict in event ${event.title} (${event.id}). Review the Google version before saving again.`,
          });
      }
    });
    throw error;
  }
}
export async function pullCalendar(ctx: ServiceContext, key: CalendarKey) {
  const connection = (await ctx.repo.read()).externalConnections.find(
    (item) => item.id === `google:${key}`,
  );
  if (!connection?.credentials) return;
  const token = await accessToken(ctx, key),
    headers = { Authorization: `Bearer ${token}` };
  let syncToken = connection.syncToken,
    pageToken: string | undefined,
    nextSyncToken: string | undefined;
  const all: GoogleEvent[] = [];
  let full = !syncToken;
  for (let pages = 0; pages < 100; pages++) {
    const query = new URLSearchParams({
      singleEvents: "true",
      showDeleted: "true",
      maxResults: "2500",
    });
    if (syncToken) query.set("syncToken", syncToken);
    else {
      query.set(
        "timeMin",
        new Date(Date.parse(ctx.now()) - 90 * 86400000).toISOString(),
      );
      query.set(
        "timeMax",
        new Date(Date.parse(ctx.now()) + 366 * 86400000).toISOString(),
      );
    }
    if (pageToken) query.set("pageToken", pageToken);
    try {
      const result = await api<{
        items?: GoogleEvent[];
        nextPageToken?: string;
        nextSyncToken?: string;
      }>(
        ctx,
        "google",
        `${root}${encodeURIComponent(calendarId(key))}/events?${query}`,
        { headers },
      );
      all.push(...(result.items ?? []));
      pageToken = result.nextPageToken;
      nextSyncToken = result.nextSyncToken;
      if (!pageToken) break;
    } catch (error) {
      if (error instanceof ProviderError && error.status === 410 && syncToken) {
        syncToken = undefined;
        pageToken = undefined;
        full = true;
        all.length = 0;
        continue;
      }
      throw error;
    }
  }
  if (pageToken || !nextSyncToken)
    throw new AppError(
      "Incomplete synchronization; the cursor was not advanced.",
      503,
    );
  await ctx.repo.transact((data) => {
    for (const external of all) {
      let event = data.meetings.find(
        (item) =>
          item.googleCalendarId === calendarId(key) &&
          item.googleEventId === external.id,
      );
      if (!event && external.extendedProperties?.private?.vougaId)
        event = data.meetings.find(
          (item) =>
            item.id === external.extendedProperties!.private!.vougaId &&
            item.calendarKey === key,
        );
      if (external.etag && event?.googleEtag === external.etag) continue;
      if (
        event &&
        ["pending", "error", "conflict"].includes(event.syncStatus ?? "")
      )
        continue;
      if (external.status === "cancelled" && !event) continue;
      const startsAt =
        external.start?.dateTime ||
        (external.start?.date
          ? toInstant(`${external.start.date}T00:00`)
          : event?.startsAt);
      const endsAt =
        external.end?.dateTime ||
        (external.end?.date
          ? toInstant(`${external.end.date}T00:00`)
          : event?.endsAt);
      if (!startsAt || !endsAt) continue;
      const props = external.extendedProperties?.private;
      const participants =
        props?.vougaParticipants
          ?.split(",")
          .filter((id) => data.members.some((member) => member.id === id)) ??
        event?.participantIds ??
        [];
      const now = ctx.now(),
        id = event?.id ?? randomUUID(),
        actor = data.members.find((member) => member.role === "admin")!.id;
      const previous = event ? { ...event } : undefined;
      const updated: Meeting = {
        ...(event ?? {
          id,
          version: 0,
          createdAt: now,
          createdBy: actor,
          calendarOwnerId: actor,
          kind: "meeting",
          reminderMinutes: 0,
          visibility: "team",
        }),
        title: external.summary || "Untitled",
        body: external.description || "",
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        participantIds: participants,
        externalParticipants: (external.attendees ?? []).map(
          (item) => item.email,
        ),
        calendarKey: key,
        projectId: event?.projectId ?? null,
        organizationId: event?.organizationId ?? null,
        cancelled: external.status === "cancelled",
        updatedAt: now,
        version: (event?.version ?? 0) + 1,
        googleCalendarId: calendarId(key),
        googleEventId: external.id,
        googleEventUrl: external.htmlLink,
        googleEtag: external.etag,
        syncStatus: "synced",
        allDay: !!external.start?.date,
        recurringEventId: external.recurringEventId,
      };
      if (event) Object.assign(event, updated);
      else {
        data.meetings.push(updated);
        event = updated;
      }
      // Keep linked destinations coherent without echo loops. A local pending edit wins
      // until explicitly resolved; never overwrite it with a webhook notification.
      if (updated.groupId) {
        const shared = {
          title: updated.title,
          body: updated.body,
          startsAt: updated.startsAt,
          endsAt: updated.endsAt,
          cancelled: updated.cancelled,
          allDay: updated.allDay,
          externalParticipants: updated.externalParticipants,
        };
        for (const sibling of data.meetings.filter(
          (m) => m.id !== updated.id && m.groupId === updated.groupId,
        )) {
          if (
            Object.entries(shared).every(
              ([key, value]) =>
                JSON.stringify(sibling[key as keyof Meeting]) ===
                JSON.stringify(value),
            )
          )
            continue;
          if (
            ["pending", "error", "conflict"].includes(sibling.syncStatus ?? "")
          )
            continue;
          Object.assign(sibling, shared);
          sibling.version++;
          sibling.updatedAt = now;
          if (sibling.calendarKey === "personal") sibling.syncStatus = "local";
          else {
            sibling.syncStatus = "pending";
            enqueue(
              data,
              `calendar:${sibling.id}:${sibling.version}`,
              "calendar.push",
              { meetingId: sibling.id },
              now,
            );
          }
        }
      }
      recordActivity(data, {
        type: previous
          ? updated.cancelled
            ? "calendar.event_cancelled"
            : "calendar.event_updated"
          : "calendar.event_created",
        actorId: "google",
        timestamp: external.updated || now,
        source: "google",
        entityType: "calendar",
        entityId: id,
        projectId: updated.projectId,
        companyId: updated.organizationId,
        summary: `${updated.title} · Google Calendar`,
        metadata: { calendar: key },
        externalKey: `google:${key}:${external.id}:${external.etag}`,
      });
    }
    // Full resync only cancels missing events within the exact fetched window; never unsynced local edits.
    if (full)
      for (const event of data.meetings) {
        if (
          event.googleCalendarId === calendarId(key) &&
          event.syncStatus === "synced" &&
          !event.cancelled &&
          Date.parse(event.startsAt) >= Date.parse(ctx.now()) - 90 * 86400000 &&
          Date.parse(event.startsAt) < Date.parse(ctx.now()) + 366 * 86400000 &&
          !all.some((item) => item.id === event.googleEventId)
        ) {
          event.cancelled = true;
          event.version++;
        }
      }
    const current = data.externalConnections.find(
      (item) => item.id === connection.id,
    )!;
    current.syncToken = nextSyncToken;
    current.lastSyncAt = ctx.now();
    current.lastError = undefined;
    current.status = "connected";
  });
}
export async function renewGoogleWatch(ctx: ServiceContext, key: CalendarKey) {
  if (!ctx.env.VOUGA_PUBLIC_URL) return;
  const connection = (await ctx.repo.read()).externalConnections.find(
    (item) => item.id === `google:${key}`,
  );
  if (
    !connection?.credentials ||
    connection.channels?.some(
      (channel) =>
        Date.parse(channel.expiresAt) > Date.parse(ctx.now()) + 86400000,
    )
  )
    return;
  const channel = {
    id: randomUUID(),
    token: randomBytes(24).toString("hex"),
    expiresAt: new Date(Date.parse(ctx.now()) + 6 * 86400000).toISOString(),
  };
  await ctx.repo.transact((data) => {
    const item = data.externalConnections.find(
      (item) => item.id === connection.id,
    )!;
    item.channels = [
      ...(item.channels ?? []).filter((old) => old.expiresAt > ctx.now()),
      channel,
    ];
  });
  const token = await accessToken(ctx, key);
  try {
    const result = await api<{ resourceId: string; expiration: string }>(
      ctx,
      "google",
      `${root}${encodeURIComponent(calendarId(key))}/events/watch`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: channel.id,
          token: channel.token,
          type: "web_hook",
          address: `${publicOrigin(ctx.env)}/api/webhooks/google`,
          expiration: Date.parse(channel.expiresAt),
        }),
      },
    );
    await ctx.repo.transact((data) => {
      const current = data.externalConnections
        .find((item) => item.id === connection.id)!
        .channels!.find((item) => item.id === channel.id)!;
      current.resourceId = result.resourceId;
      current.expiresAt = new Date(Number(result.expiration)).toISOString();
    });
  } catch (error) {
    await ctx.repo.transact((data) => {
      const current = data.externalConnections.find(
        (item) => item.id === connection.id,
      )!;
      current.channels = current.channels?.filter(
        (item) => item.id !== channel.id,
      );
    });
    throw error;
  }
}

export async function resolveGoogleConflict(
  ctx: ServiceContext,
  me: Member,
  id: string,
  version: number,
  keep: "google" | "os",
) {
  const data = await ctx.repo.read(),
    event = data.meetings.find((item) => item.id === id);
  if (!event || !event.googleEventId || !event.googleCalendarId)
    throw new AppError("External event not found.", 404);
  if (
    me.role !== "admin" &&
    event.createdBy !== me.id &&
    event.calendarOwnerId !== me.id
  )
    throw new AppError("Unauthorized.", 403);
  if (event.calendarKey === "personal")
    throw new AppError("This calendar does not use Google.");
  const key = event.calendarKey ?? "office",
    token = await accessToken(ctx, key);
  const remote = await api<GoogleEvent>(
    ctx,
    "google",
    `${root}${encodeURIComponent(event.googleCalendarId)}/events/${encodeURIComponent(event.googleEventId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  await ctx.repo.transact((store) => {
    const current = store.meetings.find((item) => item.id === id)!;
    if (current.version !== version || current.syncStatus !== "conflict")
      throw new AppError("O evento mudou. Atualiza antes de resolver.", 409);
    if (
      store.integrationJobs.some(
        (job) =>
          job.kind === "calendar.push" &&
          job.payload.meetingId === id &&
          job.state === "processing" &&
          job.leaseUntil! > ctx.now(),
      )
    )
      throw new AppError("Wait for synchronization to finish.", 409);
    for (const job of store.integrationJobs.filter(
      (job) => job.kind === "calendar.push" && job.payload.meetingId === id,
    )) {
      job.state = "done";
      job.payload = {};
    }
    if (keep === "google") {
      current.title = remote.summary || "Untitled";
      current.body = remote.description || "";
      if (remote.start?.dateTime)
        current.startsAt = new Date(remote.start.dateTime).toISOString();
      if (remote.end?.dateTime)
        current.endsAt = new Date(remote.end.dateTime).toISOString();
      current.externalParticipants = (remote.attendees ?? []).map(
        (item) => item.email,
      );
      current.cancelled = remote.status === "cancelled";
      current.syncStatus = "synced";
    } else current.syncStatus = "pending";
    current.googleEtag = remote.etag;
    current.version++;
    current.updatedAt = ctx.now();
    if (keep === "os")
      enqueue(
        store,
        `conflict:${id}:${current.version}`,
        "calendar.push",
        { meetingId: id },
        ctx.now(),
      );
    for (const item of store.inbox.filter(
      (item) =>
        item.body.startsWith("Conflito no evento") && item.body.includes(id),
    ))
      item.resolved = true;
    recordActivity(store, {
      type: "calendar.conflict_resolved",
      actorId: me.id,
      timestamp: ctx.now(),
      source: "os",
      entityType: "calendar",
      entityId: id,
      projectId: current.projectId,
      companyId: current.organizationId,
      summary: `${current.title} · kept ${keep} version`,
      metadata: { keep },
    });
  });
}
