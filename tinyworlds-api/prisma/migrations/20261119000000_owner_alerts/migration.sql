CREATE TYPE "OwnerAlertChannel" AS ENUM ('EMAIL', 'TELEGRAM');

CREATE TABLE "owner_alerts" (
    "id" UUID NOT NULL,
    "channel" "OwnerAlertChannel" NOT NULL,
    "subject" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "owner_alerts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "owner_alerts_channel_available_at_id_idx"
    ON "owner_alerts"("channel", "available_at", "id");
