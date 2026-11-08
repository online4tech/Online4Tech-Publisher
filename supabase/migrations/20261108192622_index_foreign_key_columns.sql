-- Add covering indexes for foreign-key columns flagged by Supabase advisors.
CREATE INDEX "PostMedia_mediaAssetId_idx" ON "PostMedia"("mediaAssetId");
CREATE INDEX "PostTarget_socialAccountId_idx" ON "PostTarget"("socialAccountId");
CREATE INDEX "PublishingLog_targetId_idx" ON "PublishingLog"("targetId");
