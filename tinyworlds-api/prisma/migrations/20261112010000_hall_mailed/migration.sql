-- AlterTable: when a donor was told they are in the hall of fame; null until then
ALTER TABLE "donors" ADD COLUMN     "hall_mailed_at" TIMESTAMP(3);
