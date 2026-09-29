-- Import the legacy OS `meetings` rows into the Vouga OS v2 calendar.
-- Paste this whole file into Supabase > SQL Editor. It is safe to run twice.
--
-- Source: the 15 rows exported from the old `meetings` table (meetings.csv).
-- The export carried Windows-1252 mojibake ("JoÃ£o", "ReuniÃƒO"); the text below is
-- already repaired, so the accents land correctly in the database.
--
-- Mapping (old `meetings` -> vouga_next.calendar_events):
--   id             -> row_key and data.id (the legacy UUID is kept, so a re-run updates)
--   title          -> title
--   notes          -> body
--   starts_at      -> startsAt  (UTC instant, unchanged)
--   ends_at        -> endsAt
--   created_at     -> createdAt
--   updated_at     -> updatedAt
--   kind 'meeting' / 'event' -> kept as-is
--   kind 'vacation'          -> all-day 'event' on a personal calendar
--   calendar_tone  -> per-person vacation colour (blue=ines, green=miguel, red=roque),
--                     used as a fallback when the title does not name the person
--
-- Not carried over because they were empty in every exported row:
--   purpose, intended_result, agenda, open_questions, conclusion, closed_at,
--   closer_member_id, status (always 'planned' -> cancelled = false)
--
-- Where the events land (see src/domain/permissions.ts):
--   meetings / events -> calendarKey 'contacto', owner = first admin. The whole team sees them.
--   vacations         -> all-day, calendarKey 'personal' owned by the person named in
--                        the title; if that person is not a member, it falls back to
--                        'contacto' with the legacy title preserved.
--
-- Two things to know after the import:
--   1. "Vacation · ines" matches no member today, so those two rows land on the admin
--      'contacto' calendar. Create the member (id 'ines') and re-run this script: they
--      move to a personal calendar on their own, because the mapping is resolved by
--      lookup, not hard-coded.
--   2. Three vacations are longer than the 7-day limit enforced by the app when saving
--      (26383d8d = 10 days, d29730e4 = 12 days, fdc2deb2 = 17 days). They read and
--      display fine, but the app refuses to save them again until they are split.
--
-- vouga_next.workspace.revision is deliberately left alone: the app merges on read, so
-- the imported events appear on the next refresh (30s) or on a page reload.

begin;

-- Fail early with a readable message instead of inserting orphan rows.
do $$
begin
  if to_regclass('vouga_next.calendar_events') is null then
    raise exception 'Run supabase/migrations/20260927_vouga_next.sql first';
  end if;
  if not exists (select 1 from vouga_next.members) then
    raise exception 'vouga_next.members is empty. Open the app once to create the workspace, then re-run this script';
  end if;
end $$;

