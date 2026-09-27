import { createFileRoute } from "@tanstack/react-router";
import { buildDemoReports, type DemoReport } from "@/lib/demo-reports";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/**
 * One-time demo loader.
 * POST with {"reports": [...]} to load a prepared JSON payload, or POST with an
 * empty body to load the 247 generated demo reports.
 * Add {"reset": true} to clear the table first.
 */
export const Route = createFileRoute("/api/public/reports/seed")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { reports?: DemoReport[]; reset?: boolean } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          body = {};
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        if (body.reset) {
          await supabaseAdmin.from("reports").update({ duplicate_of: null }).not("duplicate_of", "is", null);
          await supabaseAdmin.from("reports").delete().not("id", "is", null);
        }

        const rows = body.reports?.length ? body.reports : buildDemoReports();

        // Insert in batches so the tracking-code trigger numbers them sequentially.
        const inserted: string[] = [];
        for (let i = 0; i < rows.length; i += 50) {
          const batch = rows.slice(i, i + 50);
          const { data, error } = await supabaseAdmin.from("reports").insert(batch).select("tracking_code");
          if (error) return json({ error: error.message, inserted: inserted.length }, 500);
          for (const row of data ?? []) if (row.tracking_code) inserted.push(row.tracking_code);
        }

        // Link duplicates: same location + highly similar transcript.
        const { cosineSimilarity, sameLocation } = await import("@/lib/similarity");
        const { data: all } = await supabaseAdmin
          .from("reports")
          .select("id, transcript, location, duplicate_of")
          .order("created_at", { ascending: true })
          .limit(2000);

        let linked = 0;
        const seen: Array<{ id: string; transcript: string; location: string }> = [];
        for (const row of all ?? []) {
          const transcript = row.transcript ?? "";
          const location = row.location ?? "";
          const match = seen.find(
            (s) => sameLocation(location, s.location) && cosineSimilarity(transcript, s.transcript) > 0.75,
          );
          if (match && !row.duplicate_of) {
            const { error } = await supabaseAdmin
              .from("reports")
              .update({ duplicate_of: match.id })
              .eq("id", row.id);
            if (!error) linked += 1;
          } else if (!match) {
            seen.push({ id: row.id, transcript, location });
          }
        }

        return json({ inserted: inserted.length, duplicates_linked: linked, first: inserted[0], last: inserted.at(-1) });
      },
    },
  },
});
