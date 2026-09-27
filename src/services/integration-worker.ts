import { randomUUID } from "node:crypto";
import {
  pushCalendarEvent,
  pullCalendar,
  renewGoogleWatch,
} from "./calendar-service";
import { applyGithubEvent, type GithubPayload } from "./github-service";
import { applyTelegramUpdate, deliverReminders } from "./telegram-service";
import { connectionError, type ServiceContext } from "./runtime";
import type { CalendarKey } from "@/domain/integration-model";
export async function processJobs(ctx: ServiceContext, limit = 10) {
  for (let index = 0; index < limit; index++) {
    const token = randomUUID();
    const job = await ctx.repo.transact((data) => {
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
      if (job.kind === "telegram.update")
        await applyTelegramUpdate(
          ctx,
          job.payload as unknown as Parameters<typeof applyTelegramUpdate>[1],
        );
      await ctx.repo.transact((data) => {
        const item = data.integrationJobs.find((item) => item.id === job.id)!;
        if (item.leaseToken === token) {
          item.state = "done";
          item.payload = {};
        }
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha de integração";
      console.error(
        JSON.stringify({
          job: job.id,
          kind: job.kind,
          error: message.replace(/https?:\/\/\S+/g, "[endpoint]"),
        }),
      );
      await ctx.repo.transact((data) => {
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
  await processJobs(ctx);
  for (const key of ["office", "contacto"] as CalendarKey[])
    try {
      await renewGoogleWatch(ctx, key);
    } catch (error) {
      await connectionError(ctx, `google:${key}`, error);
    }
}
