-- Said, but not yet done.
--
-- "I will have veg biryani in 30 mins" is an intention, not a meal. The first
-- extraction filed it as a meal with "planned" buried in the notes, while the
-- row itself asserted he had eaten it. If he skips it, his record disagrees with
-- his day - and anything counting what he actually ate counts it.
ALTER TABLE "observations" ADD COLUMN "planned" BOOLEAN NOT NULL DEFAULT false;
