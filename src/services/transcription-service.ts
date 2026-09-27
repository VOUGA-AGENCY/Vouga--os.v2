import { AppError } from "@/domain/validation";
import { api, required, type ServiceContext } from "./runtime";
export async function transcribe(ctx: ServiceContext, audio: Blob) {
  if (!audio.size || audio.size > 24 * 1024 * 1024)
    throw new AppError("Áudio vazio ou superior a 24 MB.", 413);
  if (
    !/^(audio\/(webm|ogg|mpeg|mp4|wav|x-wav|flac)|video\/webm)(;.*)?$/.test(
      audio.type,
    )
  )
    throw new AppError("Formato de áudio não suportado.");
  const form = new FormData();
  form.set(
    "model",
    ctx.env.GROQ_TRANSCRIPTION_MODEL || "whisper-large-v3-turbo",
  );
  form.set("language", "pt");
  form.set("response_format", "json");
  form.set(
    "file",
    audio,
    audio.type.includes("ogg")
      ? "voice.ogg"
      : audio.type.includes("mp4")
        ? "voice.m4a"
        : audio.type.includes("mpeg")
          ? "voice.mp3"
          : audio.type.includes("wav")
            ? "voice.wav"
            : "voice.webm",
  );
  const result = await api<{ text: string }>(
    ctx,
    "groq",
    "https://api.groq.com/openai/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${required(ctx.env, "GROQ_API_KEY")}` },
      body: form,
    },
  );
  return result.text;
}
