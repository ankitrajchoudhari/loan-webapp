-- Document photos live in the database (works on hosts without a lasting disk, e.g. Vercel)
CREATE TABLE "loan_documents" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "content_type" VARCHAR(30) NOT NULL,
    "data" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "loan_documents_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "loan_documents_application_id_kind_key" ON "loan_documents"("application_id", "kind");
ALTER TABLE "loan_documents" ADD CONSTRAINT "loan_documents_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "loan_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
