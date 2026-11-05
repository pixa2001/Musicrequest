-- Musicrequest additive upgrade, 2026-11-05.
-- Execute once in Supabase SQL Editor. Existing song_requests, song_groups and DJ users are preserved.
-- Sessions: Europe/Berlin 06:00 to following 06:00; expiration 7 days AFTER the end.
create extension if not exists pg_trgm;

create table if not exists public.dj_events (
 id bigint generated always as identity primary key,
 session_date date not null unique,
 starts_at timestamptz not null,
 ends_at timestamptz not null,
 constraint dj_events_window_check check (ends_at > starts_at)
);
alter table public.dj_events enable row level security;
revoke all on public.dj_events from anon, authenticated;

alter table public.song_groups add column if not exists event_id bigint references public.dj_events(id);
alter table public.song_groups add column if not exists category text not null default 'international';
alter table public.song_requests add column if not exists event_id bigint references public.dj_events(id);
alter table public.song_requests add column if not exists client_hash text;
alter table public.song_groups drop constraint if exists song_groups_category_check;
alter table public.song_groups add constraint song_groups_category_check
 check(category in ('latino','german','international'));
create index if not exists song_groups_event_idx on public.song_groups(event_id,first_requested_at,id);
create index if not exists song_requests_event_idx on public.song_requests(event_id,created_at);
create index if not exists song_requests_client_limit_idx on public.song_requests(client_hash,created_at);

-- Backfill without deleting or overwriting any existing request.
insert into public.dj_events(session_date,starts_at,ends_at)
select distinct session_date,
 (session_date + time '06:00') at time zone 'Europe/Berlin',
 (session_date + interval '1 day' + time '06:00') at time zone 'Europe/Berlin'
from (
 select ((first_requested_at at time zone 'Europe/Berlin') - interval '6 hours')::date as session_date
 from public.song_groups
) existing
on conflict(session_date) do nothing;

update public.song_groups g set event_id=e.id
from public.dj_events e
where g.event_id is null
 and e.session_date=((g.first_requested_at at time zone 'Europe/Berlin')-interval '6 hours')::date;
update public.song_requests r set event_id=g.event_id
from public.song_groups g where r.group_id=g.id and r.event_id is null;

-- Conservative title/artist classification. Unknown music defaults to International.
create or replace function public.classify_music(p_title text,p_artist text)
returns text language plpgsql immutable set search_path=pg_catalog,public as $$
declare
 a text := public.normalize_music_text(p_artist);
 t text := public.normalize_music_text(p_title);
begin
 if a ~ '(bad bunny|karol g|rauw alejandro|ozuna|j balvin|maluma|daddy yankee|don omar|romeo santos|aventura|prince royce|marc anthony|shakira|enrique iglesias|luis fonsi|nicky jam|farruko|anuel|myke towers|manuel turizo|rosalia|gente de zona|celia cruz|grupo niche|juan luis guerra|elvis crespo|pitbull|becky g|sebastian yatra|c tangana|quevedo|feid)' 
    or t ~ '(despacito|gasolina|danza kuduro|propuesta indecente|la bachata|vivir mi vida|la gozadera|bailando|suavemente|la camisa negra)' then return 'latino'; end if;
 if a ~ '(brings|cat ballou|kasalla|h hner|hoe hner|bl ck f ss|black f ss|paveier|rabaue|querbeat|milj|kl ngelk pp|klungelkopp|voxxclub|andrea berg|helene fischer|dj tzi|wolfgang petry|mickie krause|j rgen drews|j rgen milski|h hend)' 
   or t ~ '(viva colonia|superjeilezick|k lscher jung|stadt met k|schatzi schenk mir ein foto|atemlos durch die nacht|ein stern der deinen namen tr gt|hulapalu|nie mehr fastelovend|polka polka polka)' then return 'german'; end if;
 return 'international';
end;$$;

-- Classify legacy groups conservatively. Preserve any category previously set manually.
update public.song_groups g
set category=public.classify_music(g.song_title,g.artist)
where g.category='international';

-- A caller-supplied random browser ID is pseudonymous; hash on the server and retain
-- the hash only with the request. This is a best-effort per-browser rate limit,
-- NOT an IP-based or identity-proof anti-abuse system.
-- Existing 3-argument RPC is revoked to prevent bypass after migration.
create or replace function public.submit_song_request_v2(
 p_guest_name text,p_song_title text,p_artist text,p_client_token text)
returns void language plpgsql security definer
set search_path=pg_catalog,public,extensions as $$
declare
 n_song text := public.normalize_music_text(p_song_title);
 n_artist text := public.normalize_music_text(p_artist);
 token_hash text := md5(p_client_token);
 event_key date := ((now() at time zone 'Europe/Berlin') - interval '6 hours')::date;
 selected_event bigint;
 selected_group bigint;
