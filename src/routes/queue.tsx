import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RESPONSIBLE_AI_LINE, severityTone, type QueueEntry } from "@/lib/report-types";

export const Route = createFileRoute("/queue")({
  head: () => ({
    meta: [
      { title: "Priority queue | CivicFix AI" },
      {
        name: "description",
        content:
          "Every civic report ranked by severity, with duplicate reports grouped together, so crews know what to fix first.",
      },
      { property: "og:title", content: "Priority queue | CivicFix AI" },
      {
        property: "og:description",
        content: "Civic infrastructure reports ranked by severity with duplicates merged.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: QueuePage,
});

function QueuePage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["queue"],
    queryFn: async () => {
      const res = await fetch("/api/public/reports");
      if (!res.ok) throw new Error("Could not load the priority queue.");
      return (await res.json()) as { reports: QueueEntry[]; total: number };
    },
  });

  const reports = data?.reports ?? [];

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Priority queue</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Highest severity first. Matching reports are merged into one entry.
          </p>
        </div>
        <button className="btn-ghost" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <p className="panel mt-5 p-4 text-sm text-muted-foreground">{RESPONSIBLE_AI_LINE}</p>

      {isLoading && <p className="mt-6 text-sm text-muted-foreground">Loading reports…</p>}
      {error && <p className="mt-6 text-sm text-destructive">{(error as Error).message}</p>}

      {!isLoading && !error && (
        <p className="mt-6 text-xs uppercase tracking-widest text-muted-foreground">
          {reports.length} prioritised {reports.length === 1 ? "issue" : "issues"} · {data?.total ?? 0} total reports
        </p>
      )}

      <ol className="mt-3 space-y-3">
        {reports.map((report, index) => {
          const flagged = (report.confidence_score ?? 0) < 0.6;
          return (
            <li key={report.id} className="panel p-4">
              <div className="flex items-start gap-4">
                <span className="mt-0.5 font-mono text-sm text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">{report.category ?? "Uncategorised"}</h2>
                    <span
                      className={`rounded-full px-2 py-0.5 font-mono text-xs font-semibold ${severityTone(report.severity_score)}`}
                    >
                      severity {report.severity_score ?? "—"}/10
                    </span>
                    <span className="rounded-full border border-border px-2 py-0.5 font-mono text-xs text-muted-foreground">
                      confidence {report.confidence_score?.toFixed(2) ?? "—"}
                    </span>
                    {flagged && (
                      <span className="rounded-full bg-flag px-2 py-0.5 text-xs font-semibold text-flag-foreground">
                        flagged for review
                      </span>
                    )}
                    {report.duplicate_count > 0 && (
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
                        +{report.duplicate_count} duplicate{report.duplicate_count === 1 ? "" : "s"} merged
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{report.location}</p>
                  {report.transcript && (
                    <p className="mt-2 line-clamp-2 text-sm text-foreground/85">{report.transcript}</p>
                  )}
                  <p className="mt-2 font-mono text-xs text-muted-foreground">
                    {report.tracking_code} · {report.status} · {report.model_name ?? "—"}
                    {report.latency_ms ? ` · ${report.latency_ms} ms` : ""}
                    {report.gpu_type ? ` · ${report.gpu_type}` : ""}
                  </p>

                  {report.duplicates.length > 0 && (
                    <details className="mt-3 rounded-md border border-border/70 p-3">
                      <summary className="cursor-pointer text-sm font-medium">
                        Merged reports ({report.duplicates.length})
                      </summary>
                      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                        {report.duplicates.map((dup) => (
                          <li key={dup.id} className="font-mono text-xs">
                            {dup.tracking_code} · {dup.location} · severity {dup.severity_score ?? "—"}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
                {report.photo_url && (
                  <img
                    src={report.photo_url}
                    alt={`${report.category ?? "Report"} at ${report.location ?? ""}`}
                    className="hidden size-24 rounded-md object-cover sm:block"
                  />
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </main>
  );
}
