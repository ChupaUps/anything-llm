-- AlterTable
-- Per-workspace list of disabled agent skill keys (JSON array). NULL or an
-- empty array means every globally-enabled skill stays available here.
ALTER TABLE "workspaces" ADD COLUMN "disabledAgentSkills" TEXT;
