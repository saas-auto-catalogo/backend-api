-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'OWNER', 'MANAGER', 'VIEWER');

-- CreateEnum
CREATE TYPE "WorkspaceStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FeedSourceType" AS ENUM ('AUTOCERTO', 'ALTIMUS', 'SISVAG', 'BOMCONTROLE', 'WEBMOTORS', 'BASE44', 'SPICE_DIGITAL', 'GENERIC_XML', 'GENERIC_JSON', 'CUSTOM_API');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('SUCCESS', 'PARTIAL_SUCCESS', 'FAILED', 'RUNNING');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'SOLD');

-- CreateEnum
CREATE TYPE "VehicleCondition" AS ENUM ('NOVO', 'SEMINOVO', 'USADO');

-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('FLEX', 'GASOLINA', 'ETANOL', 'DIESEL', 'HIBRIDO', 'HIBRIDO_PLUG_IN', 'MHEV_HIBRIDO_LEVE', 'ELETRICO', 'GNV', 'TETRAFUEL', 'OUTRO');

-- CreateEnum
CREATE TYPE "TransmissionType" AS ENUM ('MANUAL', 'AUTOMATICO', 'AUTOMATIZADO', 'CVT', 'DUPLA_EMBREAGEM', 'SEMI_AUTOMATICO', 'OUTRO');

-- CreateEnum
CREATE TYPE "BodyStyle" AS ENUM ('SUV', 'SEDAN', 'HATCHBACK', 'COUPE', 'CONVERTIBLE', 'PICKUP', 'MINIVAN', 'VAN', 'WAGON', 'COMMERCIAL', 'MOTORCYCLE', 'OTHER');

-- CreateTable: workspaces
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "cnpj" VARCHAR(20),
    "phone" VARCHAR(30),
    "city" VARCHAR(100),
    "state" VARCHAR(2),
    "status" "WorkspaceStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable: dealerships
CREATE TABLE "dealerships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "trade_name" VARCHAR(255) NOT NULL,
    "legal_name" VARCHAR(255),
    "cnpj" VARCHAR(20),
    "phone" VARCHAR(30),
    "email" VARCHAR(255),
    "address" VARCHAR(255),
    "city" VARCHAR(100),
    "state" VARCHAR(2),
    "postal_code" VARCHAR(10),
    "website_url" VARCHAR(2000),
    "logo_url" VARCHAR(2000),
    "meta_business_id" VARCHAR(100),
    "meta_catalog_id" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dealerships_pkey" PRIMARY KEY ("id")
);

