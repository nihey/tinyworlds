-- AlterTable: when a donor had the owner's own note (src/benefactors/note-cli.ts); null until then
ALTER TABLE "donors" ADD COLUMN     "note_mailed_at" TIMESTAMP(3);

-- The first notes went out by hand, before there was a column to say so: on 2026-11-12, to every
-- donor who had just been told about the hall of fame. They have had theirs.
UPDATE "donors" SET "note_mailed_at" = "hall_mailed_at"
WHERE "hall_mailed_at" IS NOT NULL AND "hall_mailed_at" < '2026-11-12 01:03:00';
