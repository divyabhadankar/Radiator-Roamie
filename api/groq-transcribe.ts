import type { VercelRequest, VercelResponse } from "@vercel/node";

const GROQ_BASE = "https://api.groq.com/openai/v1";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;
  if (!apiKey) {
    return res
      .status(500)
      .json({ error: "GROQ_API_KEY is not configured on the server." });
  }

  const { audio, mimeType, language } = req.body ?? {};

  if (!audio || typeof audio !== "string") {
    return res
      .status(400)
      .json({ error: "audio (base64 string) is required." });
  }

  let audioBuffer: Buffer;
  try {
    audioBuffer = Buffer.from(audio, "base64");
  } catch {
    return res.status(400).json({ error: "Invalid base64 audio data." });
  }

  if (audioBuffer.byteLength < 100) {
    return res.status(400).json({ error: "EMPTY_AUDIO" });
  }

  const mime: string = mimeType || "audio/webm";
  const ext = mime.includes("ogg")
    ? "ogg"
    : mime.includes("mp4") || mime.includes("m4a")
      ? "mp4"
      : "webm";

  // Build multipart/form-data using native FormData (Node 18+)
  const formData = new FormData();
  const audioBlob = new Blob([audioBuffer], { type: mime });
  formData.append("file", audioBlob, `recording.${ext}`);
  formData.append("model", "whisper-large-v3-turbo");
  formData.append("response_format", "text");
  formData.append("temperature", "0");

  const langCode = typeof language === "string"
    ? language.split("-")[0].toLowerCase()
    : "en";
  if (langCode) {
    formData.append("language", langCode);
  }

  let groqRes: Response;
  try {
    groqRes = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });
  } catch (networkErr: any) {
    return res.status(502).json({
      error: `Network error reaching Groq: ${networkErr?.message ?? "unknown"}`,
    });
  }

  if (!groqRes.ok) {
    const errText = await groqRes.text().catch(() => "");
    if (groqRes.status === 401)
      return res.status(401).json({ error: "INVALID_API_KEY" });
    if (groqRes.status === 429)
      return res.status(429).json({ error: "RATE_LIMIT" });
    if (groqRes.status === 413)
      return res.status(413).json({ error: "AUDIO_TOO_LARGE" });
    return res.status(groqRes.status).json({
      error: `Groq Whisper error [${groqRes.status}]: ${errText.slice(0, 300)}`,
    });
  }

  const transcript = await groqRes.text();
  const cleaned = transcript.trim();

  if (!cleaned) {
    return res.status(200).json({ transcript: "", empty: true });
  }

  return res.status(200).json({ transcript: cleaned });
}
