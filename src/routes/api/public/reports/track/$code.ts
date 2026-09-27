import { createFileRoute } from "@tanstack/react-router";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export const Route = createFileRoute("/api/public/reports/track/$code")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const code = (params.code ?? "").trim().toUpperCase();
        if (!code) return json({ error: "A tracking code is required." }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("reports")
          .select("*")
          .eq("tracking_code", code)
          .maybeSingle();

        if (error) return json({ error: error.message }, 500);
        if (!data) return json({ error: `No report found for ${code}.` }, 404);

        let duplicateMatch: unknown = null;
        if (data.duplicate_of) {
          const { data: parent } = await supabaseAdmin
            .from("reports")
            .select("tracking_code, category, location, severity_score, status")
            .eq("id", data.duplicate_of)
            .maybeSingle();
          duplicateMatch = parent ?? null;
        }

        const { count } = await supabaseAdmin
          .from("reports")
          .select("id", { count: "exact", head: true })
          .eq("duplicate_of", data.id);

        return json({ report: data, duplicate_match: duplicateMatch, duplicate_count: count ?? 0 });
      },
    },
  },
});
