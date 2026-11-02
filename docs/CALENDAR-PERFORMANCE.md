# Calendar diagnosis · 2026-11-02

Local main updated from 625f9ec to a950d19 before the changes. Read-only inspection of the configured Supabase workspace found 6,745 meetings (6,577 recurring instances), reaching 2040, and 15,873 activity entries. No production records were changed or removed during this investigation.

## Cause and changes

- The initial Google list was bounded but subsequent `syncToken` requests expanded recurring instances with no time bounds. Google disallows combining syncToken with timeMin/timeMax. Pull now requests a complete paginated snapshot for -90/+366 days on each webhook/manual sync, plus a daily window refresh via the existing cron. This trades incremental response size for strictly bounded expansion; no new polling service.
- Pages share the same fixed bounds. Incomplete/failed fetches never reconcile missing events. Existing records outside the window and pending local changes are preserved. Google series are not shortened or deleted. Previously imported far-future records remain stored, but are not refreshed until they enter the rolling window.
- Agenda repeatedly scanned all meetings and instantiated timezone formatters several times per month cell. It now memoizes a day index, rejects out-of-view dates before timezone conversion, and reuses formatters. Month/week/mobile/filter interactions retain the existing layout and calendar permissions.

## Measurements and remaining limitation

Local Bun measurements against the real read-only dataset: day indexing 3.6 ms for a 42-day grid; workspace projection 400 ms; first Supabase read 5,557 ms, cached read/revision check 862 ms; serialized admin snapshot approximately 13.4 MB (before HTTP compression). These are component measurements, not production page-load or browser benchmarks.

The remaining initial-load bottleneck is the full workspace read/serialization, including accumulated future instances and activity. This change intentionally does not delete that data or silently hide existing events. A follow-up should separate paginated activity and range-based calendar reads from the initial workspace payload, with on-demand month navigation and preserved permission checks. Do not solve this by removing valid Google meetings.

Validation: typecheck, ESLint, Vitest and production build. The browser reaches the local login; authenticated calendar testing requires the user's session. No commit, push or deployment performed.

Reference: https://developers.google.com/workspace/calendar/api/v3/reference/events/list
