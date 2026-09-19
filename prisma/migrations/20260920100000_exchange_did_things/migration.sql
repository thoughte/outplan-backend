-- What the assistant did for them on a message, so it can be seen and undone.
ALTER TABLE "exchanges" ADD COLUMN "did_things" JSONB;
