import { AppError } from "@/domain/validation";
export function errorResponse(error: unknown) {
  if (error instanceof AppError)
    return Response.json({ error: error.message }, { status: error.status });
  console.error(
    "Vouga local:",
    error instanceof Error ? error.message : "Erro inesperado",
  );
  return Response.json(
    {
      error:
        "Não foi possível guardar ou carregar os dados. Tenta novamente; consulta o terminal se persistir.",
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
    throw new AppError("Pedido inválido.");
  }
}
