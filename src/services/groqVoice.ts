// ─────────────────────────────────────────────────────────────────────────────
// Groq Voice Service  v2
// • Speech-to-Text  → Groq Whisper API (whisper-large-v3-turbo)
// • Text-to-Speech  → Browser SpeechSynthesis (language-aware)
// ─────────────────────────────────────────────────────────────────────────────

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY as string;
const GROQ_BASE = "https://api.groq.com/openai/v1";
const WHISPER_MODEL = "whisper-large-v3-turbo";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface RecordingHandle {
  /** Stop recording and return the audio Blob */
  stop: () => Promise<Blob>;
  /** Abort without returning audio */
  abort: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Pick the best MediaRecorder MIME type supported by this browser */
function getBestMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
    "",
  ];
  return candidates.find((t) => !t || MediaRecorder.isTypeSupported(t)) ?? "";
}

/** Map MIME type → file extension Groq Whisper accepts */
function mimeToExt(mimeType: string): string {
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "mp4";
  return "webm";
}

// ─────────────────────────────────────────────────────────────────────────────
// Recording
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Start recording from the microphone.
 * Returns a handle with `stop()` and `abort()` methods.
 *
 * @throws if the user denies microphone permission
 */
export async function startGroqRecording(): Promise<RecordingHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      channelCount: 1,
      sampleRate: 16000,
    },
  });

  const mimeType = getBestMimeType();
  const mediaRecorder = new MediaRecorder(
    stream,
    mimeType ? { mimeType } : undefined,
  );
  const chunks: Blob[] = [];
  let stopped = false;

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  // 250 ms time-slices — low-latency without too many tiny chunks
  mediaRecorder.start(250);

  const cleanupStream = () =>
    stream.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        /* ignore */
      }
    });

  return {
    stop: () =>
      new Promise<Blob>((resolve, reject) => {
        if (stopped) {
          reject(new Error("Recording already stopped"));
          return;
        }
        stopped = true;

        const finalize = () => {
          cleanupStream();
          if (chunks.length === 0) {
            reject(new Error("EMPTY_AUDIO"));
            return;
          }
          const blob = new Blob(chunks, {
            type: mediaRecorder.mimeType || "audio/webm",
          });
          resolve(blob);
        };

        mediaRecorder.onstop = finalize;

        try {
          if (mediaRecorder.state !== "inactive") {
            mediaRecorder.requestData(); // flush any buffered data
            mediaRecorder.stop();
          } else {
            finalize();
          }
        } catch (err) {
          cleanupStream();
          reject(err);
        }
      }),

    abort: () => {
      if (stopped) return;
      stopped = true;
      try {
        if (mediaRecorder.state !== "inactive") mediaRecorder.stop();
      } catch {
        /* ignore */
      }
      cleanupStream();
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Transcription (Groq Whisper)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transcribe an audio Blob using Groq's Whisper API.
 *
 * @param audioBlob  – Blob from MediaRecorder
 * @param language   – BCP-47 / ISO 639-1 language code (e.g. "hi", "en", "ta")
 */
export async function transcribeWithGroq(
  audioBlob: Blob,
  language = "en",
): Promise<string> {
  if (!GROQ_API_KEY) {
    throw new Error(
      "VITE_GROQ_API_KEY is not configured. Add it to your .env file.",
    );
  }

  if (!audioBlob || audioBlob.size < 500) {
    throw new Error("EMPTY_AUDIO");
  }

  const ext = mimeToExt(audioBlob.type || "audio/webm");

  // Groq Whisper requires the filename to have a recognised audio extension
  const file = new File([audioBlob], `recording.${ext}`, {
    type: audioBlob.type || "audio/webm",
  });

  const formData = new FormData();
  formData.append("file", file);
  formData.append("model", WHISPER_MODEL);
  formData.append("response_format", "text");
  formData.append("temperature", "0");

  // Strip region subtag — Whisper uses ISO 639-1 (e.g. "hi", not "hi-IN")
  const langCode = language.split("-")[0].toLowerCase();
  // Only send language param when it's not English (speeds up English inference)
  if (langCode && langCode !== "en") {
    formData.append("language", langCode);
  }

  let res: Response;
  try {
    res = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: formData,
    });
  } catch (networkErr: unknown) {
    throw new Error(
      `Network error while reaching Groq API: ${(networkErr as Error).message}`,
    );
  }

  if (!res.ok) {
    let errBody = "";
    try {
      errBody = await res.text();
    } catch {
      /* ignore */
    }

    if (res.status === 401)
      throw new Error(
        "INVALID_API_KEY: Your Groq API key is invalid or expired.",
      );
    if (res.status === 429)
      throw new Error(
        "RATE_LIMIT: Groq rate limit exceeded. Please wait a moment.",
      );
    if (res.status === 413)
      throw new Error(
        "AUDIO_TOO_LARGE: Recording is too long. Please keep it under 25 MB.",
      );

    throw new Error(
      `Groq Whisper error [${res.status}]: ${errBody.slice(0, 300)}`,
    );
  }

  const text = await res.text();
  const cleaned = text.trim();

  if (!cleaned) throw new Error("EMPTY_TRANSCRIPT");
  return cleaned;
}