begin
 if length(trim(coalesce(p_guest_name,''))) not between 1 and 60 or
    length(trim(coalesce(p_song_title,''))) not between 1 and 120 or
    length(trim(coalesce(p_artist,''))) not between 1 and 120 or
    p_client_token !~ '^[a-f0-9-]{36}$'
 then raise exception 'Invalid song request'; end if;
 perform pg_advisory_xact_lock(hashtext(p_client_token)::bigint);
 if exists(select 1 from public.song_requests
           where client_hash=token_hash and created_at>now()-interval '30 seconds')
 then raise exception using message='RATE_LIMIT',errcode='P0001'; end if;
 insert into public.dj_events(session_date,starts_at,ends_at)
 values(event_key,
        (event_key+time '06:00') at time zone 'Europe/Berlin',
        (event_key+interval '1 day'+time '06:00') at time zone 'Europe/Berlin')
 on conflict(session_date) do nothing;
 select id into selected_event from public.dj_events where session_date=event_key;
 perform pg_advisory_xact_lock(4839201);
 select id into selected_group from public.song_groups
 where event_id=selected_event
   and first_requested_at>now()-interval '60 minutes'
   and (
    (normalized_song=n_song and normalized_artist=n_artist)
    or (length(n_song)>=5 and length(normalized_song)>=5
      and similarity(normalized_song,n_song)>=0.83
      and similarity(normalized_artist,n_artist)>=0.8)
   )
 order by first_requested_at,id limit 1;
 if selected_group is null then
  insert into public.song_groups(song_title,artist,normalized_song,normalized_artist,event_id,category)
  values(trim(p_song_title),trim(p_artist),n_song,n_artist,selected_event,
         public.classify_music(p_song_title,p_artist))
  returning id into selected_group;
 end if;
 insert into public.song_requests(guest_name,song_title,artist,normalized_song,normalized_artist,group_id,event_id,client_hash)
 values(trim(p_guest_name),trim(p_song_title),trim(p_artist),n_song,n_artist,selected_group,selected_event,token_hash);
end;$$;

revoke all on function public.submit_song_request(text,text,text) from anon,authenticated,public;
revoke all on function public.submit_song_request_v2(text,text,text,text) from public;
grant execute on function public.submit_song_request_v2(text,text,text,text) to anon,authenticated;

create or replace function public.dj_event_list()
returns table(id bigint,session_date date,ends_at timestamptz)
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if not public.is_dj() then raise exception 'Not authorized'; end if;
 return query select e.id,e.session_date,e.ends_at from public.dj_events e
 order by e.session_date desc;
end;$$;
revoke all on function public.dj_event_list() from public,anon;
grant execute on function public.dj_event_list() to authenticated;

create or replace function public.dj_song_request_list_v2(p_event_id bigint)
returns table(id bigint,"position" bigint,song_title text,artist text,
 first_requested_at timestamptz,played boolean,request_count bigint,
 guest_names text[],category text,normalized_song text,normalized_artist text)
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if not public.is_dj() then raise exception 'Not authorized'; end if;
 return query select g.id,row_number() over(order by g.first_requested_at,g.id),
 g.song_title,g.artist,g.first_requested_at,g.played,
 count(r.id),array_agg(r.guest_name order by r.created_at,r.id),
 g.category,g.normalized_song,g.normalized_artist
 from public.song_groups g join public.song_requests r on r.group_id=g.id
 where g.event_id=p_event_id
 group by g.id order by g.first_requested_at,g.id;
end;$$;
revoke all on function public.dj_song_request_list_v2(bigint) from public,anon;
grant execute on function public.dj_song_request_list_v2(bigint) to authenticated;

create or replace function public.dj_set_category(p_request_id bigint,p_category text)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if not public.is_dj() then raise exception 'Not authorized'; end if;
 if p_category not in ('latino','german','international') then
   raise exception 'Invalid category'; end if;
 update public.song_groups set category=p_category where id=p_request_id;
end;$$;
revoke all on function public.dj_set_category(bigint,text) from public,anon;
grant execute on function public.dj_set_category(bigint,text) to authenticated;

-- Realtime remains private: only DJ-authenticated users can select these rows.
create policy "dj can view groups" on public.song_groups
 for select to authenticated using(public.is_dj());
grant select on public.song_groups to authenticated;
do $$ begin
 alter publication supabase_realtime add table public.song_groups;
exception when duplicate_object then null; end $$;

-- Safe server-only retention function: never touch ongoing DJ evenings or young data.
create or replace function public.delete_expired_dj_events()
returns integer language plpgsql security definer
set search_path=pg_catalog,public as $$
declare deleted_count integer;
begin
 if current_user <> 'postgres' and auth.role() <> 'service_role' then
   raise exception 'Not authorized'; end if;
 -- Do not delete requests if there are any later than the event expiration.
 with expired as (
  select e.id from public.dj_events e
  where e.ends_at < now() - interval '7 days'
    and not exists(
      select 1 from public.song_requests r
      where r.event_id=e.id and r.created_at >= now()-interval '7 days')
 ),
 deleted_requests as (
  delete from public.song_requests r using expired e
  where r.event_id=e.id returning r.id
 ),
 deleted_groups as (
  delete from public.song_groups g using expired e
  where g.event_id=e.id returning g.id
 ),
 deleted_events as (
  delete from public.dj_events e using expired x
  where e.id=x.id returning e.id
 )
 select count(*) into deleted_count from deleted_events;
 return deleted_count;
end;$$;
revoke all on function public.delete_expired_dj_events() from public,anon,authenticated;
grant execute on function public.delete_expired_dj_events() to service_role;

-- Backfill and migration do NOT delete requests, groups or sessions.
