-- AlterTable
ALTER TABLE "users" ADD COLUMN "workspaceLimit" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN "owner_id" INTEGER;
ALTER TABLE "workspaces" ADD COLUMN "is_personal" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "workspaces_owner_id_idx" ON "workspaces"("owner_id");
