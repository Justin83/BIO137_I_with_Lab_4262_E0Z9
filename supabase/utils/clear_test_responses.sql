-- Utility: clear all survey responses for the Start Here feedback survey
-- Use in Supabase SQL editor during testing, before the course opens.
-- survey_answers are cascade-deleted automatically.

DELETE FROM course_survey.survey_submissions
WHERE survey_instance_id = (
  SELECT id FROM course_survey.survey_instances
  WHERE instance_key = 'bio137_2026_summer_e0z9_start_here_feedback'
);
