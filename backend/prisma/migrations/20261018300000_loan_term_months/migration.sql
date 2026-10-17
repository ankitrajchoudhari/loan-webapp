-- Number of EMIs agreed for a loan. Interest is charged only for this many months (from the
-- "interest from" month); after that no more interest, even if repayment is late. NULL = until repaid.
ALTER TABLE "loans" ADD COLUMN "term_months" INTEGER;
ALTER TABLE "loans" ADD CONSTRAINT "loans_term_months_ok" CHECK ("term_months" IS NULL OR ("term_months" BETWEEN 1 AND 600));

-- Existing flat / fixed loans with an agreed EMI: number of EMIs = principal ÷ (EMI − monthly interest), rounded up.
UPDATE "loans" SET "term_months" = CEIL("principal_paise"::numeric / ("installment_paise" - m."interest"))
FROM (
  SELECT "id",
    CASE WHEN "interest_method" = 'fixed' THEN "fixed_interest_paise"
         ELSE ROUND("principal_paise"::numeric * "rate_bp" / 10000 / (CASE WHEN "rate_period" = 'year' THEN 12 ELSE 1 END)) END AS "interest"
  FROM "loans"
) m
WHERE m."id" = "loans"."id"
  AND "loans"."interest_method" IN ('flat', 'fixed')
  AND "loans"."installment_paise" > m."interest"
  AND CEIL("loans"."principal_paise"::numeric / ("loans"."installment_paise" - m."interest")) BETWEEN 1 AND 600;
