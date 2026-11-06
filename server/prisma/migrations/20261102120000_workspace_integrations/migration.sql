-- CreateTable
-- Personal email / calendar connections scoped to a workspace. The agent can
-- only see a workspace's own integrations and only for the scopes the user
-- ticked. App passwords are encrypted at rest.
CREATE TABLE "workspace_integrations" (
    "id" SERIAL NOT NULL,
    "workspace_id" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "account_email" TEXT NOT NULL,
    "auth_user" TEXT NOT NULL,
    "app_password" TEXT NOT NULL,
    "imap_host" TEXT,
    "imap_port" INTEGER,
    "smtp_host" TEXT,
    "smtp_port" INTEGER,
    "caldav_url" TEXT,
    "calendar_path" TEXT,
    "scopes" TEXT NOT NULL DEFAULT '[]',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_status" TEXT,
    "last_error" TEXT,
    "last_checked_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workspace_integrations_workspace_id_idx" ON "workspace_integrations"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_integrations_workspace_id_provider_account_email_key" ON "workspace_integrations"("workspace_id", "provider", "account_email");

-- AddForeignKey
ALTER TABLE "workspace_integrations" ADD CONSTRAINT "workspace_integrations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
