-- Move the 9 imported legacy meetings/events to the Contacto calendar.
-- Paste this whole script into Supabase > SQL Editor.
-- Safe to run twice. It does not change the 6 vacation rows.
--
-- The 9 non-vacation rows from dados.csv are:
--   teste; Ligar Gerente Oxiarte; Ligar para o gerente;
--   Ligar a Neves e Neves - Filipe; Ligar para marcar reunião;
--   Ligar para Ralpi; Ligar ao Sérgio;
--   Reunião com o Sérgio da Termovapor; Ligar para João e Oliveira.
--
-- Changing calendarKey to contacto makes them visible to the whole team.
-- Title, notes, dates, owner, participants and version remain unchanged.

begin;

do $$
declare
  found integer;
begin
  select count(*)
    into found
    from vouga_next.calendar_events
   where row_key = any (array[
     '0613c2db-5583-4181-a7c0-5700b0424428',
     '0a16ec86-f5ef-4580-a63b-32c8ac5694c0',
     '379bbc1c-5dc4-4754-ad90-09fc48929476',
     '51e80063-089e-496d-889b-efe281290c31',
     '600c1c52-549d-4363-87fd-0bdc85d22de9',
     '63f29ca9-259c-452b-af91-905d28e46ac6',
     '755dbe4f-86d9-49a1-9e0e-96b4ad59443a',
     '759bd4fa-570a-4917-9d35-d3e2c471f2e2',
     'd6bb6057-09a3-4976-ad76-76267bb85f6a'
   ]);

  if found <> 9 then
    raise exception
      'Esperados 9 meetings/events importados, mas foram encontrados %. Nenhuma alteração foi feita.',
      found;
end $$;

update vouga_next.calendar_events
   set data = data || jsonb_build_object('calendarKey', 'contacto')
 where row_key = any (array[
   '0613c2db-5583-4181-a7c0-5700b0424428',
   '0a16ec86-f5ef-4580-a63b-32c8ac5694c0',
   '379bbc1c-5dc4-4754-ad90-09fc48929476',
   '51e80063-089e-496d-889b-efe281290c31',
   '600c1c52-549d-4363-87fd-0bdc85d22de9',
   '63f29ca9-259c-452b-af91-905d28e46ac6',
   '755dbe4f-86d9-49a1-9e0e-96b4ad59443a',
   '759bd4fa-570a-4917-9d35-d3e2c471f2e2',
   'd6bb6057-09a3-4976-ad76-76267bb85f6a'
 ]);

commit;

-- Verification: every returned row must show calendar = contacto.
select data->>'startsAt' as starts,
       data->>'title' as title,
       data->>'calendarKey' as calendar,
       data->>'kind' as kind
  from vouga_next.calendar_events
 where row_key = any (array[
   '0613c2db-5583-4181-a7c0-5700b0424428',
   '0a16ec86-f5ef-4580-a63b-32c8ac5694c0',
   '379bbc1c-5dc4-4754-ad90-09fc48929476',
   '51e80063-089e-496d-889b-efe281290c31',
   '600c1c52-549d-4363-87fd-0bdc85d22de9',
   '63f29ca9-259c-452b-af91-905d28e46ac6',
   '755dbe4f-86d9-49a1-9e0e-96b4ad59443a',
   '759bd4fa-570a-4917-9d35-d3e2c471f2e2',
   'd6bb6057-09a3-4976-ad76-76267bb85f6a'
 ])
 order by data->>'startsAt';
