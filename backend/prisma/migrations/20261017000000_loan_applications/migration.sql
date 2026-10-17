-- Loan applications from members: amount + months (terms from the admin's defaults), KYC documents and bank details.
CREATE TABLE "loan_applications" (
    "id" UUID NOT NULL,
    "application_no" INTEGER NOT NULL,
    "member_id" UUID NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "months" INTEGER NOT NULL,
    "interest_method" "InterestMethod" NOT NULL,
    "rate_bp" INTEGER NOT NULL DEFAULT 0,
    "rate_period" "RatePeriod" NOT NULL DEFAULT 'month',
    "fixed_interest_paise" INTEGER NOT NULL DEFAULT 0,
    "emi_paise" INTEGER NOT NULL,
    "total_interest_paise" INTEGER NOT NULL,
    "purpose" VARCHAR(300),
    "aadhaar_number" VARCHAR(12) NOT NULL,
    "pan_number" VARCHAR(10) NOT NULL,
    "bank_name" VARCHAR(120) NOT NULL,
    "bank_branch" VARCHAR(200),
    "account_holder" VARCHAR(100) NOT NULL,
    "account_number" VARCHAR(20) NOT NULL,
    "ifsc" VARCHAR(11) NOT NULL,
    "ifsc_verified" BOOLEAN NOT NULL DEFAULT false,
    "documents" JSONB NOT NULL DEFAULT '{}',
    "status" VARCHAR(12) NOT NULL DEFAULT 'pending',
    "loan_id" UUID,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "reject_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "loan_applications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "loan_applications_status_ok" CHECK ("status" IN ('pending', 'approved', 'rejected', 'cancelled'))
);
CREATE UNIQUE INDEX "loan_applications_application_no_key" ON "loan_applications"("application_no");
CREATE INDEX "loan_applications_status_created_at_idx" ON "loan_applications"("status", "created_at");
CREATE INDEX "loan_applications_member_id_idx" ON "loan_applications"("member_id");
-- at most one application waiting for a decision per member
CREATE UNIQUE INDEX "loan_applications_one_pending" ON "loan_applications"("member_id") WHERE "status" = 'pending';
ALTER TABLE "loan_applications" ADD CONSTRAINT "loan_applications_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
