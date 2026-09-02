-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN "stripe_customer_id" VARCHAR(255),
ADD COLUMN "stripe_subscription_id" VARCHAR(255),
ADD COLUMN "stripe_price_id" VARCHAR(255),
ADD COLUMN "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripe_customer_id_key" ON "subscriptions"("stripe_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripe_subscription_id_key" ON "subscriptions"("stripe_subscription_id");

-- CreateTable
CREATE TABLE "stripe_webhook_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "stripe_event_id" VARCHAR(255) NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkout_provisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "stripe_session_id" VARCHAR(255) NOT NULL,
    "workspace_id" UUID NOT NULL,
    "customer_email" VARCHAR(255) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'PENDING_REGISTRATION',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checkout_provisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stripe_webhook_events_stripe_event_id_key" ON "stripe_webhook_events"("stripe_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "checkout_provisions_stripe_session_id_key" ON "checkout_provisions"("stripe_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "checkout_provisions_workspace_id_key" ON "checkout_provisions"("workspace_id");

-- AddForeignKey
ALTER TABLE "checkout_provisions" ADD CONSTRAINT "checkout_provisions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
