-- AlterTable
ALTER TABLE "Workflow" ADD COLUMN "publishedFeedMetaJson" TEXT;

-- CreateIndex
CREATE INDEX "Workflow_visibility_updatedAt_idx" ON "Workflow"("visibility", "updatedAt" DESC);
