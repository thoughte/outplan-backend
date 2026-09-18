-- Files the person uploaded. The bytes live on the volume; this table is what
-- the engine can actually see, because the engine only ever reads the database.
CREATE TYPE "FileKind"   AS ENUM ('report', 'plan', 'scan', 'note', 'other');
CREATE TYPE "FileStatus" AS ENUM ('current', 'superseded', 'draft');

CREATE TABLE "stored_files" (
  "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
  "user_id"      UUID         NOT NULL,
  "hash"         TEXT         NOT NULL,
  "filename"     TEXT         NOT NULL,
  "media_type"   TEXT         NOT NULL,
  "bytes"        INTEGER      NOT NULL,
  "path"         TEXT         NOT NULL,
  "kind"         "FileKind"   NOT NULL,
  "status"       "FileStatus" NOT NULL DEFAULT 'current',
  "content_date" DATE,
  "uploaded_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "text"         TEXT,
  "digested_at"  TIMESTAMP(3),
  "digest_note"  TEXT,
  "report_id"    UUID,
  CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- A report is digested exactly once. The same PDF uploaded twice - re-sent,
-- retried after a dropped connection - must not double his measurements, and
-- neither a filename nor a date can tell you two uploads are the same file.
CREATE UNIQUE INDEX "stored_files_user_id_hash_key" ON "stored_files" ("user_id", "hash");

CREATE INDEX "stored_files_user_id_kind_content_date_idx"
  ON "stored_files" ("user_id", "kind", "content_date");

ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The file outlives the report it produced: deleting a parsed report must not
-- destroy the original scan it was parsed from.
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_report_id_fkey"
  FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
