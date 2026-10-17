CREATE TABLE "support_tickets" (
  "id" UUID NOT NULL,
  "ticket_no" INTEGER NOT NULL,
  "created_by_id" UUID NOT NULL,
  "subject" VARCHAR(200) NOT NULL,
  "details" TEXT NOT NULL,
  "page" VARCHAR(200),
  "error_code" VARCHAR(60),
  "status" VARCHAR(10) NOT NULL DEFAULT 'open',
  "messages" JSONB NOT NULL DEFAULT '[]',
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "support_tickets_ticket_no_key" ON "support_tickets"("ticket_no");
CREATE INDEX "support_tickets_status_created_at_idx" ON "support_tickets"("status", "created_at");

CREATE TABLE "notifications" (
  "id" UUID NOT NULL,
  "recipient_id" UUID NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "body" TEXT,
  "link" VARCHAR(200),
  "read_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "notifications_recipient_id_read_at_created_at_idx" ON "notifications"("recipient_id", "read_at", "created_at");
