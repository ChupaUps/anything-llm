-- CreateTable
CREATE TABLE "workspace_data_connectors" (
    "id" SERIAL NOT NULL,
    "workspace_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'generic',
    "url" TEXT NOT NULL,
    "auth_type" TEXT NOT NULL DEFAULT 'none',
    "auth_username" TEXT,
    "auth_secret" TEXT,
    "auth_key" TEXT,
    "headers" TEXT,
    "response_schema" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_status" TEXT,
    "last_error" TEXT,
    "last_checked_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_data_connectors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workspace_data_connectors_workspace_id_idx" ON "workspace_data_connectors"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_data_connectors_workspace_id_name_key" ON "workspace_data_connectors"("workspace_id", "name");

-- AddForeignKey
ALTER TABLE "workspace_data_connectors" ADD CONSTRAINT "workspace_data_connectors_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
