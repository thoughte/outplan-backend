-- The rest of Grove: a tree, neighbours, invitations, care circle, discoveries
-- and subscription state.
CREATE TYPE "TreeKind"  AS ENUM ('banyan','mango','neem','cherry','oak','bamboo','baobab');
CREATE TYPE "SubStatus" AS ENUM ('trialing','active','lapsed');

-- The tree someone chose and named. A named tree is harder to abandon, which is
-- the entire bet. The quiz asks about temperament and never about health:
-- anything else would make the choice of tree a disclosure.
CREATE TABLE "farms" (
  "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
  "user_id"    UUID         NOT NULL,
  "tree"       "TreeKind"   NOT NULL,
  "tree_name"  TEXT         NOT NULL,
  "suggested"  "TreeKind",
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "farms_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "farms_user_id_key" ON "farms" ("user_id");
ALTER TABLE "farms" ADD CONSTRAINT "farms_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Two farms side by side. Neighbours see EARNED REWARDS ONLY, and a farm missing
-- a reward must look identical to one that has not unlocked it.
CREATE TABLE "neighbours" (
  "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
  "from_id"    UUID         NOT NULL,
  "to_id"      UUID         NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "neighbours_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "neighbours_from_id_to_id_key" ON "neighbours" ("from_id","to_id");
CREATE INDEX "neighbours_to_id_idx" ON "neighbours" ("to_id");
ALTER TABLE "neighbours" ADD CONSTRAINT "neighbours_from_id_fkey"
  FOREIGN KEY ("from_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "neighbours" ADD CONSTRAINT "neighbours_to_id_fkey"
  FOREIGN KEY ("to_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- An invitation. The code carries nothing about the sender: a stranger guessing
-- one must learn no health data and no identity.
CREATE TABLE "invites" (
  "id"             UUID         NOT NULL DEFAULT gen_random_uuid(),
  "user_id"        UUID         NOT NULL,
  "code"           TEXT         NOT NULL,
  "accepted_by_id" UUID,
  "accepted_at"    TIMESTAMP(3),
  -- Set when their first payment clears, never at signup: rewarding a signup
  -- invites self-referral and trial-cancel loops.
  "rewarded_at"    TIMESTAMP(3),
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invites_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "invites_code_key" ON "invites" ("code");
CREATE INDEX "invites_user_id_idx" ON "invites" ("user_id");
ALTER TABLE "invites" ADD CONSTRAINT "invites_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Care circle. Every category is OFF until deliberately turned on: a default
-- that shares is a default nobody chose.
CREATE TABLE "care_links" (
  "id"               UUID         NOT NULL DEFAULT gen_random_uuid(),
  "owner_id"         UUID         NOT NULL,
  "viewer_id"        UUID         NOT NULL,
  "see_check_in"     BOOLEAN      NOT NULL DEFAULT false,
  "see_doses"        BOOLEAN      NOT NULL DEFAULT false,
  "see_problems"     BOOLEAN      NOT NULL DEFAULT false,
  "see_quiet_days"   BOOLEAN      NOT NULL DEFAULT false,
  "quiet_after_days" INTEGER      NOT NULL DEFAULT 3,
  -- Paused, not deleted. The viewer is told only that sharing paused, never why.
  "paused_at"        TIMESTAMP(3),
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "care_links_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "care_links_owner_id_viewer_id_key" ON "care_links" ("owner_id","viewer_id");
CREATE INDEX "care_links_viewer_id_idx" ON "care_links" ("viewer_id");
ALTER TABLE "care_links" ADD CONSTRAINT "care_links_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "care_links" ADD CONSTRAINT "care_links_viewer_id_fkey"
  FOREIGN KEY ("viewer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Something true about this person that nobody told them. `days` is stored and
-- shown: a pattern from four days is a coincidence with a nice sentence on it.
CREATE TABLE "discoveries" (
  "id"       UUID         NOT NULL DEFAULT gen_random_uuid(),
  "user_id"  UUID         NOT NULL,
  "key"      TEXT         NOT NULL,
  "title"    TEXT         NOT NULL,
  "detail"   TEXT         NOT NULL,
  "days"     INTEGER      NOT NULL,
  "found_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "discoveries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "discoveries_user_id_key_key" ON "discoveries" ("user_id","key");
ALTER TABLE "discoveries" ADD CONSTRAINT "discoveries_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Subscription state. A lapse rests the farm and preserves it whole; it never
-- touches records or medication reminders. Safety is never paywalled.
CREATE TABLE "subscriptions" (
  "id"            UUID         NOT NULL DEFAULT gen_random_uuid(),
  "user_id"       UUID         NOT NULL,
  "status"        "SubStatus"  NOT NULL DEFAULT 'trialing',
  "trial_ends_at" TIMESTAMP(3),
  "renews_at"     TIMESTAMP(3),
  "free_months"   INTEGER      NOT NULL DEFAULT 0,
  "provider_ref"  TEXT,
  "updated_at"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "subscriptions_user_id_key" ON "subscriptions" ("user_id");
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
