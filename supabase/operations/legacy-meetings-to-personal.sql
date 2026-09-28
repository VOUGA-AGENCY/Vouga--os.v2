-- Move the imported legacy meetings/events from the 'office' calendar to Miguel's
-- personal calendar.
--
-- Paste into Supabase > SQL Editor. Safe to run twice.
--
-- Context: `canSeeMeeting` (src/domain/permissions.ts) only grants access when you are
-- an admin, when the event is 'contacto', or when it is 'personal' and you own it.
-- 'office' has no rule at all, so those 9 rows were admin-only. Moving them to
-- 'personal' with owner 'miguel' keeps them on Miguel's own calendar ("Pessoal").
--
-- Effect: visible to Miguel and to the other admins. Engineers still do not see them —
-- that is what 'personal' means. Use 'contacto' instead if the whole team must see them.
--
-- What this does NOT change:
--   data.version            -> stays 1, so editing these in the app still works
--   data.updatedAt          -> keeps the original legacy timestamp
--   data.visibility         -> has no effect on meetings; only tasks and notes use it
--   vouga_next.workspace    -> revision untouched, the app merges on read
--
-- The 9 rows (kind 'meeting' or 'event'; the 2 "Vacation · ines" rows stay in 'office'
-- until an 'ines' member exists):
--   0a16ec86  Ligar Gerente Oxiarte            event
--   379bbc1c  Ligar para o gerente             event
--   0613c2db  teste                            meeting
--   600c1c52  Ligar para marcar reunião        event
--   d6bb6057  Ligar para João e Oliveira       meeting
--   63f29ca9  Ligar para Ralpi                 event
--   51e80063  Ligar a Neves e Neves - Filipe   event
--   755dbe4f  Ligar ao Sérgio                  event
--   759bd4fa  Reunião com o Sérgio da Termovapor  meeting
--
-- NOTE: re-running supabase/operations/import-legacy-meetings.sql would put these back
-- on 'office' (its `mapped` CTE decides the calendar). Re-run this file afterwards.

begin;

-- A guard, so a typo in the id list cannot silently change nothing.
do $$
declare found integer;
begin
  select count(*) into found
    from vouga_next.calendar_events
   where row_key = any (array[
     '0a16ec86-f5ef-4580-a63b-32c8ac5694c0', '379bbc1c-5dc4-4754-ad90-09fc48929476',
     '0613c2db-5583-4181-a7c0-5700b0424428', '600c1c52-549d-4363-87fd-0bdc85d22de9',
     'd6bb6057-09a3-4976-ad76-76267bb85f6a', '63f29ca9-259c-452b-af91-905d28e46ac6',
     '51e80063-089e-496d-889b-efe281290c31', '755dbe4f-86d9-49a1-9e0e-96b4ad59443a',
     '759bd4fa-570a-4917-9d35-d3e2c471f2e2'
   ]);
  if found = 0 then
    raise exception 'None of the legacy meetings were found. Run import-legacy-meetings.sql first';
  end if;
  raise notice 'Updating % of the 9 expected rows', found;
end $$;

-- Keep every other key of the payload; the generated `calendar_key` column follows.
update vouga_next.calendar_events
   set data = data || jsonb_build_object('calendarKey', 'personal')
 where row_key = any (array[
   '0a16ec86-f5ef-4580-a63b-32c8ac5694c0', '379bbc1c-5dc4-4754-ad90-09fc48929476',
   '0613c2db-5583-4181-a7c0-5700b0424428', '600c1c52-549d-4363-87fd-0bdc85d22de9',
   'd6bb6057-09a3-4976-ad76-76267bb85f6a', '63f29ca9-259c-452b-af91-905d28e46ac6',
   '51e80063-089e-496d-889b-efe281290c31', '755dbe4f-86d9-49a1-9e0e-96b4ad59443a',
   '759bd4fa-570a-4917-9d35-d3e2c471f2e2'
 ]);

-- Optional: if you also want these marked as private in the app's visibility field
-- (cosmetic for meetings, nothing filters on it):
-- update vouga_next.calendar_events
--    set data = data || jsonb_build_object('visibility', 'private')
--  where row_key = any (array[
--    '0a16ec86-f5ef-4580-a63b-32c8ac5694c0', '379bbc1c-5dc4-4754-ad90-09fc48929476',
--    '0613c2db-5583-4181-a7c0-5700b0424428', '600c1c52-549d-4363-87fd-0bdc85d22de9',
--    'd6bb6057-09a3-4976-ad76-76267bb85f6a', '63f29ca9-259c-452b-af91-905d28e46ac6',
--    '51e80063-089e-496d-889b-efe281290c31', '755dbe4f-86d9-49a1-9e0e-96b4ad59443a',
--    '759bd4fa-570a-4917-9d35-d3e2c471f2e2'
--  ]);

commit;

-- Verification. Expected after the change:
--   personal / event    10   (4 vacations + 6 moved events)
--   personal / meeting   3   (the 3 moved meetings)
--   office   / event     2   (the 2 "Vacation · ines", waiting for an 'ines' member)
--   office   / meeting   0
select data->>'calendarKey' as calendar,
       data->>'kind'        as kind,
       count(*)             as events
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
 group by 1, 2
 order by 1, 2;
