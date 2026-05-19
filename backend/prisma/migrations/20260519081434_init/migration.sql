-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "dslText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Layout" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Layout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterMetadata" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "characterName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "data" JSONB,

    CONSTRAINT "CharacterMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishedSnapshot" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "publicId" TEXT NOT NULL,
    "snapshotData" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublishedSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaySession" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "userId" TEXT,
    "state" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Project_ownerId_idx" ON "Project"("ownerId");

-- CreateIndex
CREATE INDEX "Layout_projectId_idx" ON "Layout"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterMetadata_projectId_characterName_key" ON "CharacterMetadata"("projectId", "characterName");

-- CreateIndex
CREATE UNIQUE INDEX "PublishedSnapshot_publicId_key" ON "PublishedSnapshot"("publicId");

-- CreateIndex
CREATE INDEX "PublishedSnapshot_projectId_idx" ON "PublishedSnapshot"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "PublishedSnapshot_projectId_version_key" ON "PublishedSnapshot"("projectId", "version");

-- CreateIndex
CREATE INDEX "PlaySession_snapshotId_idx" ON "PlaySession"("snapshotId");

-- CreateIndex
CREATE INDEX "PlaySession_userId_idx" ON "PlaySession"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_tokenHash_idx" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Layout" ADD CONSTRAINT "Layout_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterMetadata" ADD CONSTRAINT "CharacterMetadata_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishedSnapshot" ADD CONSTRAINT "PublishedSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaySession" ADD CONSTRAINT "PlaySession_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "PublishedSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaySession" ADD CONSTRAINT "PlaySession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
