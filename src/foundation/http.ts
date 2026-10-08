import { ProviderError, providerFailure } from "@/services/runtime";
import { AppError } from "@/domain/validation";
export function errorResponse(error: unknown) {
  if(error instanceof ProviderError) {
    console.error(JSON.stringify({provider:error.provider,status:error.status,retryAfter:error.retryAfter}));
    const mapped=providerFailure(error);
    return Response.json({error:mapped.message},{status:mapped.status,headers:error.retryAfter?{"Retry-After":String(error.retryAfter)}:undefined});
  }
  if (error instanceof AppError)
    return Response.json({ error: error.message }, { status: error.status });
  console.error(
    "Vouga local:",
    error instanceof Error ? error.message : "Unexpected error",
  );
  return Response.json(
    {
      error:
        "Could not save or load the data. Try again; check the terminal if the problem persists.",
    },
    { status: 500 },
  );
}
export async function jsonBody(request: Request): Promise<unknown> {
  // Bound actual bytes, including chunked requests without Content-Length.
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("Pedido vazio.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 65536) {
      await reader.cancel();
      throw new AppError("Pedido demasiado grande.", 413);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError("Invalid request.");
  }
}
