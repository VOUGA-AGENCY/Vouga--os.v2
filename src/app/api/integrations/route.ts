import { resolveGoogleConflict } from "@/services/calendar-service";
import { requireMember } from "@/application/auth";
import { runtime, api, required } from "@/services/runtime";
import {
  listRepositories,
  linkRepository,
  syncProjectGithub,
} from "@/services/github-service";
import { connectBot, telegramLink } from "@/services/telegram-service";
import { enqueue } from "@/services/activity-service";
import { errorResponse, jsonBody } from "@/foundation/http";
import { AppError, record, text } from "@/domain/validation";
export async function GET(request: Request) {
  try {
    const me = await requireMember(request),
      ctx = runtime(),
      data = await ctx.repo.read();
    if (new URL(request.url).searchParams.get("repositories") === "1") {
      if (me.role !== "admin") throw new AppError("Unauthorized.", 403);
      return Response.json({ repositories: await listRepositories(ctx) });
    }
    return Response.json({
      connections: data.externalConnections.map(
        ({ id, label, provider, status, lastError, lastSyncAt, channels }) => ({
          id,
          label,
          provider,
          status,
          lastError,
          lastSyncAt,
          watchActive: channels?.some(
            (channel) => channel.expiresAt > ctx.now(),
          ),
        }),
      ),
      configuration: {
        google: !!(
          ctx.env.GOOGLE_CLIENT_ID &&
          ctx.env.GOOGLE_CLIENT_SECRET &&
          ctx.env.INTEGRATION_ENCRYPTION_KEY
        ),
        github: !!(
          ctx.env.GITHUB_APP_ID &&
          ctx.env.GITHUB_APP_PRIVATE_KEY &&
          ctx.env.GITHUB_INSTALLATION_ID &&
          ctx.env.GITHUB_WEBHOOK_SECRET
        ),
        telegram: !!ctx.env.TELEGRAM_BOT_TOKEN,
        groq: !!ctx.env.GROQ_API_KEY,
        publicEndpoint: !!ctx.env.VOUGA_PUBLIC_URL,
        agentModel: ctx.env.GROQ_AGENT_MODEL || "openai/gpt-oss-120b",
        transcriptionModel:
          ctx.env.GROQ_TRANSCRIPTION_MODEL || "whisper-large-v3-turbo",
      },
      members: data.members
        .filter(
          (member) =>
            !member.archived &&
            member.name !== "Engineer" &&
            (me.role === "admin" || member.id === me.id),
        )
        .sort((a, b) => a.name.localeCompare(b.name, "pt"))
        .map((member) => ({
          id: member.id,
          name: member.name,
          telegramConnected: !!member.telegramChatId,
        })),
      jobs:
        me.role === "admin"
          ? data.integrationJobs
              .filter((job) => job.state === "failed" || job.error)
              .map(({ id, kind, state, error }) => ({ id, kind, state, error }))
              .slice(-20)
          : [],
      uncertainDeliveries:
        me.role === "admin"
          ? data.notificationDeliveries.filter(
              (item) => item.state === "uncertain" || item.state === "sending",
            ).length
          : 0,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const me = await requireMember(request),
      ctx = runtime(),
      body = record(await jsonBody(request));
    if (body.action === "telegram.link")
      return Response.json({ url: await telegramLink(ctx, me) });
    if (body.action === "telegram.unlink") {
      await ctx.repo.transact((data) => {
        const member = data.members.find((item) => item.id === me.id)!;
        delete member.telegramChatId;
        delete member.telegramUserId;
      });
      return Response.json({ ok: true });
    }
    if (body.action === "calendar.resolve") {
      if (!["google", "os"].includes(String(body.keep)))
        throw new AppError("Invalid choice.");
      await resolveGoogleConflict(
        ctx,
        me,
        text(body.id, "Evento", 100),
        Number(body.version),
        body.keep as "google" | "os",
      );
      return Response.json({ ok: true });
    }
    if (me.role !== "admin")
      throw new AppError(
        "Only administrators can configure integrations.",
        403,
      );
    if (body.action === "github.sync")
      await syncProjectGithub(ctx, me, text(body.projectId, "Project", 100));
    else if (body.action === "github.link")
      await linkRepository(
        ctx,
        me,
        text(body.projectId, "Project", 100),
        Number(body.repositoryId),
      );
    else if (body.action === "github.check") {
      await listRepositories(ctx);
      await ctx.repo.transact((data) => {
        const item = data.externalConnections.find(
          (item) => item.id === "github",
        );
        if (item) {
          item.status = "connected";
          item.lastError = undefined;
        } else
          data.externalConnections.push({
            id: "github",
            label: "Vouga",
            provider: "github",
            status: "connected",
          });
      });
    } else if (body.action === "telegram.connect") await connectBot(ctx);
    else if (body.action === "groq.check") {
      await api(ctx, "groq", "https://api.groq.com/openai/v1/models", {
        headers: {
          Authorization: `Bearer ${required(ctx.env, "GROQ_API_KEY")}`,
        },
      });
      await ctx.repo.transact((data) => {
        const item = data.externalConnections.find(
          (item) => item.id === "groq",
        );
        if (item) {
          item.status = "connected";
          item.lastError = undefined;
        } else
          data.externalConnections.push({
            id: "groq",
            label: "Groq",
            provider: "groq",
            status: "connected",
          });
      });
    } else if (body.action === "google.sync") {
      if (!["office", "contacto"].includes(String(body.calendarKey)))
        throw new AppError("Invalid calendar.");
      await ctx.repo.transact((data) =>
        enqueue(data, `manual:${crypto.randomUUID()}`, "calendar.pull", {
          calendarKey: body.calendarKey,
        }),
      );
    } else if (body.action === "job.retry")
      await ctx.repo.transact((data) => {
        const job = data.integrationJobs.find(
          (item) => item.id === body.id && item.state === "failed",
        );
        if (!job) throw new AppError("Job not found.");
        job.state = "pending";
        job.attempts = 0;
        job.availableAt = ctx.now();
      });
    else throw new AppError("Unknown action.");
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
