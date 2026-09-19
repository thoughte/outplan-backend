-- What someone claimed about a thing, not just the thing.
--
-- `planned` was a boolean over a space with at least six values, and its
-- fallback was "they did it". Backfilled from it: everything previously marked
-- planned becomes 'will', everything else 'did', which is exactly what the old
-- code meant. Nothing is reclassified retroactively, because guessing at the
-- modality of a past sentence is the same mistake one layer later.
ALTER TABLE "observations" ADD COLUMN "said" TEXT NOT NULL DEFAULT 'did';

UPDATE "observations" SET "said" = 'will' WHERE "planned" = true;

CREATE INDEX "observations_user_id_said_idx" ON "observations"("user_id", "said");
