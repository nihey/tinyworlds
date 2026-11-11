-- CreateEnum
CREATE TYPE "LinkImageKind" AS ENUM ('ICON', 'PICTURE');

-- AlterTable
ALTER TABLE "donors" ADD COLUMN     "links_hidden" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "donor_links" (
    "id" UUID NOT NULL,
    "donor_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "read_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "donor_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "link_images" (
    "id" UUID NOT NULL,
    "link_id" UUID NOT NULL,
    "kind" "LinkImageKind" NOT NULL,
    "bytes" BYTEA NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "link_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "donor_links_donor_id_url_key" ON "donor_links"("donor_id", "url");

-- CreateIndex
CREATE UNIQUE INDEX "link_images_link_id_kind_key" ON "link_images"("link_id", "kind");

-- AddForeignKey
ALTER TABLE "donor_links" ADD CONSTRAINT "donor_links_donor_id_fkey" FOREIGN KEY ("donor_id") REFERENCES "donors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "link_images" ADD CONSTRAINT "link_images_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "donor_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;
