-- CreateEnum
CREATE TYPE "ReportKind" AS ENUM ('blood', 'urine', 'genetic', 'imaging', 'body_metrics', 'self_reported', 'other');

-- CreateEnum
CREATE TYPE "SymptomStatus" AS ENUM ('active', 'improving', 'resolved');

-- CreateEnum
CREATE TYPE "InterventionKind" AS ENUM ('medication', 'supplement', 'protocol');

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "collected_on" DATE NOT NULL,
    "kind" "ReportKind" NOT NULL,
    "lab" TEXT,
    "fasting" BOOLEAN,
    "notes" TEXT,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "measurements" (
    "id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "variable" TEXT NOT NULL,
    "label" TEXT,
    "value" DOUBLE PRECISION,
    "value_text" TEXT,
    "unit" TEXT,
    "panel" TEXT,
    "method" TEXT,
    "notes" TEXT,
    "collected_on" DATE NOT NULL,

    CONSTRAINT "measurements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "symptoms" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "detail" TEXT,
    "status" "SymptomStatus" NOT NULL DEFAULT 'active',
    "reported_on" DATE NOT NULL,
    "resolved_on" DATE,

    CONSTRAINT "symptoms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interventions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "InterventionKind" NOT NULL,
    "dose" TEXT,
    "schedule" TEXT,
    "started_on" DATE,
    "stopped_on" DATE,
    "reason" TEXT,
    "notes" TEXT,

    CONSTRAINT "interventions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "observations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "local_day" VARCHAR(10) NOT NULL,
    "variable" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "genetic_markers" (
    "id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "section" TEXT,
    "trait" TEXT NOT NULL,
    "gene" TEXT,
    "snp" TEXT,
    "genotype" TEXT,
    "result" TEXT,
    "notes" TEXT,

    CONSTRAINT "genetic_markers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reports_user_id_collected_on_idx" ON "reports"("user_id", "collected_on");

-- CreateIndex
CREATE INDEX "measurements_user_id_variable_collected_on_idx" ON "measurements"("user_id", "variable", "collected_on");

-- CreateIndex
CREATE INDEX "symptoms_user_id_status_idx" ON "symptoms"("user_id", "status");

-- CreateIndex
CREATE INDEX "interventions_user_id_stopped_on_idx" ON "interventions"("user_id", "stopped_on");

-- CreateIndex
CREATE INDEX "observations_user_id_local_day_idx" ON "observations"("user_id", "local_day");

-- CreateIndex
CREATE INDEX "genetic_markers_user_id_trait_idx" ON "genetic_markers"("user_id", "trait");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "symptoms" ADD CONSTRAINT "symptoms_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "genetic_markers" ADD CONSTRAINT "genetic_markers_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "genetic_markers" ADD CONSTRAINT "genetic_markers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
