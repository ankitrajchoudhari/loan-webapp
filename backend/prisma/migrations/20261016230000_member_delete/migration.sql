-- Deleted members: only a hash of the mobile number is kept, so the number can't be reused for 7 days
CREATE TABLE "deleted_mobiles" (
    "mobile_hash" VARCHAR(64) NOT NULL,
    "deleted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "available_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "deleted_mobiles_pkey" PRIMARY KEY ("mobile_hash")
);
