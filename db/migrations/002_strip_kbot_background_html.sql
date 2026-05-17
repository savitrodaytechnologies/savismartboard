-- =========================================================================
-- Migration 002: Strip KBot background HTML from PageJson
-- =========================================================================
-- Background: PageJson used to embed the full rendered KBot card HTML in
-- background.url for KBotContentCard / KBotQuestion / KBotSolvedCard pages.
-- That HTML is 50-200 KB per page and is already stored in KBot's own DB
-- (served via /smartboard/kbot/content-cards/{id}/render). The frontend now
-- fetches it on-demand (IndexedDB cache first), so we no longer need it in
-- PageJson.
--
-- What this migration does:
--   Removes the 'background.url' key from PageJson for all KBot-sourced pages.
-- After this, deserialise() returns background.html = undefined, and the
-- re-hydration effect in useSmartboardSession fetches the HTML from KBot.
--
-- JSON_MODIFY with a T-SQL NULL value REMOVES the key from the JSON object.
-- Safe to run multiple times (WHERE clause checks the key is present).
-- =========================================================================

UPDATE dbo.SmartboardSessionPage
SET    PageJson = JSON_MODIFY(PageJson, '$.background.url', NULL)
WHERE  SourceType IN (N'KBotContentCard', N'KBotQuestion', N'KBotSolvedCard')
  AND  ISJSON(PageJson) = 1
  AND  JSON_VALUE(PageJson, '$.background.url') IS NOT NULL;

-- Report how many rows were cleaned
SELECT @@ROWCOUNT AS PagesUpdated;
