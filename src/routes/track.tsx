import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { severityTone, type Report } from "@/lib/report-types";

export const Route = createFileRoute("/track")({
  head: () => ({
    meta: [
      { title: "Track a report | CivicFix AI" },
      {
        name: "description",
        content: "Enter your CivicFix tracking code to see the category, severity, and status of your report.",
      },
      { property: "og:title", content: "Track a report | CivicFix AI" },
      { property: "og:description", content: "Look up a civic report with its tracking code." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TrackPage,
});

type TrackResult = {
  report: Report;
  duplicate_match: { tracking_code: string | null; category: string | null; location?: string | null } | null;
  duplicate_count: number;
};

function TrackPage() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TrackResult | null>(null);

  async function lookUp(event: React.FormEvent) {
    event.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/public/reports/track/${encodeURIComponent(code.trim())}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Lookup failed.");
      setResult(json as TrackResult);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const report = result?.report;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-3xl font-bold">Track a report</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Enter the tracking code you were given when you submitted, for example CFX-2026-0001.
      </p>

      <form onSubmit={lookUp} className="panel mt-6 flex flex-wrap gap-3 p-4">
        <input
          className="field flex-1 font-mono uppercase"
          placeholder="CFX-2026-0001"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "Looking up…" : "Look up"}
        </button>
      </form>

      {error && <p className="panel mt-4 p-4 text-sm text-destructive">{error}</p>}

      {report && (
        <section className="panel mt-4 p-5">
          <p className="font-mono text-sm text-muted-foreground">{report.tracking_code}</p>
          <h2 className="mt-1 text-2xl font-bold">{report.category ?? "Uncategorised"}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <span
              className={`rounded-full px-2 py-0.5 font-mono text-xs font-semibold ${severityTone(report.severity_score)}`}
            >
              severity {report.severity_score ?? "—"}/10
            </span>
            <span className="rounded-full border border-border px-2 py-0.5 font-mono text-xs text-muted-foreground">
              confidence {report.confidence_score?.toFixed(2) ?? "—"}
            </span>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
              status: {report.status}
            </span>
            {(report.confidence_score ?? 0) < 0.6 && (
              <span className="rounded-full bg-flag px-2 py-0.5 text-xs font-semibold text-flag-foreground">
                flagged for review
              </span>
            )}
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            <div>
              <dt className="label-text">Location</dt>
              <dd>{report.location}</dd>
            </div>
            {report.transcript && (
              <div>
                <dt className="label-text">What was reported</dt>
                <dd className="text-foreground/85">{report.transcript}</dd>
              </div>
            )}
            <div>
              <dt className="label-text">Duplicate match</dt>
              <dd>
                {result?.duplicate_match
                  ? `Merged into ${result.duplicate_match.tracking_code} (${result.duplicate_match.category})`
                  : result && result.duplicate_count > 0
                    ? `${result.duplicate_count} other report${result.duplicate_count === 1 ? "" : "s"} merged into this one`
                    : "None"}
              </dd>
            </div>
          </dl>
          {report.photo_url && (
            <img
              src={report.photo_url}
              alt={`${report.category ?? "Report"} at ${report.location ?? ""}`}
              className="mt-4 max-h-72 w-full rounded-md object-cover"
            />
          )}
        </section>
      )}
    </main>
  );
}
