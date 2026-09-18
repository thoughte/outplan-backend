-- Goals, broken down until each piece is small enough to finish.
--
-- "Go meds free" is not one goal. Every medicine exists for a reason, and to be
-- free of it you fix the reason: ApoB down, B12 up, homocysteine down, twitching
-- gone, B6 measured, thiamine repleted. One sentence, six goals. And it recurses
-- until the leaves are atomic - a number to move, or a thing to do.
CREATE TYPE "GoalKind"      AS ENUM ('outcome', 'behaviour', 'container');
CREATE TYPE "GoalDirection" AS ENUM ('down', 'up', 'reach', 'stop', 'maintain');
CREATE TYPE "GoalStatus"    AS ENUM ('proposed', 'waiting_baseline', 'blocked', 'active', 'achieved', 'abandoned');

CREATE TABLE "goals" (
  "id"              UUID            NOT NULL DEFAULT gen_random_uuid(),
  "user_id"         UUID            NOT NULL,
  "title"           TEXT            NOT NULL,
  "why"             TEXT,
  "kind"            "GoalKind"      NOT NULL,
  "parent_id"       UUID,
  "measure"         TEXT,
  -- Without an honest starting number nothing can report progress, which is why
  -- a goal may sit in waiting_baseline rather than pretend.
  "baseline_value"  DOUBLE PRECISION,
  "baseline_text"   TEXT,
  "baseline_at"     TIMESTAMP(3),
  "target_value"    DOUBLE PRECISION,
  "target_text"     TEXT,
  "direction"       "GoalDirection" NOT NULL DEFAULT 'down',
  "status"          "GoalStatus"    NOT NULL DEFAULT 'proposed',
  "achieved_at"     TIMESTAMP(3),
  "intent_text"     TEXT,
  "exchange_id"     UUID,
  "intervention_id" UUID,
  "created_at"      TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "goals_user_id_status_idx"    ON "goals" ("user_id", "status");
CREATE INDEX "goals_user_id_parent_id_idx" ON "goals" ("user_id", "parent_id");

-- Deleting a goal takes its breakdown with it: a component of something that no
-- longer exists is not a goal, it is debris.
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "goals" ADD CONSTRAINT "goals_parent_id_fkey"
  FOREIGN KEY ("parent_id") REFERENCES "goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "goals" ADD CONSTRAINT "goals_exchange_id_fkey"
  FOREIGN KEY ("exchange_id") REFERENCES "exchanges"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "goals" ADD CONSTRAINT "goals_intervention_id_fkey"
  FOREIGN KEY ("intervention_id") REFERENCES "interventions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- "This one waits for that one." A table, because a goal can wait on several and
-- several can wait on it. Kept apart from parent/child deliberately: "thiamine
-- repletion before any alcohol reduction" is a sequence, not a part-of, and
-- collapsing the two would make alcohol a component of thiamine.
CREATE TABLE "goal_blocks" (
  "goal_id"    UUID NOT NULL,
  "blocker_id" UUID NOT NULL,
  CONSTRAINT "goal_blocks_pkey" PRIMARY KEY ("goal_id", "blocker_id")
);
CREATE INDEX "goal_blocks_blocker_id_idx" ON "goal_blocks" ("blocker_id");

ALTER TABLE "goal_blocks" ADD CONSTRAINT "goal_blocks_goal_id_fkey"
  FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "goal_blocks" ADD CONSTRAINT "goal_blocks_blocker_id_fkey"
  FOREIGN KEY ("blocker_id") REFERENCES "goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
