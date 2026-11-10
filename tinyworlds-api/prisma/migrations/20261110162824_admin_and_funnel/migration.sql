-- CreateEnum
CREATE TYPE "FunnelStep" AS ENUM ('VISIT', 'DONATE_OPENED', 'CHECKOUT_STARTED', 'CHECKOUT_CANCELLED');

-- AlterTable
ALTER TABLE "donations" ADD COLUMN     "visit_id" UUID;

-- CreateTable
CREATE TABLE "funnel_events" (
    "id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "step" "FunnelStep" NOT NULL,
    "world" TEXT NOT NULL,
    "locale" TEXT,
    "city" TEXT,
    "amount_cents" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "funnel_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admins" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "magic_links" (
    "id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "magic_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "funnel_events_created_at_idx" ON "funnel_events"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "funnel_events_visit_id_step_world_key" ON "funnel_events"("visit_id", "step", "world");

-- CreateIndex
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");

-- CreateIndex
CREATE UNIQUE INDEX "magic_links_token_hash_key" ON "magic_links"("token_hash");

-- CreateIndex
CREATE INDEX "magic_links_admin_id_created_at_idx" ON "magic_links"("admin_id", "created_at");

-- CreateIndex
CREATE INDEX "donations_created_at_idx" ON "donations"("created_at");

-- AddForeignKey
ALTER TABLE "magic_links" ADD CONSTRAINT "magic_links_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;
