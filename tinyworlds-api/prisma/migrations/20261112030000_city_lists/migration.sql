-- Lists to hear when a city is built.
ALTER TABLE "donors" ADD COLUMN "welcomed_at" TIMESTAMP(3);
ALTER TABLE "cities" ADD COLUMN "lists_started_at" TIMESTAMP(3);
ALTER TABLE "cities" ADD COLUMN "lists_announced_at" TIMESTAMP(3);
ALTER TABLE "magic_links" ADD COLUMN "join_list" TEXT;
ALTER TABLE "magic_links" ADD COLUMN "join_locale" TEXT;

CREATE TABLE "list_members" (
    "id" UUID NOT NULL,
    "donor_id" UUID NOT NULL,
    "city_id" UUID,
    "locale" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "list_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "list_notices" (
    "donor_id" UUID NOT NULL,
    "city_id" UUID NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "list_notices_pkey" PRIMARY KEY ("donor_id","city_id")
);

CREATE INDEX "list_members_city_id_idx" ON "list_members"("city_id");

-- One membership per donor and list; a null city (the list of new cities) counts as one list.
-- An expression index, which Prisma cannot model.
CREATE UNIQUE INDEX "list_members_donor_list_key" ON "list_members" ("donor_id", COALESCE("city_id", '00000000-0000-0000-0000-000000000000'::uuid));

ALTER TABLE "list_members" ADD CONSTRAINT "list_members_donor_id_fkey" FOREIGN KEY ("donor_id") REFERENCES "donors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "list_members" ADD CONSTRAINT "list_members_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "list_notices" ADD CONSTRAINT "list_notices_donor_id_fkey" FOREIGN KEY ("donor_id") REFERENCES "donors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The cities already on the map were there before there were lists: they count as started and
-- announced, so nobody is mailed about them now.
UPDATE "cities" SET "lists_announced_at" = now(), "lists_started_at" = now() WHERE "status" = 'BUILT' OR "world_id" IS NOT NULL;
