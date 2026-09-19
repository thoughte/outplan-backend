-- A goal that was reasoned to rather than read off the record.
-- Kept beside the grounded ones, but never confirmed by a cascade.
ALTER TABLE "goals" ADD COLUMN "inferred" BOOLEAN NOT NULL DEFAULT false;
