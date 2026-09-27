import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { RESPONSIBLE_AI_LINE, severityTone, type Report } from "@/lib/report-types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Report a civic problem | CivicFix AI" },
      {
        name: "description",
        content:
          "Send a photo, a voice note, or a short description of a pothole, flooded drain, or broken streetlight and get a tracking code.",
      },
      { property: "og:title", content: "Report a civic problem | CivicFix AI" },
      {
        property: "og:description",
        content: "Report potholes, flooding, and broken streetlights with a photo and a voice note.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SubmitPage,
});

type SubmitResponse = {
  tracking_code: string;
  report: Report;
  recommended_action: string;
  duplicate_match: { tracking_code: string | null; category: string | null } | null;
  duplicate_similarity: number | null;
  mock: boolean;
};

/** Grabs a still frame partway through a video so text-plus-image analysis still works. */
async function extractVideoFrame(file: File): Promise<File | null> {
  try {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("video metadata failed"));
    });
    video.currentTime = Math.min(1.5, (video.duration || 2) / 2);
    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error("video seek failed"));
    });
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 360;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) return null;
    return new File([blob], "video-frame.jpg", { type: "image/jpeg" });
  } catch {
    return null;
  }
}

function SubmitPage() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [video, setVideo] = useState<File | null>(null);
  const [audio, setAudio] = useState<File | null>(null);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResponse | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const photoPreview = usePreview(photo);
  const videoPreview = usePreview(video);
  const audioPreview = usePreview(audio);

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setAudio(new File([blob], "voice-note.webm", { type: blob.type }));
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      setError("Could not use the microphone. You can upload an audio file instead.");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!name.trim() || !phone.trim() || !location.trim()) {
      setError("Your name, phone number, and the location are all required.");
      return;
    }
    if (!photo && !video && !audio && !description.trim()) {
      setError(
        "Add at least one piece of evidence — a photo, a video, a voice note, or a written description. Without it there is nothing to analyse.",
      );
      return;
    }

    setSubmitting(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append("reporter_name", name.trim());
      form.append("reporter_phone", phone.trim());
      form.append("location", location.trim());
      if (description.trim()) form.append("text_description", description.trim());
      if (photo) form.append("photo", photo);
      if (video) form.append("video", video);
      if (audio) form.append("audio", audio);
      // Photo always takes priority; a still frame is only pulled when there is no photo.
      if (!photo && video) {
        const frame = await extractVideoFrame(video);
        if (frame) form.append("photo", frame);
      }

      const res = await fetch("/api/public/reports", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Submission failed.");
      setResult(json as SubmitResponse);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-3xl font-bold">Report a civic problem</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        A pothole, flooded drainage, a dead streetlight — send what you have. No account needed; you get a tracking
        code to follow up.
      </p>

      <form onSubmit={submit} className="panel mt-6 space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label-text" htmlFor="name">Your name *</label>
            <input id="name" className="field" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="label-text" htmlFor="phone">Phone number *</label>
            <input
              id="phone"
              className="field"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </div>
        </div>

        <div>
          <label className="label-text" htmlFor="location">Location *</label>
          <input
            id="location"
            className="field"
            placeholder="e.g. Ngong Road near Prestige Plaza"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            required
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label-text" htmlFor="photo">Photo (optional)</label>
            <input
              id="photo"
              className="field"
              type="file"
              accept="image/*"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            />
            {photoPreview && (
              <img src={photoPreview} alt="Selected photo preview" className="mt-2 max-h-40 w-full rounded-md object-cover" />
            )}
          </div>
          <div>
            <label className="label-text" htmlFor="video">Video (optional)</label>
            <input
              id="video"
              className="field"
              type="file"
              accept="video/*"
              onChange={(e) => setVideo(e.target.files?.[0] ?? null)}
            />
            {videoPreview && <video src={videoPreview} controls className="mt-2 max-h-40 w-full rounded-md" />}
          </div>
        </div>

        <div>
          <span className="label-text">Voice note (optional)</span>
          <div className="flex flex-wrap items-center gap-3">
            {recording ? (
              <button type="button" className="btn-primary" onClick={stopRecording}>
                Stop recording
              </button>
            ) : (
              <button type="button" className="btn-ghost" onClick={startRecording}>
                Record voice note
              </button>
            )}
            <input
              className="field flex-1"
              type="file"
              accept="audio/*"
              onChange={(e) => setAudio(e.target.files?.[0] ?? null)}
            />
          </div>
          {recording && <p className="mt-2 text-sm text-primary">Recording… speak now.</p>}
          {audioPreview && !recording && <audio src={audioPreview} controls className="mt-2 w-full" />}
        </div>

        <div>
          <label className="label-text" htmlFor="description">Written description (optional)</label>
          <textarea
            id="description"
            className="field min-h-24"
            placeholder="Describe what you are seeing"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {error && <p className="rounded-md border border-destructive/50 p-3 text-sm text-destructive">{error}</p>}

        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting ? "Analysing…" : "Analyse"}
        </button>
      </form>

      {result && (
        <section className="panel mt-5 p-5">
          <p className="label-text">Save this tracking code</p>
          <p className="font-mono text-3xl font-bold text-primary">{result.tracking_code}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Keep it somewhere safe — it is the only way to{" "}
            <Link to="/track" className="underline">
              check your report
            </Link>{" "}
            later.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
              {result.report.category}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 font-mono text-xs font-semibold ${severityTone(result.report.severity_score)}`}
            >
              severity {result.report.severity_score}/10
            </span>
            <span className="rounded-full border border-border px-2 py-0.5 font-mono text-xs text-muted-foreground">
              confidence {result.report.confidence_score?.toFixed(2)}
            </span>
            {(result.report.confidence_score ?? 0) < 0.6 && (
              <span className="rounded-full bg-flag px-2 py-0.5 text-xs font-semibold text-flag-foreground">
                flagged for review
              </span>
            )}
          </div>

          {result.recommended_action && (
            <p className="mt-3 text-sm text-foreground/85">{result.recommended_action}</p>
          )}

          {result.duplicate_match && (
            <p className="mt-3 rounded-md border border-border p-3 text-sm">
              This looks like an existing report: {result.duplicate_match.tracking_code} (
              {result.duplicate_match.category}). Yours has been merged into it
              {result.duplicate_similarity ? `, similarity ${result.duplicate_similarity}` : ""}.
            </p>
          )}

          {result.mock && (
            <p className="mt-3 rounded-md border border-destructive/60 p-3 text-sm text-destructive">
              MOCK RESULT — the analysis model was unreachable, so these values are placeholders, not a real
              assessment.
            </p>
          )}

          {result.report.transcript && (
            <div className="mt-4">
              <p className="label-text">Transcript used</p>
              <p className="text-sm text-foreground/85">{result.report.transcript}</p>
            </div>
          )}

          <p className="mt-4 font-mono text-xs text-muted-foreground">
            {result.report.model_name} · {result.report.gpu_type} · {result.report.latency_ms} ms
          </p>
          <p className="mt-4 text-xs text-muted-foreground">{RESPONSIBLE_AI_LINE}</p>
        </section>
      )}
    </main>
  );
}

function usePreview(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return url;
}
