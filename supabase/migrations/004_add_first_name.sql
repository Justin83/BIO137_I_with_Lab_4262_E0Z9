-- Migration 004: Add optional first name capture to survey submissions
-- Run AFTER migration 003 (or together with it) in Supabase SQL editor.

-- Add column to submissions table
ALTER TABLE course_survey.survey_submissions
  ADD COLUMN IF NOT EXISTS respondent_first_name text;

-- Recreate survey_all_open_text view to include the first name column.
-- (CREATE OR REPLACE is safe whether or not migration 003 was already run.)
CREATE OR REPLACE VIEW public.survey_all_open_text AS
SELECT
  si.instance_key,
  si.title              AS survey_title,
  cs.course_code,
  cs.section_code,
  sq.question_key,
  sq.question_text,
  sa.answer_text,
  ss.respondent_first_name,
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
