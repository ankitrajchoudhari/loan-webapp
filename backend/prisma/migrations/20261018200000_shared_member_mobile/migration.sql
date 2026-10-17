-- One mobile number may belong to several member accounts (e.g. a family sharing one phone).
-- At login the person picks which account, then gives that account's date of birth.
DROP INDEX "members_mobile_number_key";
CREATE INDEX "members_mobile_number_idx" ON "members"("mobile_number");
