-- How much, when they said how much.
--
-- The value keeps their own words. These hold the number pulled out of it, and
-- without them nothing can react to an amount: the farm could only tell whether
-- something was logged, which rewards talking about sleep rather than sleeping.
ALTER TABLE "observations" ADD COLUMN "amount" DOUBLE PRECISION;
ALTER TABLE "observations" ADD COLUMN "unit"   TEXT;
