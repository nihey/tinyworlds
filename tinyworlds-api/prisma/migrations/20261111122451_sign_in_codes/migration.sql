-- Links already sent carry no code, and they live 15 minutes anyway: none is kept.
DELETE FROM "magic_links";

-- AlterTable
ALTER TABLE "magic_links" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "code_hash" TEXT NOT NULL;
