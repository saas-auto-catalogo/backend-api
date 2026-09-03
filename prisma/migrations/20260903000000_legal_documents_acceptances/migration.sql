-- CreateTable
CREATE TABLE "legal_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(100) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "version" VARCHAR(20) NOT NULL,
    "frbr_work" VARCHAR(255) NOT NULL,
    "frbr_expression" VARCHAR(255) NOT NULL,
    "path" VARCHAR(500) NOT NULL,
    "content_hash" VARCHAR(80) NOT NULL,
    "published_at" DATE NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "synced_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legal_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_acceptances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "workspace_id" UUID,
    "slug" VARCHAR(100) NOT NULL,
    "version" VARCHAR(20) NOT NULL,
    "content_hash" VARCHAR(80) NOT NULL,
    "accepted_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "legal_documents_slug_version_key" ON "legal_documents"("slug", "version");

-- CreateIndex
CREATE INDEX "legal_documents_slug_is_current_idx" ON "legal_documents"("slug", "is_current");

-- CreateIndex
CREATE UNIQUE INDEX "legal_acceptances_user_id_slug_version_key" ON "legal_acceptances"("user_id", "slug", "version");

-- CreateIndex
CREATE INDEX "legal_acceptances_workspace_id_slug_idx" ON "legal_acceptances"("workspace_id", "slug");

-- AddForeignKey
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
