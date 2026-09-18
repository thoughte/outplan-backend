-- Who this person is: name, date of birth, city.
--
-- The name is a safety field. Every uploaded report is checked against it before
-- a single number is read, and until now that check compared against a string
-- literal in two source files - so it worked for exactly one person and silently
-- did nothing for everyone else.
--
-- A date of birth rather than an age: age is a number that rots without anyone
-- touching it.
--
-- The city is kept beside the IANA zone because "Kanpur" is what a person
-- understands and "Asia/Kolkata" is what the day arithmetic needs.
ALTER TABLE "users" ADD COLUMN "name"          TEXT;
ALTER TABLE "users" ADD COLUMN "date_of_birth" DATE;
ALTER TABLE "users" ADD COLUMN "city"          TEXT;