// ─────────────────────────────────────────────────────────────────────────────
// Text-to-Speech  (language-aware browser SpeechSynthesis)
// ─────────────────────────────────────────────────────────────────────────────

// Map app language codes → BCP-47 for SpeechSynthesis
const LANG_TO_BCP47: Record<string, string> = {
  en: "en-US",
  hi: "hi-IN",
  bn: "bn-IN",
  te: "te-IN",
  mr: "mr-IN",
  ta: "ta-IN",
  gu: "gu-IN",
  kn: "kn-IN",
  ml: "ml-IN",
  pa: "pa-IN",
  ur: "ur-PK",
  or: "or-IN",
  fr: "fr-FR",
  es: "es-ES",
  de: "de-DE",
  pt: "pt-PT",
  ar: "ar-SA",
  ja: "ja-JP",
  zh: "zh-CN",
  ko: "ko-KR",
  ru: "ru-RU",
  it: "it-IT",
  tr: "tr-TR",
  th: "th-TH",
  vi: "vi-VN",
  id: "id-ID",
  nl: "nl-NL",
  pl: "pl-PL",
  sv: "sv-SE",
};

/** Strip Markdown / JSON noise so TTS sounds natural */
function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]*`/g, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/#{1,6}\s/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/>\s?/g, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 600);
}

/**
 * Speak text aloud using the browser's SpeechSynthesis API.
 */
export function speakText(text: string, lang = "en"): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;

  const plain = stripMarkdown(text);
  if (!plain) return;

  window.speechSynthesis.cancel();

  const bcp47 = LANG_TO_BCP47[lang] ?? "en-US";
  const utter = new SpeechSynthesisUtterance(plain);
  utter.lang = bcp47;
  utter.rate = 1.0;
  utter.pitch = 1.0;
  utter.volume = 1;

  const pickVoice = () => {
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) {
      // No voices loaded yet — just speak without a specific voice
      window.speechSynthesis.speak(utter);
      return;
    }

    const langPrefix = bcp47.split("-")[0];

    const preferred =
      voices.find(
        (v) =>
          v.lang === bcp47 &&
          (v.name.includes("Google") ||
            v.name.includes("Microsoft") ||
            v.name.includes("Siri") ||
            v.name.includes("Natural")),
      ) ||
      voices.find((v) => v.lang === bcp47) ||
      voices.find((v) => v.lang.startsWith(langPrefix)) ||
      voices.find(
        (v) =>
          v.lang.startsWith("en") &&
          !v.name.toLowerCase().includes("zira") &&
          !v.name.toLowerCase().includes("hazel"),
      );

    if (preferred) utter.voice = preferred;
    window.speechSynthesis.speak(utter);
  };

  // Chrome loads voices asynchronously on first call
  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    pickVoice();
  } else {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.onvoiceschanged = null;
      pickVoice();
    };
    // Fallback: if the event never fires, try after 800 ms
    setTimeout(() => {
      if (utter && !utter.voice) {
        try {
          window.speechSynthesis.speak(utter);
        } catch {
          /* ignore */
        }
      }
    }, 800);
  }
}

/** Stop any ongoing speech synthesis immediately. */
export function stopSpeaking(): void {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

/** Pre-warm the voice list (call once on app load / component mount). */
export function preloadVoices(): void {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = null;
    };
  }
}
