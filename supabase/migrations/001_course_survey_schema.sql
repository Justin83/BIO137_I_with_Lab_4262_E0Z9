-- Migration: course_survey schema
-- BIO 137 anonymous feedback survey prototype

-- Create schema
CREATE SCHEMA IF NOT EXISTS course_survey;

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE course_survey.course_sections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_code     text NOT NULL,
  course_title    text NOT NULL,
  section_code    text NOT NULL,
  class_number    text,
  term            text NOT NULL,
  year            integer NOT NULL,
  semester_key    text NOT NULL,
  delivery_mode   text,
  instructor_name text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE course_survey.survey_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_key  text UNIQUE NOT NULL,
  title       text NOT NULL,
  description text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE course_survey.survey_questions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_template_id uuid NOT NULL REFERENCES course_survey.survey_templates(id),
  question_key       text NOT NULL,
  question_text      text NOT NULL,
  question_type      text NOT NULL,
  display_order      integer NOT NULL DEFAULT 0,
  is_required        boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE course_survey.survey_instances (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_template_id uuid NOT NULL REFERENCES course_survey.survey_templates(id),
  course_section_id  uuid NOT NULL REFERENCES course_survey.course_sections(id),
  instance_key       text UNIQUE NOT NULL,
  title              text NOT NULL,
  opens_at           timestamptz,
  closes_at          timestamptz,
  results_visible    boolean NOT NULL DEFAULT true,
  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE course_survey.survey_submissions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_instance_id uuid NOT NULL REFERENCES course_survey.survey_instances(id),
  respondent_hash    text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (survey_instance_id, respondent_hash)
);

CREATE TABLE course_survey.survey_answers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id      uuid NOT NULL REFERENCES course_survey.survey_submissions(id) ON DELETE CASCADE,
  survey_instance_id uuid NOT NULL REFERENCES course_survey.survey_instances(id),
  question_key       text NOT NULL,
  answer_value       text,
  answer_text        text,
  is_public          boolean NOT NULL DEFAULT false,
  is_flagged         boolean NOT NULL DEFAULT false,
  instructor_selected boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE course_survey.course_sections    ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_survey.survey_templates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_survey.survey_questions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_survey.survey_instances   ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_survey.survey_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_survey.survey_answers     ENABLE ROW LEVEL SECURITY;

-- Deny all anon access to raw tables (views handle public reads)
CREATE POLICY "deny anon raw read" ON course_survey.survey_submissions
  FOR SELECT TO anon USING (false);

CREATE POLICY "deny anon raw read" ON course_survey.survey_answers
  FOR SELECT TO anon USING (false);

CREATE POLICY "deny anon raw read" ON course_survey.course_sections
  FOR SELECT TO anon USING (false);

CREATE POLICY "deny anon raw read" ON course_survey.survey_templates
  FOR SELECT TO anon USING (false);

CREATE POLICY "deny anon raw read" ON course_survey.survey_questions
  FOR SELECT TO anon USING (false);

CREATE POLICY "deny anon raw read" ON course_survey.survey_instances
  FOR SELECT TO anon USING (false);

-- Edge Function uses service_role key, which bypasses RLS — no insert policies needed for anon

-- ============================================================
-- SAFE AGGREGATE VIEWS
-- ============================================================

-- Likert aggregate view (public-safe)
CREATE OR REPLACE VIEW course_survey.v_likert_aggregates
WITH (security_invoker = true)
AS
SELECT
  si.id                                         AS survey_instance_id,
  si.instance_key,
  cs.course_code,
  cs.section_code,
  cs.semester_key,
  sq.question_key,
  sq.question_text,
  sa.answer_value,
  COUNT(sa.id)::integer                         AS response_count,
  (
    SELECT COUNT(DISTINCT ss2.id)
    FROM course_survey.survey_submissions ss2
    WHERE ss2.survey_instance_id = si.id
  )::integer                                    AS total_responses,
  ROUND(
    COUNT(sa.id)::numeric /
    NULLIF(
      (SELECT COUNT(DISTINCT ss2.id)
       FROM course_survey.survey_submissions ss2
       WHERE ss2.survey_instance_id = si.id),
      0
    ) * 100,
    1
  )                                             AS percent_of_responses
