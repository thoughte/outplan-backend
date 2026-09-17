-- CreateTable
CREATE TABLE "prompts" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prompts_key_active_idx" ON "prompts"("key", "active");

-- CreateIndex
CREATE UNIQUE INDEX "prompts_key_version_key" ON "prompts"("key", "version");

-- Exactly one active version per key. Prisma cannot express a partial unique
-- index, and without this two rows can be active at once - after which which
-- prompt answered is a coin toss that nothing records.
CREATE UNIQUE INDEX "prompts_one_active_per_key"
  ON "prompts" ("key") WHERE "active";
