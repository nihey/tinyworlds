-- Once a city is built, its donors are mailed that it is on the map (src/benefactors/announce-cli.ts,
-- run by deploy/deploy.sh after the world is uploaded). This is when that happened; null until then.
ALTER TABLE "cities" ADD COLUMN "built_announced_at" TIMESTAMP(3);

-- The cities already built were on the map before there was a mail to say so: they count as
-- announced, so their donors are never told now.
UPDATE "cities" SET "built_announced_at" = now() WHERE "status" = 'BUILT';
