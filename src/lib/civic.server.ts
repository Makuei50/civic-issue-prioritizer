/**
 * Server-only helpers for CivicFix AI: media storage, speech-to-text,
 * and the NVIDIA NIM vision-language classification call.
 */

const BUCKET = "report-media";

export type Classification = {
  category: string;
  severity_score: number;
  confidence_score: number;
  recommended_action: string;
  model_name: string;
  gpu_type: string;
  latency_ms: number;
  mock: boolean;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Uploads a file and returns a long-lived signed URL (bucket is private). */
export async function uploadMedia(file: File, kind: "photo" | "video" | "audio"): Promise<string | null> {
  const db = await admin();
  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  const path = `${kind}/${crypto.randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error } = await db.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) {
    console.error("upload failed", error);
    return null;
  }
  const { data } = await db.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 365);
  return data?.signedUrl ?? null;
}

/** Speech-to-text via the Lovable AI Gateway. Returns "" on failure. */
export async function transcribeAudio(file: File): Promise<string> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return "";
  try {
    const form = new FormData();
    form.append("file", file, file.name || "voice-note.webm");
    form.append("model", "google/gemini-3.5-transcribe");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!res.ok) {
      console.error("transcription failed", res.status, await res.text());
      return "";
    }
    const json = (await res.json()) as { text?: string };
    return (json.text ?? "").trim();
  } catch (err) {
    console.error("transcription error", err);
    return "";
  }
}

function extractJson(raw: string): Record<string, unknown> | null {
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const MODEL_ID = "nvidia/llama-3.1-nemotron-nano-vl-8b-v1";

function buildPrompt(transcript: string, location: string, hasImage: boolean, strict: boolean): string {
  const base = hasImage
    ? "You are reviewing a citizen report of a civic infrastructure problem. Here is a photo, a voice transcript, and a location."
    : "You are reviewing a citizen report of a civic infrastructure problem. NO IMAGE IS AVAILABLE for this report — reason from the text alone and treat severity and confidence as lower certainty, keeping confidence_score at or below 0.6.";
  const tail = strict
    ? " Return JSON only. No prose, no markdown, no explanation before or after the object."
    : "";
  return (
    `${base} Transcript: ${transcript || "(none provided)"}. Location: ${location}. ` +
    'Respond only with JSON in this exact shape: {"category": string, "severity_score": integer 1 to 10, ' +
    '"confidence_score": float 0 to 1, "recommended_action": string}.' +
    tail
  );
}

/**
 * Calls the NVIDIA Brev-hosted NIM endpoint (OpenAI-compatible).
 * Falls back to a clearly labelled mock when the endpoint is unset or unreachable.
 */
export async function classifyReport(args: {
  imageBase64: string | null;
  imageMime: string | null;
  transcript: string;
  location: string;
}): Promise<Classification> {
  const endpoint = process.env["BREV_MODEL_ENDPOINT"]?.replace(/\/+$/, "");
  const apiKey = process.env["BREV_API_KEY"];
  const hasImage = Boolean(args.imageBase64);

  if (!endpoint) {
    return mockClassification(hasImage, "BREV_MODEL_ENDPOINT is not set");
  }

  const callOnce = async (strict: boolean) => {
    const content: Array<Record<string, unknown>> = [
      { type: "text", text: buildPrompt(args.transcript, args.location, hasImage, strict) },
    ];
    if (args.imageBase64) {
      content.push({
        type: "image_url",
        image_url: { url: `data:${args.imageMime || "image/jpeg"};base64,${args.imageBase64}` },
      });
    }
    const started = Date.now();
    const res = await fetch(`${endpoint}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ model: MODEL_ID, messages: [{ role: "user", content }] }),
    });
    const latency = Date.now() - started;
    if (!res.ok) throw new Error(`Brev endpoint returned ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
    };
    return { json, latency, text: json.choices?.[0]?.message?.content ?? "" };
  };

  try {
    let attempt = await callOnce(false);
    let parsed = extractJson(attempt.text);
    if (!parsed) {
      attempt = await callOnce(true);
      parsed = extractJson(attempt.text);
    }
    if (!parsed) throw new Error("model did not return parsable JSON");

    const severity = Math.min(10, Math.max(1, Math.round(Number(parsed["severity_score"]) || 5)));
    let confidence = Number(parsed["confidence_score"]);
    if (!Number.isFinite(confidence)) confidence = hasImage ? 0.7 : 0.5;
    confidence = Math.min(1, Math.max(0, confidence));
    if (!hasImage) confidence = Math.min(confidence, 0.6);

    return {
      category: String(parsed["category"] || "Uncategorised"),
      severity_score: severity,
      confidence_score: confidence,
      recommended_action: String(parsed["recommended_action"] || ""),
      model_name: String(attempt.json.model || MODEL_ID).split("/").pop() || MODEL_ID,
      gpu_type: process.env["BREV_GPU_TYPE"] || "unknown",
      latency_ms: attempt.latency,
      mock: false,
    };
  } catch (err) {
    console.error("Brev classification failed", err);
    return mockClassification(hasImage, String(err));
  }
}

function mockClassification(hasImage: boolean, reason: string): Classification {
  console.warn("Returning MOCK classification:", reason);
  return {
    category: "Roads",
    severity_score: 5,
    confidence_score: hasImage ? 0.5 : 0.4,
    recommended_action: "MOCK RESULT — model endpoint unavailable. Requires human review.",
    model_name: "mock",
    gpu_type: "mock",
    latency_ms: 0,
    mock: true,
  };
}
