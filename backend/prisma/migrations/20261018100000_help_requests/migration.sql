-- Login help: someone who can't log in asks the admin or the developer for help (no login needed).
CREATE TABLE "help_requests" (
    "id" UUID NOT NULL,
    "request_no" INTEGER NOT NULL,
    "mobile" VARCHAR(10) NOT NULL,
    "name" VARCHAR(100),
    "member_id" UUID,
    "env" VARCHAR(5) NOT NULL DEFAULT 'live',
    "problem" VARCHAR(30) NOT NULL,
    "message" VARCHAR(1000),
    "send_to" VARCHAR(10) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'open',
    "token_hash" VARCHAR(64) NOT NULL,
    "seen_at" TIMESTAMP(3),
    "seen_by_id" UUID,
    "fixed_at" TIMESTAMP(3),
    "fixed_by_id" UUID,
    "reply" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "help_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "help_requests_status_ok" CHECK ("status" IN ('open', 'seen', 'fixed')),
    CONSTRAINT "help_requests_send_to_ok" CHECK ("send_to" IN ('admin', 'developer'))
);
CREATE UNIQUE INDEX "help_requests_request_no_key" ON "help_requests"("request_no");
CREATE INDEX "help_requests_status_created_at_idx" ON "help_requests"("status", "created_at");
