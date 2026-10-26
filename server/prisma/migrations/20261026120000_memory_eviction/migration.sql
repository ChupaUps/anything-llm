-- AlterTable
ALTER TABLE "memories" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE "memories" ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "memories" ADD COLUMN "useCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "memories_user_id_scope_last_used_at_idx" ON "memories"("user_id", "scope", "last_used_at");

-- CreateIndex
CREATE INDEX "memories_user_id_workspace_id_last_used_at_idx" ON "memories"("user_id", "workspace_id", "last_used_at");
