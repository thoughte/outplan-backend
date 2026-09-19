-- The app's own documents, filed under kind 'plan' as if a person had uploaded
-- them, were listed on the Records screen beside real reports. They belong to
-- the person but are not theirs to read: the app digests what they hold into
-- rows, and the file stays as provenance. Nothing else carries kind 'plan'.
-- The only such rows were written by the migration tooling, and no other
-- account will ever be migrated.
ALTER TABLE "stored_files" ADD COLUMN "internal" BOOLEAN NOT NULL DEFAULT false;
UPDATE "stored_files" SET "internal" = true WHERE "kind" = 'plan';