with legacy(id, title, kind, tone, starts_at, ends_at, notes, created_at, updated_at) as (
  values
    -- id                                   title                                      kind         tone     starts_at                 ends_at                   notes                                                                                                                                              created_at                        updated_at
    ('0613c2db-5583-4181-a7c0-5700b0424428'::text, 'teste'::text, 'meeting'::text, ''::text, '2026-09-22T08:00:00+00'::timestamptz, '2026-09-22T09:00:00+00'::timestamptz, 'teste'::text, '2026-09-22T22:00:51.558154+00'::timestamptz, '2026-09-22T22:00:51.558154+00'::timestamptz),
    ('0a16ec86-f5ef-4580-a63b-32c8ac5694c0', 'Ligar Gerente Oxiarte',                     'event',   '',   '2026-09-04T07:00:00+00', '2026-09-04T17:00:00+00', '925 789 683',                                            '2026-09-03T15:58:22.010614+00', '2026-09-03T15:58:22.010614+00'),
    ('26383d8d-411c-4104-be66-bca3d5f2006a', 'Vacation · ines',                           'vacation','blue', '2026-07-23T23:00:00+00', '2026-08-02T23:00:00+00', '',                                                       '2026-07-23T16:49:32.515196+00', '2026-07-23T16:50:15.747976+00'),
    ('337c84cb-f9c3-4608-86c4-0acd4c58a8df', 'Vacation · miguel',                         'vacation','green','2026-08-02T23:00:00+00', '2026-08-09T23:00:00+00', '',                                                       '2026-07-23T16:52:35.382995+00', '2026-07-23T16:52:35.382995+00'),
    ('379bbc1c-5dc4-4754-ad90-09fc48929476', 'Ligar para o gerente',                      'event',   '',   '2026-09-21T08:00:00+00', '2026-09-21T09:00:00+00', E'Ligar para o gerente da empresa João e Oliveira e marcar a consultoria.\nnº- 911808282', '2026-09-15T16:50:05.939497+00', '2026-09-15T16:50:05.939497+00'),
    ('51e80063-089e-496d-889b-efe281290c31', 'Ligar a Neves e Neves - Filipe',            'event',   '',   '2026-10-08T08:00:00+00', '2026-10-08T09:00:00+00', '',                                                       '2026-09-24T13:45:14.971757+00', '2026-09-24T13:45:14.971757+00'),
    ('600c1c52-549d-4363-87fd-0bdc85d22de9', 'Ligar para marcar reunião',                 'event',   '',   '2026-09-28T08:00:00+00', '2026-09-28T09:00:00+00', '',                                                       '2026-09-23T20:42:24.564031+00', '2026-09-23T20:42:24.564031+00'),
    ('63f29ca9-259c-452b-af91-905d28e46ac6', 'Ligar para Ralpi',                          'event',   '',   '2026-09-29T08:00:00+00', '2026-09-29T09:00:00+00', '',                                                       '2026-09-25T19:28:55.730212+00', '2026-09-25T19:28:55.730212+00'),
    ('755dbe4f-86d9-49a1-9e0e-96b4ad59443a', 'Ligar ao Sérgio',                           'event',   '',   '2026-10-08T08:00:00+00', '2026-10-08T09:00:00+00', E'Ligar para o Sérgio para relembra-lo  que ficamos de reunir dia 15 de outubro ou por aí.\nCONFIRMAR HORA DE REUNIÃO DE DIA 15', '2026-09-18T16:12:11.954255+00', '2026-09-21T13:18:29.167371+00'),
    ('759bd4fa-570a-4917-9d35-d3e2c471f2e2', 'Reunião com o Sérgio da Termovapor',        'meeting', '',   '2026-10-15T08:00:00+00', '2026-10-15T09:00:00+00', 'Reunião com o Sérgio (falta confirmar a hora)',          '2026-09-21T13:18:03.006763+00', '2026-09-21T13:18:03.006763+00'),
    ('d29730e4-fc5c-4f6a-adb5-0ee9034e543c', 'Vacation · roque',                          'vacation','red',  '2026-08-03T23:00:00+00', '2026-08-15T23:00:00+00', '',                                                       '2026-07-23T16:51:58.077354+00', '2026-07-23T16:51:58.077354+00'),
    ('d6bb6057-09a3-4976-ad76-76267bb85f6a', 'Ligar para João e Oliveira',                'meeting', '',   '2026-09-28T08:00:00+00', '2026-09-28T09:00:00+00', 'Ligar para João e Oliveira , já era para nos termos encontrado na semana, mas estava doente.', '2026-09-24T13:50:37.294558+00', '2026-09-24T13:50:37.294558+00'),
    ('dda6af70-d580-4aa7-a289-805449d4d0b4', 'Vacation · miguel',                         'vacation','green','2026-08-11T23:00:00+00', '2026-08-15T23:00:00+00', '',                                                       '2026-07-23T17:48:00.66061+00',  '2026-07-23T17:48:00.66061+00'),
    ('fdc2deb2-852d-4c09-8021-1cd34097f87f', 'Vacation · ines',                           'vacation','blue', '2026-08-06T23:00:00+00', '2026-08-23T23:00:00+00', '',                                                       '2026-07-23T16:51:14.985828+00', '2026-07-23T16:51:14.985828+00'),
    ('ff61f673-a21f-4995-a37b-6deb052f01e9', 'Vacation · miguel',                         'vacation','green','2026-07-11T23:00:00+00', '2026-07-15T23:00:00+00', '',                                                       '2026-07-23T16:52:53.789738+00', '2026-07-23T16:52:53.789738+00')
),
-- Legacy rows carry no owner, so meetings and events use Contacto and the first admin
-- as the calendar owner. Vacations use the resolved personal owner when available.
params as (
  select coalesce(
    (select row_key from vouga_next.members where data->>'role' = 'admin' order by position, row_key limit 1),
    (select row_key from vouga_next.members order by position, row_key limit 1)
  ) as fallback_owner
),
-- Vacations are personal: resolve the person from the title, then from the tone colour.
resolved as (
  select
    l.*,
    case when l.kind = 'vacation' then (
      select m.row_key
        from vouga_next.members m
       where m.row_key = person.person_key or lower(m.data->>'name') = person.person_key
       limit 1
    ) end as person_member
  from legacy l
  cross join lateral (
    select lower(coalesce(
      nullif(regexp_replace(l.title, '^Vacation[^A-Za-z]*', ''), ''),
      case l.tone when 'blue' then 'ines' when 'green' then 'miguel' when 'red' then 'roque' end
    )) as person_key
  ) person
),
mapped as (
  select
    r.*,
    case when r.kind = 'vacation' and r.person_member is not null
         then r.person_member else p.fallback_owner end as owner_id,
        case when r.kind = 'vacation' and r.person_member is not null
          then 'personal' else 'contacto' end as calendar_key
  from resolved r
  cross join params p
)
insert into vouga_next.calendar_events(row_key, position, data)
select
  m.id,
  base.next_position + (row_number() over (order by m.starts_at, m.id))::integer,
  jsonb_build_object(
    'id',                   m.id,
    'version',              1,
    'createdAt',            to_char(m.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'updatedAt',            to_char(m.updated_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'createdBy',            m.owner_id,
    'title',                m.title,
    'kind',                 case when m.kind = 'vacation' then 'event' else m.kind end,
    'body',                 coalesce(m.notes, ''),
    'startsAt',             to_char(m.starts_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'endsAt',               to_char(m.ends_at   at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'calendarOwnerId',      m.owner_id,
    'participantIds',       jsonb_build_array(m.owner_id),
    'calendarKey',          m.calendar_key,
    'externalParticipants', '[]'::jsonb,
    'organizationId',       null::text,
    'projectId',            null::text,
    'allDay',               (m.kind = 'vacation'),
    'cancelled',            false,
    'reminderMinutes',      10,
    'visibility',           'team',
    'syncStatus',           'local'
  )
from mapped m
cross join (
  select coalesce(max(position), -1) + 1 as next_position from vouga_next.calendar_events
) base
on conflict (row_key) do update set data = excluded.data;

-- The collection must be registered for the read API to return it.
insert into vouga_next.collections(name, table_name)
  values ('meetings', 'calendar_events')
  on conflict (name) do nothing;

commit;

-- Verification: should return the 15 imported events, oldest first.
select data->>'startsAt'      as starts,
       data->>'title'         as title,
       data->>'kind'          as kind,
       data->>'calendarKey'   as calendar,
       data->>'calendarOwnerId' as owner,
       data->>'allDay'        as all_day
  from vouga_next.calendar_events
 where row_key in (
   '0613c2db-5583-4181-a7c0-5700b0424428', '0a16ec86-f5ef-4580-a63b-32c8ac5694c0',
   '26383d8d-411c-4104-be66-bca3d5f2006a', '337c84cb-f9c3-4608-86c4-0acd4c58a8df',
   '379bbc1c-5dc4-4754-ad90-09fc48929476', '51e80063-089e-496d-889b-efe281290c31',
   '600c1c52-549d-4363-87fd-0bdc85d22de9', '63f29ca9-259c-452b-af91-905d28e46ac6',
   '755dbe4f-86d9-49a1-9e0e-96b4ad59443a', '759bd4fa-570a-4917-9d35-d3e2c471f2e2',
   'd29730e4-fc5c-4f6a-adb5-0ee9034e543c', 'd6bb6057-09a3-4976-ad76-76267bb85f6a',
   'dda6af70-d580-4aa7-a289-805449d4d0b4', 'fdc2deb2-852d-4c09-8021-1cd34097f87f',
   'ff61f673-a21f-4995-a37b-6deb052f01e9'
 )
 order by data->>'startsAt';
