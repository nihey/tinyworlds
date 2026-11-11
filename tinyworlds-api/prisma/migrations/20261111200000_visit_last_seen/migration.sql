-- A visit's last sign of life: the page says it is still open every half minute while it is in
-- view. Visits from before stay null (unknown), rather than pretending they lasted no time.
ALTER TABLE "funnel_events" ADD COLUMN "last_seen_at" TIMESTAMP(3);

-- Each world's visits, counted for the front page's cards.
CREATE INDEX "funnel_events_step_world_idx" ON "funnel_events"("step", "world");

-- The visits seen in the last minute or so: who is exploring now.
CREATE INDEX "funnel_events_step_last_seen_at_idx" ON "funnel_events"("step", "last_seen_at");
