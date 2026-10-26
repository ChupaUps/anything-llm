-- CreateTable
CREATE TABLE "usage_events" (
    "id" SERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "source" TEXT,
    "user_id" INTEGER,
    "workspace_id" INTEGER,
    "model" TEXT,
    "provider" TEXT,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "images" INTEGER NOT NULL DEFAULT 0,
    "audioSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCost" DOUBLE PRECISION,
    "sourceRef" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usage_events_sourceRef_key" ON "usage_events"("sourceRef");

-- CreateIndex
CREATE INDEX "usage_events_kind_occurredAt_idx" ON "usage_events"("kind", "occurredAt");

-- CreateIndex
CREATE INDEX "usage_events_user_id_occurredAt_idx" ON "usage_events"("user_id", "occurredAt");
