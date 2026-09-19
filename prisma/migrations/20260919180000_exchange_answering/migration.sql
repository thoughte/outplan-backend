-- A tapped answer, linked to the question it answered.
-- Without it the reply arrives as a bare option word with nothing to attach it to.
ALTER TABLE "exchanges" ADD COLUMN "answering_id" UUID;

ALTER TABLE "exchanges"
  ADD CONSTRAINT "exchanges_answering_id_fkey"
  FOREIGN KEY ("answering_id") REFERENCES "exchanges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "exchanges_answering_id_idx" ON "exchanges"("answering_id");
