-- Migration 002: Public schema wrapper views for PostgREST access
-- PostgREST only exposes the public schema by default.
-- These views proxy the course_survey aggregate views so the anon client can read them.

CREATE OR REPLACE VIEW public.survey_likert_aggregates AS
SELECT * FROM course_survey.v_likert_aggregates;

CREATE OR REPLACE VIEW public.survey_open_text_excerpts AS
SELECT * FROM course_survey.v_open_text_excerpts;

GRANT SELECT ON public.survey_likert_aggregates TO anon, authenticated;
GRANT SELECT ON public.survey_open_text_excerpts TO anon, authenticated;
