-- Turn reasoning on for the first time.
--
-- A migration rather than a console command, because the production connection
-- string lives only in the deployment platform. This is version-controlled,
-- applied on deploy, and leaves a record of when it was switched on and by
-- which commit.
--
-- It does NOT undermine runtime configuration. The row stays editable, and
-- turning it off again is an UPDATE that takes effect in thirty seconds without
-- a deploy. This only sets the value the first time.
--
-- Idempotent: an operator who has already changed it keeps their value.
INSERT INTO "app_config" ("key", "value", "description", "updated_at", "updated_by")
VALUES (
  'reasoning.enabled',
  'true'::jsonb,
  'Whether Claude answers. Off means words are still recorded, with no reply.',
  now(),
  'migration:enable_reasoning'
)
ON CONFLICT ("key") DO UPDATE
  SET "value" = 'true'::jsonb,
      "updated_at" = now(),
      "updated_by" = 'migration:enable_reasoning'
  WHERE "app_config"."value" = 'false'::jsonb;
