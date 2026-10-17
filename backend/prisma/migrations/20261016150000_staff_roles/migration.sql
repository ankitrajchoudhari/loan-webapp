-- Staff roles: developer > admin > sub-admin (with assigned work areas)
ALTER TABLE "admin_users" ADD COLUMN "role" VARCHAR(10) NOT NULL DEFAULT 'admin';
ALTER TABLE "admin_users" ADD COLUMN "permissions" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "admin_users" ADD COLUMN "duty" TEXT;
ALTER TABLE "admin_users" ADD COLUMN "status" VARCHAR(10) NOT NULL DEFAULT 'active';
ALTER TABLE "admin_users" ADD COLUMN "created_by_id" UUID;
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_role_ok" CHECK ("role" IN ('developer', 'admin', 'subadmin'));
