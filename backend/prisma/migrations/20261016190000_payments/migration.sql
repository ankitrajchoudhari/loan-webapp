ALTER TABLE "members" ADD COLUMN "credit_paise" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "members" ADD CONSTRAINT "members_credit_ok" CHECK ("credit_paise" >= 0);

CREATE TABLE "payments" (
  "id" UUID NOT NULL,
  "payment_no" INTEGER NOT NULL,
  "member_id" UUID NOT NULL,
  "method" VARCHAR(10) NOT NULL,
  "amount_paise" INTEGER NOT NULL,
  "fee_paise" INTEGER NOT NULL,
  "total_paise" INTEGER NOT NULL,
  "status" VARCHAR(12) NOT NULL DEFAULT 'initiated',
  "utr" VARCHAR(40),
  "upi_id" VARCHAR(100),
  "due_snapshot" JSONB,
  "allocation" JSONB,
  "created_by_id" UUID,
  "confirmed_by_id" UUID,
  "confirmed_at" TIMESTAMP(3),
  "reject_reason" TEXT,
  "submitted_at" TIMESTAMP(3),
  "receipt_printed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payments_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payments_amounts_ok" CHECK ("amount_paise" > 0 AND "fee_paise" >= 0 AND "total_paise" = "amount_paise" + "fee_paise"),
  CONSTRAINT "payments_method_ok" CHECK ("method" IN ('upi', 'cash')),
  CONSTRAINT "payments_status_ok" CHECK ("status" IN ('initiated', 'submitted', 'confirmed', 'rejected', 'cancelled'))
);
CREATE UNIQUE INDEX "payments_payment_no_key" ON "payments"("payment_no");
CREATE INDEX "payments_status_created_at_idx" ON "payments"("status", "created_at");
CREATE INDEX "payments_member_id_created_at_idx" ON "payments"("member_id", "created_at");
-- one confirmed/pending use of a UPI transaction id
CREATE UNIQUE INDEX "payments_utr_live" ON "payments"("utr") WHERE "utr" IS NOT NULL AND "status" IN ('submitted', 'confirmed');
