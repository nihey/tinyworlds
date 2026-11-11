-- CreateEnum
CREATE TYPE "QuizLevel" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- AlterTable: answers from before difficulties existed were given with hard's wrong answers
ALTER TABLE "quiz_answers" ADD COLUMN "level" "QuizLevel" NOT NULL DEFAULT 'HARD';

-- DropIndex
DROP INDEX "quiz_answers_visit_id_world_sight_id_key";
DROP INDEX "quiz_answers_world_sight_id_idx";

-- CreateIndex
CREATE UNIQUE INDEX "quiz_answers_visit_id_world_sight_id_level_key" ON "quiz_answers"("visit_id", "world", "sight_id", "level");
CREATE INDEX "quiz_answers_world_sight_id_level_idx" ON "quiz_answers"("world", "sight_id", "level");
