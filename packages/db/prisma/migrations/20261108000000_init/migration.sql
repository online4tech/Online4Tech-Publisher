-- Initial schema for Online4Tech Publisher.
-- Backend-only tables: no Data API grants are added. RLS is enabled as defense in depth.

CREATE TYPE "Platform" AS ENUM ('FACEBOOK', 'INSTAGRAM');
CREATE TYPE "PostStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED');
CREATE TYPE "TargetStatus" AS ENUM ('PENDING', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED');
CREATE TYPE "ConnectionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'NEEDS_REAUTH');
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "displayName" TEXT,
  "passwordHash" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "MetaConnection" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "metaUserId" TEXT,
  "status" "ConnectionStatus" NOT NULL DEFAULT 'NEEDS_REAUTH',
  "encryptedToken" TEXT,
  "tokenExpiresAt" TIMESTAMPTZ(3),
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "connectedAt" TIMESTAMPTZ(3),
  "lastValidatedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "MetaConnection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MetaConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "MetaConnection_userId_status_idx" ON "MetaConnection"("userId", "status");

CREATE TABLE "SocialAccount" (
  "id" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "platform" "Platform" NOT NULL,
  "platformId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "username" TEXT,
  "category" TEXT,
  "encryptedAccessToken" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SocialAccount_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "MetaConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SocialAccount_platform_platformId_key" ON "SocialAccount"("platform", "platformId");
CREATE INDEX "SocialAccount_connectionId_isActive_idx" ON "SocialAccount"("connectionId", "isActive");

CREATE TABLE "Post" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "caption" TEXT NOT NULL DEFAULT '',
  "status" "PostStatus" NOT NULL DEFAULT 'DRAFT',
  "scheduledAt" TIMESTAMPTZ(3),
  "publishedAt" TIMESTAMPTZ(3),
  "timeZone" TEXT NOT NULL DEFAULT 'Africa/Cairo',
  "campaign" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Post_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Post_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Post_userId_status_scheduledAt_idx" ON "Post"("userId", "status", "scheduledAt");
CREATE INDEX "Post_campaign_idx" ON "Post"("campaign");

CREATE TABLE "PostTarget" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "socialAccountId" TEXT NOT NULL,
  "platform" "Platform" NOT NULL,
  "status" "TargetStatus" NOT NULL DEFAULT 'PENDING',
  "externalPostId" TEXT,
  "containerId" TEXT,
  "publishedAt" TIMESTAMPTZ(3),
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "PostTarget_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PostTarget_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PostTarget_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PostTarget_postId_socialAccountId_key" ON "PostTarget"("postId", "socialAccountId");
CREATE INDEX "PostTarget_status_updatedAt_idx" ON "PostTarget"("status", "updatedAt");

CREATE TABLE "MediaAsset" (
  "id" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" BIGINT NOT NULL,
  "width" INTEGER,
  "height" INTEGER,
  "durationMs" INTEGER,
  "checksum" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MediaAsset_storageKey_key" ON "MediaAsset"("storageKey");

CREATE TABLE "PostMedia" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "mediaAssetId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "platform" "Platform",
  CONSTRAINT "PostMedia_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PostMedia_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PostMedia_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PostMedia_postId_mediaAssetId_platform_key" ON "PostMedia"("postId", "mediaAssetId", "platform");
CREATE INDEX "PostMedia_postId_sortOrder_idx" ON "PostMedia"("postId", "sortOrder");

CREATE TABLE "ScheduledJob" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "targetId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
  "runAt" TIMESTAMPTZ(3) NOT NULL,
  "lockedAt" TIMESTAMPTZ(3),
  "completedAt" TIMESTAMPTZ(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ScheduledJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ScheduledJob_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ScheduledJob_idempotencyKey_key" ON "ScheduledJob"("idempotencyKey");
CREATE INDEX "ScheduledJob_status_runAt_idx" ON "ScheduledJob"("status", "runAt");
CREATE INDEX "ScheduledJob_postId_idx" ON "ScheduledJob"("postId");

CREATE TABLE "PublishingLog" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "targetId" TEXT,
  "level" TEXT NOT NULL DEFAULT 'info',
  "event" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "details" JSONB,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PublishingLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PublishingLog_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PublishingLog_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "PostTarget"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "PublishingLog_postId_createdAt_idx" ON "PublishingLog"("postId", "createdAt");

CREATE TABLE "AnalyticsSnapshot" (
  "id" TEXT NOT NULL,
  "socialAccountId" TEXT NOT NULL,
  "metric" TEXT NOT NULL,
  "value" DOUBLE PRECISION,
  "unavailable" BOOLEAN NOT NULL DEFAULT false,
  "capturedAt" TIMESTAMPTZ(3) NOT NULL,
  "sourcePayload" JSONB,
  CONSTRAINT "AnalyticsSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AnalyticsSnapshot_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AnalyticsSnapshot_socialAccountId_metric_capturedAt_idx" ON "AnalyticsSnapshot"("socialAccountId", "metric", "capturedAt");

CREATE TABLE "Setting" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Setting_key_key" ON "Setting"("key");

CREATE TABLE "AuditEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "action" TEXT NOT NULL,
  "entity" TEXT,
  "entityId" TEXT,
  "details" JSONB,
  "ipAddress" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "AuditEvent_userId_createdAt_idx" ON "AuditEvent"("userId", "createdAt");
CREATE INDEX "AuditEvent_entity_entityId_idx" ON "AuditEvent"("entity", "entityId");

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MetaConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SocialAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Post" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PostTarget" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MediaAsset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PostMedia" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ScheduledJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PublishingLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AnalyticsSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Setting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditEvent" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  "User", "MetaConnection", "SocialAccount", "Post", "PostTarget",
  "MediaAsset", "PostMedia", "ScheduledJob", "PublishingLog",
  "AnalyticsSnapshot", "Setting", "AuditEvent"
FROM anon, authenticated, PUBLIC;
