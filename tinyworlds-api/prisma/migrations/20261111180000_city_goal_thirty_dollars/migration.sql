-- A city is now built once its donations reach US$30, not US$100 (CITY_GOAL_CENTS = 3000).
-- The goal is stored on each city when it is made, so the cities already on the list are moved
-- to the new goal here, built ones included (their founders are the first US$30 too), and any
-- city still being funded that already has enough is funded at once, as a donation would do.

UPDATE "cities" SET "goal_cents" = 3000, "updated_at" = now() WHERE "goal_cents" <> 3000;

UPDATE "cities" SET "status" = 'FUNDED', "updated_at" = now()
WHERE "status" = 'PROPOSED' AND "raised_cents" >= "goal_cents";
