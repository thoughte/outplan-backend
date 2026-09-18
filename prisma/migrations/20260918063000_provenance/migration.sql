-- Provenance points FROM the record TO the file it was read out of.
--
-- The first cut put report_id on the file, which cannot express the real shape:
-- one scan can yield a whole report, and one report can be assembled from
-- several scans. It also made "which file did this number come from" depend on
-- the report still existing. The table is empty, so this is a straight swap.
ALTER TABLE "stored_files" DROP CONSTRAINT IF EXISTS "stored_files_report_id_fkey";
ALTER TABLE "stored_files" DROP COLUMN IF EXISTS "report_id";

ALTER TABLE "reports"      ADD COLUMN "source_file_id" UUID;
ALTER TABLE "measurements" ADD COLUMN "source_file_id" UUID;

ALTER TABLE "reports" ADD CONSTRAINT "reports_source_file_id_fkey"
  FOREIGN KEY ("source_file_id") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_source_file_id_fkey"
  FOREIGN KEY ("source_file_id") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- "Show me every number that came off this scan" is the verification question,
-- so it gets an index rather than a sequential scan of the whole table.
CREATE INDEX "measurements_source_file_id_idx" ON "measurements" ("source_file_id");
