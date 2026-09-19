-- A quest is a plan item from a behaviour goal. Not a second system: the goal
-- says "in bed by midnight", this is the line for tonight, ticked exactly the
-- way a tablet is.
ALTER TYPE "PlanSource" ADD VALUE IF NOT EXISTS 'goal';

-- Which goal a quest serves. Ticking it moves that goal's adherence, so the link
-- is the point rather than decoration.
ALTER TABLE "plan_items" ADD COLUMN "goal_id" UUID;
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_goal_id_fkey"
  FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
