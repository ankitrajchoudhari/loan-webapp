-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "PayMethod" AS ENUM ('cash', 'upi', 'bank', 'other');

-- CreateEnum
CREATE TYPE "EntrySource" AS ENUM ('entry', 'history');

-- CreateEnum
CREATE TYPE "InterestMethod" AS ENUM ('reducing', 'flat', 'fixed');

-- CreateEnum
CREATE TYPE "RatePeriod" AS ENUM ('month', 'year');

-- CreateEnum
CREATE TYPE "BatchRowKind" AS ENUM ('installment', 'loan', 'repayment');

-- CreateEnum
CREATE TYPE "BatchRowStatus" AS ENUM ('needs_check', 'verified', 'posted');

-- CreateTable
CREATE TABLE "members" (
    "id" UUID NOT NULL,
    "member_no" INTEGER NOT NULL,
    "full_name" VARCHAR(100) NOT NULL,
    "mobile_number" VARCHAR(10) NOT NULL,
    "join_date" DATE NOT NULL,
    "monthly_installment_paise" INTEGER NOT NULL,
    "status" "MemberStatus" NOT NULL DEFAULT 'active',
    "inactive_since" DATE,
    "note" TEXT,
    "pin_hash" VARCHAR(100),
    "failed_logins" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installments" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "due_paise" INTEGER NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "paid_on" DATE NOT NULL,
    "method" "PayMethod",
    "note" TEXT,
    "source" "EntrySource" NOT NULL DEFAULT 'entry',
    "batch_id" UUID,
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loans" (
    "id" UUID NOT NULL,
    "loan_no" INTEGER NOT NULL,
    "member_id" UUID NOT NULL,
    "taken_on" DATE NOT NULL,
    "principal_paise" INTEGER NOT NULL,
    "interest_method" "InterestMethod" NOT NULL,
    "rate_bp" INTEGER NOT NULL DEFAULT 0,
    "rate_period" "RatePeriod" NOT NULL DEFAULT 'month',
    "fixed_interest_paise" INTEGER NOT NULL DEFAULT 0,
    "interest_from_month" INTEGER NOT NULL,
    "interest_from_year" INTEGER NOT NULL,
    "installment_paise" INTEGER NOT NULL DEFAULT 0,
    "opening_interest_paise" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "source" "EntrySource" NOT NULL DEFAULT 'entry',
    "batch_id" UUID,
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_repayments" (
    "id" UUID NOT NULL,
    "loan_id" UUID NOT NULL,
    "paid_on" DATE NOT NULL,
    "total_paise" INTEGER NOT NULL,
    "principal_paise" INTEGER NOT NULL,
    "interest_paise" INTEGER NOT NULL,
    "method" "PayMethod",
    "note" TEXT,
    "source" "EntrySource" NOT NULL DEFAULT 'entry',
    "batch_id" UUID,
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loan_repayments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "history_batches" (
    "id" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "history_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "history_rows" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "kind" "BatchRowKind" NOT NULL,
    "data" JSONB NOT NULL,
    "status" "BatchRowStatus" NOT NULL DEFAULT 'needs_check',
    "posted_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "history_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "mobile_number" VARCHAR(10) NOT NULL,
    "pin_hash" VARCHAR(100) NOT NULL,
    "failed_logins" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "last_login" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_tokens" (
    "id" UUID NOT NULL,
    "mobile_number" VARCHAR(10) NOT NULL,
    "code_hash" VARCHAR(100) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_role" VARCHAR(10) NOT NULL,
    "actor_id" UUID,
    "actor_name" VARCHAR(100),
    "action" VARCHAR(60) NOT NULL,
    "entity" VARCHAR(30),
    "entity_id" UUID,
    "member_id" UUID,
    "reason" TEXT,
    "before" JSONB,
    "after" JSONB,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revoked_tokens" (
    "jti" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "revoked_tokens_pkey" PRIMARY KEY ("jti")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" VARCHAR(50) NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "members_member_no_key" ON "members"("member_no");

-- CreateIndex
CREATE UNIQUE INDEX "members_mobile_number_key" ON "members"("mobile_number");

-- CreateIndex
CREATE INDEX "members_full_name_idx" ON "members"("full_name");

-- CreateIndex
CREATE INDEX "installments_year_month_idx" ON "installments"("year", "month");

-- CreateIndex
CREATE INDEX "installments_member_id_idx" ON "installments"("member_id");

-- CreateIndex
CREATE UNIQUE INDEX "loans_loan_no_key" ON "loans"("loan_no");

-- CreateIndex
CREATE INDEX "loans_member_id_idx" ON "loans"("member_id");

-- CreateIndex
CREATE INDEX "loan_repayments_loan_id_paid_on_idx" ON "loan_repayments"("loan_id", "paid_on");

-- CreateIndex
CREATE INDEX "history_rows_batch_id_line_no_idx" ON "history_rows"("batch_id", "line_no");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_mobile_number_key" ON "admin_users"("mobile_number");

-- CreateIndex
CREATE INDEX "otp_tokens_mobile_number_created_at_idx" ON "otp_tokens"("mobile_number", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_at_idx" ON "audit_log"("at");

-- CreateIndex
CREATE INDEX "audit_log_entity_entity_id_idx" ON "audit_log"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_member_id_idx" ON "audit_log"("member_id");

-- AddForeignKey
ALTER TABLE "installments" ADD CONSTRAINT "installments_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installments" ADD CONSTRAINT "installments_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "history_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "history_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_repayments" ADD CONSTRAINT "loan_repayments_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_repayments" ADD CONSTRAINT "loan_repayments_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "history_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "history_rows" ADD CONSTRAINT "history_rows_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "history_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written safety rules (the database refuses bad data even if the app has a bug)
-- ---------------------------------------------------------------------------

-- one live (not cancelled) installment per member per month
CREATE UNIQUE INDEX "installments_one_per_month" ON "installments" ("member_id", "year", "month") WHERE "voided_at" IS NULL;

ALTER TABLE "installments" ADD CONSTRAINT "installments_amounts_ok" CHECK ("amount_paise" > 0 AND "due_paise" >= 0 AND "month" BETWEEN 1 AND 12);
ALTER TABLE "loans" ADD CONSTRAINT "loans_amounts_ok" CHECK ("principal_paise" > 0 AND "rate_bp" >= 0 AND "fixed_interest_paise" >= 0 AND "opening_interest_paise" >= 0 AND "installment_paise" >= 0 AND "interest_from_month" BETWEEN 1 AND 12);
ALTER TABLE "loan_repayments" ADD CONSTRAINT "repayments_split_ok" CHECK ("principal_paise" >= 0 AND "interest_paise" >= 0 AND "principal_paise" + "interest_paise" = "total_paise" AND "total_paise" > 0);
ALTER TABLE "members" ADD CONSTRAINT "members_installment_ok" CHECK ("monthly_installment_paise" > 0);
