-- Migration 003: Instructor-facing public views for Course Forge viewer
-- Run AFTER migrations 001 and 002 in the Supabase SQL editor.
-- These views proxy into course_survey schema with no security_invoker,
-- so they execute as the view owner (postgres) and bypass the anon-deny RLS.

-- ────────────────────────────────────────────────────────────────────────────
-- survey_instance_summary
-- One row per survey instance; includes live response count.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.survey_instance_summary AS
SELECT
  si.id,
  si.instance_key,
  si.title,
  si.is_active,
  si.results_visible,
  si.opens_at,
  si.closes_at,
  si.created_at,
  cs.course_code,
  cs.section_code,
  cs.semester_key,
  cs.instructor_name,
  COUNT(DISTINCT ss.id)::integer AS response_count
FROM course_survey.survey_instances si
JOIN course_survey.course_sections cs
  ON cs.id = si.course_section_id
LEFT JOIN course_survey.survey_submissions ss
  ON ss.survey_instance_id = si.id
GROUP BY
  si.id, si.instance_key, si.title, si.is_active, si.results_visible,
  si.opens_at, si.closes_at, si.created_at,
  cs.course_code, cs.section_code, cs.semester_key, cs.instructor_name;

GRANT SELECT ON public.survey_instance_summary TO anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- survey_all_open_text
-- All open-text answers for instructor review — no is_public filter.
-- Returns full answer_text (not truncated), ordered newest first.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.survey_all_open_text AS
SELECT
  si.instance_key,
  si.title              AS survey_title,
  cs.course_code,
  cs.section_code,
  sq.question_key,
  sq.question_text,
  sa.answer_text,
  sa.is_public,
  sa.is_flagged,
  sa.instructor_selected,
  sa.created_at
FROM course_survey.survey_answers sa
JOIN course_survey.survey_submissions ss
  ON ss.id = sa.submission_id
JOIN course_survey.survey_instances si
  ON si.id = sa.survey_instance_id
JOIN course_survey.survey_questions sq
  ON sq.survey_template_id = si.survey_template_id
 AND sq.question_key = sa.question_key
JOIN course_survey.course_sections cs
  ON cs.id = si.course_section_id
WHERE sa.answer_text IS NOT NULL
  AND LENGTH(TRIM(sa.answer_text)) >= 1
ORDER BY sa.created_at DESC;

GRANT SELECT ON public.survey_all_open_text TO anon, authenticated;
