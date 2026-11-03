import { telegramEnabled } from "@/services/features";
import { enqueue } from "./activity-service";
import { dateKey } from "@/domain/time";
import type { CreationNotice } from "./creation-notifications";
import { randomUUID } from "node:crypto";
import {
  pushCalendarEvent,
  pullCalendar,
  renewGoogleWatch,
} from "./calendar-service";
import { applyGithubEvent, type GithubPayload } from "./github-service";
import { applyTelegramUpdate, deliverReminders, deliverCreationNotice } from "./telegram-service";
import { connectionError, type ServiceContext } from "./runtime";
import type { CalendarKey } from "@/domain/integration-model";
export async function processJobs(ctx: ServiceContext, limit = 10) {
  const queue = ctx.repo.scoped?.(["integrationJobs"]) ?? ctx.repo;
  for (let index = 0; index < limit; index++) {
    const token = randomUUID();
    const job = await queue.transact((data) => {
      if (!telegramEnabled(ctx.env)) {
        // Preserve payload/history but retire pending messages: never replay old notifications on re-enable.
        for (const item of data.integrationJobs) {
          if (item.kind.startsWith("telegram.") &&
              (item.state === "pending" || (item.state === "processing" && item.leaseUntil! <= ctx.now()))) {
            item.state = "failed";
            item.error = "Suspended by TELEGRAM_ENABLED; automatic replay disabled.";
          }
        }
      }
      // A single leased consumer preserves ordering for external events and cursors.
      if (
        data.integrationJobs.some(
          (item) => item.state === "processing" && item.leaseUntil! > ctx.now(),
        )
      )
        return null;
      const item = data.integrationJobs.find(
        (item) =>
          (item.state === "pending" && item.availableAt <= ctx.now()) ||
          (item.state === "processing" && item.leaseUntil! <= ctx.now()),
      );
      if (!item) return null;
      item.state = "processing";
      item.attempts++;
      item.leaseToken = token;
      item.leaseUntil = new Date(
        Date.parse(ctx.now()) + 10 * 60000,
      ).toISOString();
      return structuredClone(item);
    });
    if (!job) break;
    try {
      if (job.kind === "calendar.push")
        await pushCalendarEvent(ctx, String(job.payload.meetingId));
      if (job.kind === "calendar.pull")
        await pullCalendar(ctx, job.payload.calendarKey as CalendarKey);
      if (job.kind === "github.event")
        await applyGithubEvent(
          ctx,
          String(job.payload.delivery),
          String(job.payload.event),
          job.payload.body as unknown as GithubPayload,
        );
      if (job.kind === "telegram.created")
        await deliverCreationNotice(ctx, job.key, job.payload as CreationNotice);
      if (job.kind === "telegram.update")
        await applyTelegramUpdate(
          ctx,
          job.payload as unknown as Parameters<typeof applyTelegramUpdate>[1],
        );
      await queue.transact((data) => {
        const item = data.integrationJobs.find((item) => item.id === job.id)!;
        if (item.leaseToken === token) {
          item.state = "done";
          item.payload = {};
        }
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Integration failed";
      console.error(
        JSON.stringify({
          job: job.id,
          kind: job.kind,
          error: message.replace(/https?:\/\/\S+/g, "[endpoint]"),
        }),
      );
      await queue.transact((data) => {
        const item = data.integrationJobs.find((item) => item.id === job.id)!;
        if (item.leaseToken !== token) return;
        item.state = item.attempts >= 5 ? "failed" : "pending";
        item.error = message.slice(0, 300);
        item.availableAt = new Date(
          Date.parse(ctx.now()) +
            Math.min(3600, 30 * 2 ** item.attempts) * 1000,
        ).toISOString();
      });
    }
  }
}
export async function runIntegrationTick(ctx: ServiceContext) {
  try {
    await deliverReminders(ctx);
  } catch (error) {
    await connectionError(ctx, "telegram", error);
  }
  // Advance the rolling window even when Google has no changes to notify us about.
  const maintenance = ctx.repo.scoped?.(["externalConnections", "integrationJobs"]) ?? ctx.repo;
  await maintenance.transact((data) => {
    for (const key of ["office", "contacto"] as CalendarKey[]) {
      const connection = data.externalConnections.find((item) => item.id === `google:${key}`);
      if (connection?.credentials && (!connection.lastSyncAt || dateKey(connection.lastSyncAt) < dateKey(ctx.now())))
        enqueue(data, `calendar-window:${key}:${dateKey(ctx.now())}`, "calendar.pull", { calendarKey: key }, ctx.now());
    }
  });
  await processJobs(ctx);
  for (const key of ["office", "contacto"] as CalendarKey[])
    try {
      await renewGoogleWatch({ ...ctx, repo: ctx.repo.scoped?.(["externalConnections"]) ?? ctx.repo }, key);
    } catch (error) {
      await connectionError(ctx, `google:${key}`, error);
    }
}
