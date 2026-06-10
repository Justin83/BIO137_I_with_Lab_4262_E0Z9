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

const ALLOWED_QUESTION_KEYS = [
  "navigation_easy",
  "organized_info",
  "course_info_found",
  "first_steps_clear",
  "improvement_suggestion",
];

const LIKERT_QUESTION_KEYS = new Set([
  "navigation_easy",
  "organized_info",
  "course_info_found",
  "first_steps_clear",
]);

const VALID_LIKERT_VALUES = new Set([
  "strongly_agree",
  "agree",
  "disagree",
  "strongly_disagree",
]);

const MAX_TEXT_LENGTH = 1000;

const SUSPICIOUS_PATTERNS = [
  /<script/i,
  /javascript:/i,
  /on\w+\s*=/i,
  /union\s+select/i,
  /drop\s+table/i,
];

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.some((o) => origin.startsWith(o))
    ? origin
    : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonError(msg: string, status: number, origin: string | null): Response {
  return new Response(
    JSON.stringify({ ok: false, error: msg }),
    { status, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } },
  );
}

function jsonOk(data: Record<string, unknown>, origin: string | null): Response {
  return new Response(
    JSON.stringify(data),
    { status: 200, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } },
  );
}

function getClientIp(req: Request): string {
  return (
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "unknown"
  );
}

