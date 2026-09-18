-- What reading a file found, as columns.
--
-- These were being recovered by searching the stored text for a booking number,
-- which matches every other report from the same visit: his 22 Apr 2023 blood
-- panel and his DNA report carry the same reference, and were therefore treated
-- as duplicate copies of one another.
ALTER TABLE "stored_files" ADD COLUMN "booking_ref" TEXT;
ALTER TABLE "stored_files" ADD COLUMN "pages" INTEGER;
CREATE INDEX "stored_files_user_id_booking_ref_idx" ON "stored_files" ("user_id", "booking_ref");
