import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Allowed CORS origins
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

// Simple bad-word / suspicious input patterns
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
    {
      status,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    },
  );
}

function jsonOk(data: Record<string, unknown>, origin: string | null): Response {
  return new Response(
    JSON.stringify(data),
    {
      status: 200,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    },
  );
}

function getClientIp(req: Request): string {
  // Supabase Edge Functions run on Deno / Cloudflare Workers-style infra
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
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isSuspicious(text: string): boolean {
  return SUSPICIOUS_PATTERNS.some((p) => p.test(text));
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (req.method !== "POST") {
    return jsonError("Method not allowed", 405, origin);
  }

  // Parse body
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400, origin);
  }

  const instanceKey = body.instance_key;
  const answers = body.answers;

  // Validate instance_key
  if (typeof instanceKey !== "string" || !ALLOWED_INSTANCE_KEYS.includes(instanceKey)) {
    return jsonError("Unknown survey instance.", 400, origin);
  }

  // Validate answers array
  if (!Array.isArray(answers) || answers.length === 0) {
    return jsonError("Answers array is required.", 400, origin);
  }

  // Validate each answer
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

  // Require all four Likert questions
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

  // Build Supabase client with service role (bypasses RLS)
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const salt = Deno.env.get("SURVEY_HASH_SALT") || "default-salt-change-me";

  if (!supabaseUrl || !serviceKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return jsonError("Server configuration error.", 500, origin);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // Look up survey instance
  const { data: instance, error: instanceErr } = await supabase
    .schema("course_survey")
    .from("survey_instances")
    .select("id, is_active, opens_at, closes_at")
    .eq("instance_key", instanceKey)
    .single();

  if (instanceErr || !instance) {
    return jsonError("Survey not found.", 404, origin);
  }

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

  // Build respondent hash
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") || "";
  const respondentHash = await hashRespondent(instance.id, ip, userAgent, salt);

  // Upsert submission (update if same respondent re-submits)
  const { data: submission, error: subErr } = await supabase
    .schema("course_survey")
    .from("survey_submissions")
    .upsert(
      {
        survey_instance_id: instance.id,
        respondent_hash: respondentHash,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "survey_instance_id,respondent_hash",
        ignoreDuplicates: false,
      },
    )
    .select("id")
    .single();

  if (subErr || !submission) {
    console.error("Submission upsert error:", subErr);
    return jsonError("Could not record your response.", 500, origin);
  }

  // Delete prior answers for this submission (clean update)
  await supabase
    .schema("course_survey")
    .from("survey_answers")
    .delete()
    .eq("submission_id", submission.id);

  // Insert new answers
  const answerRows = (answers as Array<Record<string, unknown>>).map((a) => ({
    submission_id: submission.id,
    survey_instance_id: instance.id,
    question_key: a.question_key,
    answer_value: typeof a.answer_value === "string" ? a.answer_value : null,
    answer_text: typeof a.answer_text === "string" && a.answer_text.trim().length > 0
      ? a.answer_text.trim()
      : null,
  }));

  const { error: ansErr } = await supabase
    .schema("course_survey")
    .from("survey_answers")
    .insert(answerRows);

  if (ansErr) {
    console.error("Answer insert error:", ansErr);
    return jsonError("Could not save your answers.", 500, origin);
  }

  return jsonOk(
    { ok: true, message: "Response recorded anonymously." },
    origin,
  );
});
