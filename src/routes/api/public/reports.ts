import { createFileRoute } from "@tanstack/react-router";
import { classifyReport, transcribeAudio, uploadMedia } from "@/lib/civic.server";
import { cosineSimilarity, sameLocation } from "@/lib/similarity";

type ReportRow = {
  id: string;
  tracking_code: string | null;
  reporter_name: string | null;
  reporter_phone: string | null;
  photo_url: string | null;
  video_url: string | null;
  text_description: string | null;
  transcript: string | null;
  location: string | null;
  category: string | null;
  severity_score: number | null;
  confidence_score: number | null;
  duplicate_of: string | null;
  model_name: string | null;
  gpu_type: string | null;
  latency_ms: number | null;
  status: string | null;
  created_at: string | null;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function handleGet() {
  const supabase = await db();
  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .order("severity_score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) return json({ error: error.message }, 500);

  const rows = (data ?? []) as ReportRow[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const duplicatesByParent = new Map<string, ReportRow[]>();
  const top: ReportRow[] = [];

  for (const row of rows) {
    if (row.duplicate_of && byId.has(row.duplicate_of)) {
      const list = duplicatesByParent.get(row.duplicate_of) ?? [];
      list.push(row);
      duplicatesByParent.set(row.duplicate_of, list);
    } else {
      top.push(row);
    }
  }

  const reports = top.map((row) => {
    const duplicates = duplicatesByParent.get(row.id) ?? [];
    return { ...row, duplicates, duplicate_count: duplicates.length };
  });

  return json({ reports, total: rows.length });
}

async function handlePost({ request }: { request: Request }) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Expected a multipart form submission." }, 400);
  }

  const str = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  const file = (k: string) => {
    const v = form.get(k);
    return v instanceof File && v.size > 0 ? v : null;
  };

  const reporterName = str("reporter_name");
  const reporterPhone = str("reporter_phone");
  const location = str("location");
  const textDescription = str("text_description");
  const photo = file("photo");
  const video = file("video");
  const audio = file("audio");

  if (!reporterName || !reporterPhone || !location) {
    return json({ error: "Name, phone number, and location are all required." }, 400);
  }
  if (!photo && !video && !audio && !textDescription) {
    return json(
      {
        error:
          "Add some evidence: a photo, a video, a voice note, or a written description. The model needs something to reason over.",
      },
      400,
    );
  }

  // 1 & 2. Media storage. Photo takes priority; video is stored either way.
  const photoUrl = photo ? await uploadMedia(photo, "photo") : null;
  const videoUrl = video ? await uploadMedia(video, "video") : null;

  // 3 & 4. Voice note transcription combined with any written note.
  let transcript = "";
  const voiceText = audio ? await transcribeAudio(audio) : "";
  if (voiceText && textDescription) {
    transcript = `Voice note: ${voiceText}. Written note: ${textDescription}`;
  } else if (voiceText) {
    transcript = voiceText;
  } else if (textDescription) {
    transcript = textDescription;
  }

  // 5. Classification on the NVIDIA NIM vision-language model.
  let imageBase64: string | null = null;
  let imageMime: string | null = null;
  if (photo) {
    const bytes = new Uint8Array(await photo.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
    imageBase64 = btoa(binary);
    imageMime = photo.type || "image/jpeg";
  }

  const result = await classifyReport({ imageBase64, imageMime, transcript, location });

  // 6. Duplicate detection against existing reports.
  const supabase = await db();
  const { data: existing } = await supabase
    .from("reports")
    .select("id, transcript, location, duplicate_of, tracking_code, category")
    .order("created_at", { ascending: true })
    .limit(2000);

  let duplicateOf: string | null = null;
  let bestScore = 0;
  for (const candidate of (existing ?? []) as ReportRow[]) {
    if (!candidate.location || !sameLocation(location, candidate.location)) continue;
    const score = cosineSimilarity(transcript, candidate.transcript ?? "");
    if (score > 0.75 && score > bestScore) {
      bestScore = score;
      duplicateOf = candidate.duplicate_of ?? candidate.id;
    }
  }

  // 7-9. Insert (tracking_code is assigned by the database trigger) and return.
  const { data: inserted, error } = await supabase
    .from("reports")
    .insert({
      reporter_name: reporterName,
      reporter_phone: reporterPhone,
      photo_url: photoUrl,
      video_url: videoUrl,
      text_description: textDescription || null,
      transcript: transcript || null,
      location,
      category: result.category,
      severity_score: result.severity_score,
      confidence_score: result.confidence_score,
      duplicate_of: duplicateOf,
      model_name: result.model_name,
      gpu_type: result.gpu_type,
      latency_ms: result.latency_ms,
    })
    .select("*")
    .single();

  if (error) return json({ error: error.message }, 500);

  let duplicateMatch: { tracking_code: string | null; category: string | null } | null = null;
  if (duplicateOf) {
    const { data: parent } = await supabase
      .from("reports")
      .select("tracking_code, category")
      .eq("id", duplicateOf)
      .maybeSingle();
    duplicateMatch = parent ?? null;
  }

  return json({
    tracking_code: inserted?.tracking_code,
    report: inserted,
    recommended_action: result.recommended_action,
    duplicate_match: duplicateMatch,
    duplicate_similarity: bestScore ? Number(bestScore.toFixed(2)) : null,
    mock: result.mock,
  });
}

export const Route = createFileRoute("/api/public/reports")({
  server: { handlers: { GET: handleGet, POST: handlePost } },
});
