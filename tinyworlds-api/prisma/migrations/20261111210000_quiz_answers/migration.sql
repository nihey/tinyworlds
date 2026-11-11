-- CreateTable
CREATE TABLE "quiz_answers" (
    "id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "world" TEXT NOT NULL,
    "sight_id" TEXT NOT NULL,
    "choice" TEXT NOT NULL,
    "locale" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quiz_answers_world_sight_id_idx" ON "quiz_answers"("world", "sight_id");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_answers_visit_id_world_sight_id_key" ON "quiz_answers"("visit_id", "world", "sight_id");
