-- Payment proof: members (and the samiti, for platform bills) upload a screenshot of the UPI payment.
ALTER TABLE "payments" ADD COLUMN "screenshot" BYTEA;
ALTER TABLE "payments" ADD COLUMN "screenshot_type" VARCHAR(30);
ALTER TABLE "payments" ADD COLUMN "screenshot_hash" VARCHAR(64);
CREATE INDEX "payments_screenshot_hash_idx" ON "payments"("screenshot_hash");

-- Platform fee: the developer switches charging on/off; each "on" stretch is one period.
CREATE TABLE "platform_fee_periods" (
    "id" UUID NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "rate_paise" INTEGER NOT NULL,
    "started_by_id" UUID,
    "ended_by_id" UUID,
    CONSTRAINT "platform_fee_periods_pkey" PRIMARY KEY ("id")
);
-- at most one running period
CREATE UNIQUE INDEX "platform_fee_periods_one_open" ON "platform_fee_periods"((true)) WHERE "ended_at" IS NULL;

-- One bill per month: days charged × rate per day. due → submitted (screenshot) → paid | rejected
CREATE TABLE "platform_bills" (
    "id" UUID NOT NULL,
    "bill_no" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "days" INTEGER NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "breakdown" JSONB NOT NULL DEFAULT '[]',
    "status" VARCHAR(12) NOT NULL DEFAULT 'due',
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "screenshot" BYTEA,
    "screenshot_type" VARCHAR(30),
    "screenshot_hash" VARCHAR(64),
    "utr" VARCHAR(40),
    "submitted_at" TIMESTAMP(3),
    "submitted_by_id" UUID,
    "paid_at" TIMESTAMP(3),
    "confirmed_by_id" UUID,
    "reject_reason" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "platform_bills_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "platform_bills_status_ok" CHECK ("status" IN ('due', 'submitted', 'paid', 'rejected'))
);
CREATE UNIQUE INDEX "platform_bills_bill_no_key" ON "platform_bills"("bill_no");
CREATE UNIQUE INDEX "platform_bills_year_month_key" ON "platform_bills"("year", "month");