-- CreateTable: users
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "is_super_admin" BOOLEAN NOT NULL DEFAULT false,
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "mfa_secret" VARCHAR(255),
    "avatar_url" VARCHAR(1000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable: workspace_members
CREATE TABLE "workspace_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MANAGER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable: feed_configs
CREATE TABLE "feed_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "dealership_id" UUID,
    "source_type" "FeedSourceType" NOT NULL,
    "feed_url" VARCHAR(2000) NOT NULL,
    "sync_interval_minutes" INTEGER NOT NULL DEFAULT 60,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "active_token_hash" VARCHAR(128) NOT NULL,
    "token_salt" VARCHAR(64) NOT NULL,
    "previous_token_hash" VARCHAR(128),
    "previous_token_expiry" TIMESTAMP(3),
    "last_sync_at" TIMESTAMP(3),
    "last_sync_status" "SyncStatus",
    "last_sync_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feed_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: vehicles
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "feed_config_id" UUID NOT NULL,
    "dealership_id" UUID,
    "external_id" VARCHAR(255) NOT NULL,
    "vin" VARCHAR(50),
    "license_plate" VARCHAR(20),
    "stock_number" VARCHAR(100),
    "make" VARCHAR(100) NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    "version" VARCHAR(255) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "body_style" "BodyStyle" NOT NULL,
    "manufacture_year" INTEGER NOT NULL,
    "model_year" INTEGER NOT NULL,
    "doors" INTEGER NOT NULL DEFAULT 4,
    "exterior_color" VARCHAR(100) NOT NULL,
    "interior_color" VARCHAR(100),
    "mileage" INTEGER NOT NULL DEFAULT 0,
    "fuel_type" "FuelType" NOT NULL,
    "transmission" "TransmissionType" NOT NULL,
    "engine_size" VARCHAR(50),
    "drivetrain" VARCHAR(50),
    "armored" BOOLEAN NOT NULL DEFAULT false,
    "price" DECIMAL(12,2) NOT NULL,
    "promotional_price" DECIMAL(12,2),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
    "price_on_request" BOOLEAN NOT NULL DEFAULT false,
    "condition" "VehicleCondition" NOT NULL DEFAULT 'SEMINOVO',
    "status" "VehicleStatus" NOT NULL DEFAULT 'AVAILABLE',
    "has_warranty" BOOLEAN NOT NULL DEFAULT false,
    "warranty_details" VARCHAR(255),
    "canonical_url" VARCHAR(2000),
    "hero_image_url" VARCHAR(2000) NOT NULL,
    "images" JSONB NOT NULL,
    "features" JSONB NOT NULL,
    "description" TEXT NOT NULL,
    "notes" TEXT,
    "raw_payload_hash" VARCHAR(64) NOT NULL,
    "eligible_for_meta_ads" BOOLEAN NOT NULL DEFAULT true,
    "validation_warnings" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable: meta_catalogs
CREATE TABLE "meta_catalogs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "dealership_id" UUID,
    "catalog_name" VARCHAR(255) NOT NULL,
    "meta_catalog_id" VARCHAR(100),
    "feed_format" VARCHAR(50) NOT NULL DEFAULT 'XML_DAA',
    "public_feed_url" VARCHAR(2000),
    "filter_rules" JSONB,
    "total_vehicles_count" INTEGER NOT NULL DEFAULT 0,
    "eligible_vehicles_count" INTEGER NOT NULL DEFAULT 0,
    "last_export_at" TIMESTAMP(3),
    "last_export_status" "SyncStatus",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_catalogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: sync_histories
CREATE TABLE "sync_histories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "feed_config_id" UUID NOT NULL,
    "status" "SyncStatus" NOT NULL,
    "total_ingested" INTEGER NOT NULL DEFAULT 0,
    "total_created" INTEGER NOT NULL DEFAULT 0,
    "total_updated" INTEGER NOT NULL DEFAULT 0,
    "total_unchanged" INTEGER NOT NULL DEFAULT 0,
    "total_removed" INTEGER NOT NULL DEFAULT 0,
    "total_errors" INTEGER NOT NULL DEFAULT 0,
    "duration_ms" INTEGER NOT NULL,
    "error_message" TEXT,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable: audit_logs
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID,
    "actor_user_id" UUID NOT NULL,
    "actor_email" VARCHAR(255) NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "entity_name" VARCHAR(100) NOT NULL,
    "entity_id" VARCHAR(255),
    "impersonated_by_user_id" UUID,
    "impersonation_reason" VARCHAR(500),
    "ip_address" VARCHAR(50),
    "user_agent" VARCHAR(500),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: subscriptions
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "plan_tier" VARCHAR(50) NOT NULL,
    "max_vehicles" INTEGER NOT NULL DEFAULT 100,
    "status" VARCHAR(50) NOT NULL,
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: admin_settings
CREATE TABLE "admin_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" VARCHAR(100) NOT NULL,
    "value" TEXT NOT NULL,
    "value_type" VARCHAR(20) NOT NULL DEFAULT 'STRING',
    "description" VARCHAR(255),
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: workspaces
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");

-- CreateIndex: dealerships
CREATE INDEX "dealerships_workspace_id_idx" ON "dealerships"("workspace_id");
CREATE INDEX "dealerships_cnpj_idx" ON "dealerships"("cnpj");

-- CreateIndex: users
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex: workspace_members
CREATE UNIQUE INDEX "uq_workspace_user" ON "workspace_members"("workspace_id", "user_id");
CREATE INDEX "workspace_members_workspace_id_role_idx" ON "workspace_members"("workspace_id", "role");

-- CreateIndex: feed_configs
CREATE INDEX "feed_configs_workspace_id_is_active_idx" ON "feed_configs"("workspace_id", "is_active");
CREATE INDEX "feed_configs_active_token_hash_idx" ON "feed_configs"("active_token_hash");
CREATE INDEX "feed_configs_previous_token_hash_idx" ON "feed_configs"("previous_token_hash");

-- CreateIndex: vehicles (Índices compostos multi-tenant)
CREATE UNIQUE INDEX "uq_workspace_vehicle_external_id" ON "vehicles"("workspace_id", "external_id");
CREATE INDEX "vehicles_workspace_id_vin_idx" ON "vehicles"("workspace_id", "vin");
CREATE INDEX "vehicles_workspace_id_status_idx" ON "vehicles"("workspace_id", "status");
CREATE INDEX "vehicles_workspace_id_eligible_for_meta_ads_idx" ON "vehicles"("workspace_id", "eligible_for_meta_ads");
CREATE INDEX "vehicles_workspace_id_updated_at_idx" ON "vehicles"("workspace_id", "updated_at" DESC);

-- CreateIndex: meta_catalogs
CREATE INDEX "meta_catalogs_workspace_id_idx" ON "meta_catalogs"("workspace_id");
CREATE INDEX "meta_catalogs_dealership_id_idx" ON "meta_catalogs"("dealership_id");

-- CreateIndex: sync_histories
CREATE INDEX "sync_histories_workspace_id_created_at_idx" ON "sync_histories"("workspace_id", "created_at" DESC);
CREATE INDEX "sync_histories_feed_config_id_created_at_idx" ON "sync_histories"("feed_config_id", "created_at" DESC);

-- CreateIndex: audit_logs
CREATE INDEX "audit_logs_workspace_id_created_at_idx" ON "audit_logs"("workspace_id", "created_at" DESC);
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at" DESC);
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at" DESC);

-- CreateIndex: subscriptions
CREATE UNIQUE INDEX "subscriptions_workspace_id_key" ON "subscriptions"("workspace_id");

-- CreateIndex: admin_settings
CREATE UNIQUE INDEX "admin_settings_key_key" ON "admin_settings"("key");

-- AddForeignKey: dealerships -> workspaces
ALTER TABLE "dealerships" ADD CONSTRAINT "dealerships_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: workspace_members -> workspaces
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: workspace_members -> users
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: feed_configs -> workspaces
ALTER TABLE "feed_configs" ADD CONSTRAINT "feed_configs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: feed_configs -> dealerships
ALTER TABLE "feed_configs" ADD CONSTRAINT "feed_configs_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "dealerships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: vehicles -> workspaces
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: vehicles -> feed_configs
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_feed_config_id_fkey" FOREIGN KEY ("feed_config_id") REFERENCES "feed_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: vehicles -> dealerships
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "dealerships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: meta_catalogs -> workspaces
ALTER TABLE "meta_catalogs" ADD CONSTRAINT "meta_catalogs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: meta_catalogs -> dealerships
ALTER TABLE "meta_catalogs" ADD CONSTRAINT "meta_catalogs_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "dealerships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: sync_histories -> workspaces
ALTER TABLE "sync_histories" ADD CONSTRAINT "sync_histories_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: sync_histories -> feed_configs
ALTER TABLE "sync_histories" ADD CONSTRAINT "sync_histories_feed_config_id_fkey" FOREIGN KEY ("feed_config_id") REFERENCES "feed_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: audit_logs -> workspaces
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: audit_logs -> users
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: subscriptions -> workspaces
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
