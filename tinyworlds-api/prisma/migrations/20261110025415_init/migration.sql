-- CreateEnum
CREATE TYPE "CityStatus" AS ENUM ('PROPOSED', 'FUNDED', 'BUILDING', 'BUILT');

-- CreateTable
CREATE TABLE "cities" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CityStatus" NOT NULL DEFAULT 'PROPOSED',
    "goal_cents" INTEGER NOT NULL,
    "raised_cents" INTEGER NOT NULL DEFAULT 0,
    "donation_count" INTEGER NOT NULL DEFAULT 0,
    "world_id" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donations" (
    "id" UUID NOT NULL,
    "stripe_session_id" TEXT NOT NULL,
    "stripe_payment_intent_id" TEXT,
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "city_id" UUID,
    "city_text" TEXT,
    "world" TEXT,
    "locale" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "donations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cities_slug_key" ON "cities"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "donations_stripe_session_id_key" ON "donations"("stripe_session_id");

-- CreateIndex
CREATE INDEX "donations_city_id_idx" ON "donations"("city_id");

-- AddForeignKey
ALTER TABLE "donations" ADD CONSTRAINT "donations_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