async function hashRespondent(
  surveyInstanceId: string,
  ip: string,
  userAgent: string,
  salt: string,
): Promise<string> {
  const raw = `${surveyInstanceId}:${ip}:${userAgent}:${salt}`;
  const encoded = new TextEncoder().encode(raw);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function isSuspicious(text: string): boolean {
  return SUSPICIOUS_PATTERNS.some((p) => p.test(text));
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  // GET — return safe aggregate results
  if (req.method === "GET") {
    const url = new URL(req.url);
    const instanceKey = url.searchParams.get("instance_key");

    if (!instanceKey || !ALLOWED_INSTANCE_KEYS.includes(instanceKey)) {
      return jsonError("Unknown survey instance.", 400, origin);
    }

    const dbUrl = Deno.env.get("SUPABASE_DB_URL");
    if (!dbUrl) return jsonError("Server configuration error.", 500, origin);

    const sql = postgres(dbUrl, { prepare: false });
    try {
      // Total unique respondents
      const totalRows = await sql`
        SELECT COUNT(DISTINCT ss.id)::int AS total
        FROM course_survey.survey_submissions ss
        JOIN course_survey.survey_instances si ON si.id = ss.survey_instance_id
        WHERE si.instance_key = ${instanceKey}
          AND si.results_visible = true
      `;
      const total = Number(totalRows[0]?.total ?? 0);

      // Answer counts per question + value
      const answerRows = await sql`
        SELECT
          sq.question_key,
          sq.question_text,
          sa.answer_value,
          COUNT(sa.id)::int AS response_count
        FROM course_survey.survey_instances si
        JOIN course_survey.survey_questions sq
          ON sq.survey_template_id = si.survey_template_id
         AND sq.question_type = 'likert'
        LEFT JOIN course_survey.survey_answers sa
          ON sa.survey_instance_id = si.id
         AND sa.question_key = sq.question_key
         AND sa.answer_value IS NOT NULL
        WHERE si.instance_key = ${instanceKey}
          AND si.results_visible = true
        GROUP BY sq.display_order, sq.question_key, sq.question_text, sa.answer_value
        ORDER BY sq.display_order, sa.answer_value
      `;

      const rows = answerRows.map((r: Record<string, unknown>) => ({
        question_key:   r.question_key,
        question_text:  r.question_text,
        answer_value:   r.answer_value,
        response_count: Number(r.response_count ?? 0),
        total_responses: total,
      }));

      return new Response(JSON.stringify({ ok: true, rows }), {
        status: 200,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Results error:", err);
      return jsonError("Results are temporarily unavailable.", 500, origin);
    } finally {
      await sql.end();
    }
  }

  if (req.method !== "POST") {
    return jsonError("Method not allowed", 405, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400, origin);
  }

  const instanceKey = body.instance_key;
  const answers = body.answers;

  if (typeof instanceKey !== "string" || !ALLOWED_INSTANCE_KEYS.includes(instanceKey)) {
    return jsonError("Unknown survey instance.", 400, origin);
  }

  if (!Array.isArray(answers) || answers.length === 0) {
    return jsonError("Answers array is required.", 400, origin);
  }

  for (const ans of answers) {
    if (typeof ans !== "object" || ans === null) {
      return jsonError("Invalid answer format.", 400, origin);
    }
    const a = ans as Record<string, unknown>;
    const qk = a.question_key;

    if (typeof qk !== "string" || !ALLOWED_QUESTION_KEYS.includes(qk)) {
      return jsonError(`Unknown question key: ${String(qk)}`, 400, origin);
    }

    if (LIKERT_QUESTION_KEYS.has(qk)) {
      if (typeof a.answer_value !== "string" || !VALID_LIKERT_VALUES.has(a.answer_value)) {
        return jsonError(`Invalid answer value for question: ${qk}`, 400, origin);
      }
    }

    if (typeof a.answer_text === "string") {
      if (a.answer_text.length > MAX_TEXT_LENGTH) {
        return jsonError("Answer text too long.", 400, origin);
      }
      if (isSuspicious(a.answer_text)) {
        return jsonError("Answer contains disallowed content.", 400, origin);
      }
    }
  }

  const submittedLikert = new Set(
    (answers as Array<Record<string, unknown>>)
      .filter((a) => LIKERT_QUESTION_KEYS.has(String(a.question_key)))
      .map((a) => a.question_key),
  );
  for (const required of LIKERT_QUESTION_KEYS) {
    if (!submittedLikert.has(required)) {
      return jsonError(`Missing required question: ${required}`, 400, origin);
    }
  }

  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  const salt  = Deno.env.get("SURVEY_HASH_SALT") || "default-salt-change-me";

  if (!dbUrl) {
    console.error("Missing SUPABASE_DB_URL");
    return jsonError("Server configuration error.", 500, origin);
  }

  const sql = postgres(dbUrl, { prepare: false });

  try {
    // Look up survey instance directly in course_survey schema
    const instances = await sql`
      SELECT id, is_active, opens_at, closes_at
      FROM course_survey.survey_instances
      WHERE instance_key = ${instanceKey}
      LIMIT 1
    `;

    if (instances.length === 0) {
      return jsonError("Survey not found.", 404, origin);
    }

    const instance = instances[0];

    if (!instance.is_active) {
      return jsonError("This survey is not currently active.", 403, origin);
    }

    const now = new Date();
    if (instance.opens_at && new Date(instance.opens_at) > now) {
      return jsonError("This survey is not yet open.", 403, origin);
    }
    if (instance.closes_at && new Date(instance.closes_at) < now) {
      return jsonError("This survey has closed.", 403, origin);
    }

    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent") || "";
    const respondentHash = await hashRespondent(instance.id, ip, userAgent, salt);

    // Upsert submission
    const submissions = await sql`
      INSERT INTO course_survey.survey_submissions (survey_instance_id, respondent_hash, updated_at)
      VALUES (${instance.id}, ${respondentHash}, now())
      ON CONFLICT (survey_instance_id, respondent_hash)
      DO UPDATE SET updated_at = now()
      RETURNING id
    `;

    const submissionId = submissions[0].id;

    // Delete prior answers for this submission
    await sql`
      DELETE FROM course_survey.survey_answers
      WHERE submission_id = ${submissionId}
    `;

    // Insert new answers
    for (const ans of answers as Array<Record<string, unknown>>) {
      const answerValue = typeof ans.answer_value === "string" ? ans.answer_value : null;
      const answerText  = typeof ans.answer_text === "string" && (ans.answer_text as string).trim().length > 0
        ? (ans.answer_text as string).trim()
        : null;

      await sql`
        INSERT INTO course_survey.survey_answers
          (submission_id, survey_instance_id, question_key, answer_value, answer_text)
        VALUES
          (${submissionId}, ${instance.id}, ${ans.question_key}, ${answerValue}, ${answerText})
      `;
    }

    return jsonOk({ ok: true, message: "Response recorded anonymously." }, origin);

  } catch (err) {
    console.error("Database error:", err);
    return jsonError("The survey could not be submitted right now. Please try again later.", 500, origin);
  } finally {
    await sql.end();
  }
});
