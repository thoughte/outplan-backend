-- Where an observation came from.
--
-- Same rule as a measurement pointing at the page it was printed on: he must be
-- able to ask "why does my record say I ate momos at 2am" and be shown the
-- sentence he typed. Null for the 78 rows imported from the old SQLite record,
-- which predate any message.
--
-- It carries the TIME for free as well. local_day says which day; the exchange
-- says when - which is the entire question for a meal eaten near bedtime.
ALTER TABLE "observations" ADD COLUMN "exchange_id" UUID;

ALTER TABLE "observations" ADD CONSTRAINT "observations_exchange_id_fkey"
  FOREIGN KEY ("exchange_id") REFERENCES "exchanges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- "this marker, over time" is the question a chart asks of these too.
CREATE INDEX "observations_user_id_variable_local_day_idx"
  ON "observations" ("user_id", "variable", "local_day");
