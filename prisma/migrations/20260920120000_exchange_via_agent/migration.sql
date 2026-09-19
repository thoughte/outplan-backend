-- A message sent with an agent key rather than typed by the account holder.
-- Nothing is extracted from one into the record, and the screen marks it.
ALTER TABLE "exchanges" ADD COLUMN "via_agent" BOOLEAN NOT NULL DEFAULT false;
