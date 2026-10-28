-- CreateTable
CREATE TABLE "workspace_sql_connectors" (
    "id" SERIAL NOT NULL,
    "workspace_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "database_id" TEXT NOT NULL,
    "engine" TEXT NOT NULL,
    "connection_string" TEXT NOT NULL,
    "schema" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_status" TEXT,
    "last_error" TEXT,
    "last_checked_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_sql_connectors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workspace_sql_connectors_workspace_id_idx" ON "workspace_sql_connectors"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_sql_connectors_workspace_id_database_id_key" ON "workspace_sql_connectors"("workspace_id", "database_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_sql_connectors_workspace_id_name_key" ON "workspace_sql_connectors"("workspace_id", "name");

-- AddForeignKey
ALTER TABLE "workspace_sql_connectors" ADD CONSTRAINT "workspace_sql_connectors_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
