-- One reply covering several messages.
--
-- Someone types "I had momos", then "with red chutney", then "post dinner" in
-- three taps before anything comes back. Answering each separately is three
-- replies to one thought; answering only the last leaves the first two with
-- nothing under them, which looks exactly like being ignored. That is what
-- happened before this column existed: the earlier messages stayed unanswered
-- forever.
ALTER TABLE "exchanges" ADD COLUMN "covered_by_id" UUID;

ALTER TABLE "exchanges" ADD CONSTRAINT "exchanges_covered_by_id_fkey"
  FOREIGN KEY ("covered_by_id") REFERENCES "exchanges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- "what is still unanswered for this person" runs on every incoming message.
CREATE INDEX "exchanges_user_id_replied_at_idx"
  ON "exchanges" ("user_id", "replied_at");