FROM course_survey.survey_instances si
JOIN course_survey.course_sections cs
  ON cs.id = si.course_section_id
JOIN course_survey.survey_questions sq
  ON sq.survey_template_id = si.survey_template_id
 AND sq.question_type = 'likert'
LEFT JOIN course_survey.survey_answers sa
  ON sa.survey_instance_id = si.id
 AND sa.question_key = sq.question_key
 AND sa.answer_value IS NOT NULL
WHERE si.results_visible = true
GROUP BY
  si.id, si.instance_key,
  cs.course_code, cs.section_code, cs.semester_key,
  sq.question_key, sq.question_text,
  sa.answer_value;

-- Grant anon read on the aggregate view
GRANT SELECT ON course_survey.v_likert_aggregates TO anon;

-- Grant service_role full access on all tables
GRANT USAGE ON SCHEMA course_survey TO anon, authenticated, service_role;
GRANT SELECT ON course_survey.v_likert_aggregates TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA course_survey TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA course_survey TO service_role;

-- Open-text excerpt view (shows only approved excerpts)
CREATE OR REPLACE VIEW course_survey.v_open_text_excerpts
WITH (security_invoker = true)
AS
SELECT
  si.id                                               AS survey_instance_id,
  si.instance_key,
  sa.question_key,
  LEFT(sa.answer_text, 180)                           AS excerpt,
  sa.created_at
FROM course_survey.survey_answers sa
JOIN course_survey.survey_submissions ss
  ON ss.id = sa.submission_id
JOIN course_survey.survey_instances si
  ON si.id = sa.survey_instance_id
WHERE sa.answer_text IS NOT NULL
  AND LENGTH(sa.answer_text) >= 12
  AND (sa.is_public = true OR sa.instructor_selected = true)
  AND si.results_visible = true;

GRANT SELECT ON course_survey.v_open_text_excerpts TO anon, authenticated;

-- ============================================================
-- SEED DATA
-- ============================================================

-- Course section
INSERT INTO course_survey.course_sections
  (course_code, course_title, section_code, class_number, term, year, semester_key, delivery_mode, instructor_name)
VALUES
  ('BIO 137', 'Human Anatomy and Physiology I with Lab', 'E0Z9', '4262',
   'Summer', 2026, '2026_summer', 'online', 'Justin N. Howard');

-- Survey template
INSERT INTO course_survey.survey_templates
  (survey_key, title, description, is_active)
VALUES
  ('start_here_feedback',
   'Start Here Module Feedback',
   'Anonymous feedback survey about the Start Here module.',
   true);

-- Survey instance
INSERT INTO course_survey.survey_instances
  (survey_template_id, course_section_id, instance_key, title, results_visible, is_active)
VALUES
  (
    (SELECT id FROM course_survey.survey_templates WHERE survey_key = 'start_here_feedback'),
    (SELECT id FROM course_survey.course_sections WHERE semester_key = '2026_summer' AND section_code = 'E0Z9'),
    'bio137_2026_summer_e0z9_start_here_feedback',
    'Start Here Module Feedback',
    true,
    true
  );

-- Survey questions
INSERT INTO course_survey.survey_questions
  (survey_template_id, question_key, question_text, question_type, display_order, is_required)
SELECT
  t.id,
  q.question_key,
  q.question_text,
  q.question_type,
  q.display_order,
  q.is_required
FROM course_survey.survey_templates t,
(VALUES
  ('navigation_easy',
   'The Start Here module was easy to navigate.',
   'likert', 1, true),
  ('organized_info',
   'The information in the Start Here module was organized in a way that made sense to me.',
   'likert', 2, true),
  ('course_info_found',
   'After completing the Start Here module, I know where to find important course information such as the syllabus, schedule, assignments, grades, and instructor contact information.',
   'likert', 3, true),
  ('first_steps_clear',
   'The Start Here module helped me understand what I should do first in this course.',
   'likert', 4, true),
  ('improvement_suggestion',
   'What is one thing that would make the Start Here module easier to use or understand?',
   'open_text', 5, false)
) AS q(question_key, question_text, question_type, display_order, is_required)
WHERE t.survey_key = 'start_here_feedback';
