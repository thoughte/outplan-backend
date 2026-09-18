-- The dictionary of marker names. Reference data shared by every user, so it
-- carries no user_id: "vitamin_d_25oh means Vitamin D (25-OH), normally ng/mL"
-- is not a fact about a person.
CREATE TABLE "variable_catalog" (
  "variable"     TEXT NOT NULL,
  "display_name" TEXT,
  "default_unit" TEXT,
  "category"     TEXT,
  "aliases"      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  CONSTRAINT "variable_catalog_pkey" PRIMARY KEY ("variable")
);

CREATE INDEX "variable_catalog_category_idx" ON "variable_catalog" ("category");

-- Where each report came from, carried over from the old SQLite record.
-- booking_ref is what separates two blood tests collected on the same day -
-- he has two from 22 Apr 2023 - which a date alone cannot do.
ALTER TABLE "reports" ADD COLUMN "booking_ref" TEXT;
ALTER TABLE "reports" ADD COLUMN "source_name" TEXT;
CREATE INDEX "reports_user_id_booking_ref_idx" ON "reports" ("user_id", "booking_ref");
