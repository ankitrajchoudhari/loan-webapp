-- What a member payment is for: everything due (all), installments only, or one loan (EMI / advance EMIs / settlement).
ALTER TABLE "payments" ADD COLUMN "purpose" VARCHAR(12) NOT NULL DEFAULT 'all';
ALTER TABLE "payments" ADD COLUMN "loan_id" UUID;
ALTER TABLE "payments" ADD CONSTRAINT "payments_purpose_ok" CHECK ("purpose" IN ('all', 'installment', 'loan'));
