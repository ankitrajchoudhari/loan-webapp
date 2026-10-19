-- Top-up: a new loan = what is still owed on an old loan + new money. The old loan is closed by a
-- "moved" entry (not cash), and the new loan remembers how much principal it carried over.
ALTER TABLE "loans" ADD COLUMN "topup_of_loan_id" UUID;
ALTER TABLE "loans" ADD COLUMN "carried_principal_paise" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "loan_repayments" ADD COLUMN "moved_to_loan_id" UUID;
CREATE INDEX "loan_repayments_moved_to_loan_id_idx" ON "loan_repayments"("moved_to_loan_id");
