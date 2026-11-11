-- AlterTable
ALTER TABLE "magic_links" ADD COLUMN     "donor_id" UUID,
ALTER COLUMN "admin_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "magic_links_donor_id_created_at_idx" ON "magic_links"("donor_id", "created_at");

-- AddForeignKey
ALTER TABLE "magic_links" ADD CONSTRAINT "magic_links_donor_id_fkey" FOREIGN KEY ("donor_id") REFERENCES "donors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A link is an admin's or a donor's, never both and never nobody's (not in schema.prisma:
-- Prisma has no checks).
ALTER TABLE "magic_links" ADD CONSTRAINT "magic_links_one_owner" CHECK (num_nonnulls("admin_id", "donor_id") = 1);
