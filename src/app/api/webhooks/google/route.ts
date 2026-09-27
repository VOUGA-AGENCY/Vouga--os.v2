import { runtime, equal } from "@/services/runtime";
import { enqueue } from "@/services/activity-service";
import { errorResponse } from "@/foundation/http";
import { AppError } from "@/domain/validation";
export async function POST(request: Request) {
  try {
    const ctx = runtime(),
      id = request.headers.get("X-Goog-Channel-Id"),
      resource = request.headers.get("X-Goog-Resource-Id"),
      message = request.headers.get("X-Goog-Message-Number") || "";
    const data = await ctx.repo.read(),
      connection = data.externalConnections.find(
        (item) =>
          item.provider === "google" &&
          item.channels?.some((channel) => channel.id === id),
      );
    const channel = connection?.channels?.find((item) => item.id === id);
    if (
      !channel ||
      channel.expiresAt <= ctx.now() ||
      !equal(
        channel.token,
        request.headers.get("X-Goog-Channel-Token") || "",
      ) ||
      (channel.resourceId && channel.resourceId !== resource) ||
      !/^\d+$/.test(message)
    )
      throw new AppError("Canal inválido.", 403);
    await ctx.repo.transact((store) =>
      enqueue(
        store,
        `google:${id}:${message}`,
        "calendar.pull",
        { calendarKey: connection!.id.split(":")[1] },
        ctx.now(),
      ),
    );
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
