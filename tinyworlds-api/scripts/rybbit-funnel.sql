-- The donation funnel as a Rybbit analytics site saw it, in the rows `npm run funnel:import`
-- reads: one per session, step and world. For bringing in what happened before the site
-- reported its own steps (see CLAUDE.md, "History from the page analytics").
--
--   clickhouse-client --param_site=<site id> --param_until='<YYYY-MM-DD hh:mm:ss, UTC>' \
--     --queries-file rybbit-funnel.sql > funnel.ndjson
--
-- A page view is a VISIT of the world its path starts with ("home" for the front page); the
-- site's `donate_open` and `donate_checkout` events are the next two steps. The visit id is
-- made from the session id, so importing the same history twice changes nothing.
SELECT
  UUIDNumToString(MD5(concat('rybbit:', session_id))) AS visitId,
  step,
  world,
  multiIf(startsWith(lower(any(language)), 'pt'), 'pt-BR',
          startsWith(lower(any(language)), 'es'), 'es-ES',
          'en-US') AS locale,
  nullIf(argMin(city_named, timestamp), '') AS city,
  if(argMin(dollars, timestamp) > 0, toInt64(argMin(dollars, timestamp)) * 100, NULL) AS amountCents,
  toUnixTimestamp(min(timestamp)) AS at
FROM (
  SELECT
    session_id,
    timestamp,
    language,
    multiIf(type = 'pageview', 'VISIT',
            event_name = 'donate_open', 'DONATE_OPENED',
            'CHECKOUT_STARTED') AS step,
    splitByChar('/', pathname)[2] AS folder,
    JSONExtractString(toJSONString(props), 'world') AS named,
    multiIf(type != 'pageview' AND named != '', named, folder = '', 'home', folder) AS world,
    if(type = 'pageview', '', JSONExtractString(toJSONString(props), 'city')) AS city_named,
    -- the amount is whole dollars, kept as text: "25"
    if(type = 'pageview', 0, toInt64OrZero(JSONExtractString(toJSONString(props), 'amount'))) AS dollars
  FROM events
  WHERE site_id = {site:UInt16}
    AND timestamp < {until:DateTime}
    AND (type = 'pageview' OR (type = 'custom_event' AND event_name IN ('donate_open', 'donate_checkout')))
)
WHERE match(world, '^[a-z0-9]{3,20}$') AND world != 'admin'
GROUP BY session_id, step, world
ORDER BY at
FORMAT JSONEachRow
