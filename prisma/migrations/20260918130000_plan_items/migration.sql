-- What to do today, and whether it was done.
--
-- Generated from the record rather than typed in: his five breakfast tablets and
-- his 20:00 magnesium already exist in `interventions` with their schedules, and
-- a to-do list maintained separately from the record is a to-do list that will
-- eventually disagree with it.
CREATE TYPE "PlanSource" AS ENUM ('intervention', 'manual');
CREATE TYPE "PlanStatus" AS ENUM ('pending', 'done', 'skipped');
CREATE TYPE "DoneVia"    AS ENUM ('tap', 'said');

CREATE TABLE "plan_items" (
  "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
  "user_id"         UUID         NOT NULL,
  "local_day"       VARCHAR(10)  NOT NULL,
  -- Stable per source per day. Regenerating a day must not create a second copy
  -- of the same tablet, and must not wipe what has already been ticked.
  "key"             TEXT         NOT NULL,
  "title"           TEXT         NOT NULL,
  "detail"          TEXT,
  -- Null for "with breakfast", which is a time of day rather than a time.
  -- Inventing 08:00 would put a deadline on something that never had one.
  "at_local"        VARCHAR(5),
  "sort_order"      INTEGER      NOT NULL DEFAULT 0,
  "source"          "PlanSource" NOT NULL,
  "intervention_id" UUID,
  "status"          "PlanStatus" NOT NULL DEFAULT 'pending',
  "done_at"         TIMESTAMP(3),
  -- Tapped, or said out loud and matched. Different levels of certainty, and if
  -- the matching ever goes wrong this column is how it gets found.
  "done_via"        "DoneVia",
  "observation_id"  UUID,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plan_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plan_items_user_id_local_day_key_key" ON "plan_items" ("user_id", "local_day", "key");
CREATE INDEX "plan_items_user_id_local_day_sort_order_idx" ON "plan_items" ("user_id", "local_day", "sort_order");

ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_intervention_id_fkey"
  FOREIGN KEY ("intervention_id") REFERENCES "interventions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_observation_id_fkey"
  FOREIGN KEY ("observation_id") REFERENCES "observations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
