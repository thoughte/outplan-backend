-- A chart needs one unit per marker. The lab's own value and unit stay exactly
-- as printed; these three are derived beside them.
ALTER TABLE "measurements" ADD COLUMN "canonical_value" DOUBLE PRECISION;
ALTER TABLE "measurements" ADD COLUMN "canonical_unit"  TEXT;
ALTER TABLE "measurements" ADD COLUMN "canonical_flag"  TEXT;

-- The chart query is "this user, this marker, over time". The existing index on
-- (user_id, variable, collected_on) already serves it; this one lets Postgres
-- answer the plot entirely from the index without touching the table.
CREATE INDEX IF NOT EXISTS "measurements_chart_idx"
  ON "measurements" ("user_id", "variable", "collected_on")
  INCLUDE ("canonical_value", "canonical_unit");
