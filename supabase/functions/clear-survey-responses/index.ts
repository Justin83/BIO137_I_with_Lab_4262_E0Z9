import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";

const ALLOWED_ORIGINS = [
  "https://justin83.github.io",
  "http://localhost",
  "http://localhost:3000",
  "http://127.0.0.1",
];

const ALLOWED_INSTANCE_KEYS = [
  "bio137_2026_summer_e0z9_start_here_feedback",
];

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.some((o) => origin.startsWith(o))
    ? origin
    : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: "Invalid JSON" }),
      { status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } },
    );
  }

  const instanceKey = body.instance_key;
  if (typeof instanceKey !== "string" || !ALLOWED_INSTANCE_KEYS.includes(instanceKey)) {
    return new Response(
      JSON.stringify({ ok: false, error: "Unknown survey instance." }),
      { status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } },
    );
  }

  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!dbUrl) {
    return new Response(
      JSON.stringify({ ok: false, error: "Server configuration error." }),
      { status: 500, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } },
    );
  }

  const sql = postgres(dbUrl, { prepare: false });
  try {
    const result = await sql`
      DELETE FROM course_survey.survey_submissions
      WHERE survey_instance_id = (
        SELECT id FROM course_survey.survey_instances
        WHERE instance_key = ${instanceKey}
      )
    `;

    return new Response(
      JSON.stringify({ ok: true, deleted_count: result.count ?? 0 }),
      { status: 200, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Delete error:", msg);
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } },
    );
  } finally {
    await sql.end();
  }
});
