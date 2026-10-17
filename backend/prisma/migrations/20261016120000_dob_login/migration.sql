-- Members log in with mobile + date of birth (no OTP / PIN any more)
ALTER TABLE "members" DROP COLUMN "pin_hash";
ALTER TABLE "members" ADD COLUMN "date_of_birth" DATE;

-- Admins register once via Firebase (phone OTP or Google), then log in with
-- mobile + date of birth or Google, plus the secret code
ALTER TABLE "admin_users" ALTER COLUMN "mobile_number" DROP NOT NULL;
ALTER TABLE "admin_users" ALTER COLUMN "pin_hash" DROP NOT NULL;
ALTER TABLE "admin_users" ADD COLUMN "email" VARCHAR(200);
ALTER TABLE "admin_users" ADD COLUMN "firebase_uid" VARCHAR(128);
ALTER TABLE "admin_users" ADD COLUMN "date_of_birth" DATE;
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");
CREATE UNIQUE INDEX "admin_users_firebase_uid_key" ON "admin_users"("firebase_uid");
