-- Run in Supabase SQL Editor AFTER creating the project.
-- Create your DJ email/password in Authentication > Users.
-- DJ authorization: insert their auth.users UUID into public.dj_accounts using the SQL below.
create extension if not exists pg_trgm;

create table if not exists public.dj_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade
);
create table if not exists public.song_requests (
 id bigint generated always as identity primary key,
 guest_name text not null,
 song_title text not null,
 artist text not null,
 normalized_song text not null,
 normalized_artist text not null,
 group_id bigint,
 created_at timestamptz not null default now()
);
create index if not exists song_requests_created_idx on public.song_requests(created_at,id);
create index if not exists song_requests_group_idx on public.song_requests(group_id);
create table if not exists public.song_groups (
 id bigint generated always as identity primary key,
 song_title text not null,
 artist text not null,
 normalized_song text not null,
 normalized_artist text not null,
 first_requested_at timestamptz not null default now(),
 played boolean not null default false
);
create index if not exists song_groups_first_idx on public.song_groups(first_requested_at,id);

alter table public.dj_accounts enable row level security;
alter table public.song_requests enable row level security;
alter table public.song_groups enable row level security;
revoke all on public.dj_accounts,public.song_requests,public.song_groups from anon,authenticated;

create or replace function public.normalize_music_text(p_text text)
returns text language sql immutable set search_path = '' as $$
 select trim(regexp_replace(lower(translate(coalesce(p_text,''),'ÄÖÜäöüß','AOUaous')),'[^a-z0-9]+',' ','g'));
$$;

create or replace function public.is_dj()
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.dj_accounts where user_id = (select auth.uid()));
$$;
revoke all on function public.is_dj() from public,anon;
grant execute on function public.is_dj() to authenticated;

-- Only the server-side RPC accepts guest submissions.
-- Requests are compared against groups younger than 60 minutes, anchored at first request.
create or replace function public.submit_song_request(p_guest_name text,p_song_title text,p_artist text)
returns void language plpgsql security definer set search_path = pg_catalog, public, extensions as $
declare
 n_song text := public.normalize_music_text(p_song_title);
 n_artist text := public.normalize_music_text(p_artist);
 match_id bigint;
begin
 if length(trim(coalesce(p_guest_name,''))) not between 1 and 60
    or length(trim(coalesce(p_song_title,''))) not between 1 and 120
    or length(trim(coalesce(p_artist,''))) not between 1 and 120
 then raise exception 'Invalid request'; end if;
 -- Serialize concurrent inserts; prevent duplicate groups on simultaneous scans.
 perform pg_advisory_xact_lock(4839201);
 select id into match_id from public.song_groups
 where first_requested_at > now() - interval '60 minutes'
   and (
    (normalized_song=n_song and normalized_artist=n_artist)
    or (length(n_song)>=5 and length(normalized_song)>=5
        and similarity(normalized_song,n_song) >= 0.83
        and similarity(normalized_artist,n_artist) >= 0.8)
   )
 order by first_requested_at desc, id desc limit 1;
 if match_id is null then
   insert into public.song_groups(song_title,artist,normalized_song,normalized_artist)
   values(trim(p_song_title),trim(p_artist),n_song,n_artist)
   returning id into match_id;
 end if;
 insert into public.song_requests(guest_name,song_title,artist,normalized_song,normalized_artist,group_id)
 values(trim(p_guest_name),trim(p_song_title),trim(p_artist),n_song,n_artist,match_id);
end;$$;
revoke all on function public.submit_song_request(text,text,text) from public;
grant execute on function public.submit_song_request(text,text,text) to anon,authenticated;

create or replace function public.dj_song_request_list()
returns table(id bigint,"position" bigint,song_title text,artist text,first_requested_at timestamptz,played boolean,request_count bigint,guest_names text[])
language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_dj() then raise exception 'Not authorized'; end if;
 return query select g.id,row_number() over(order by g.first_requested_at,g.id),
 g.song_title,g.artist,g.first_requested_at,g.played,
 count(r.id),array_agg(r.guest_name order by r.created_at,r.id)
 from public.song_groups g join public.song_requests r on r.group_id=g.id
 group by g.id order by g.first_requested_at,g.id;
end;$$;
revoke all on function public.dj_song_request_list() from public,anon;
grant execute on function public.dj_song_request_list() to authenticated;

create or replace function public.dj_mark_request_played(p_request_id bigint,p_played boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_dj() then raise exception 'Not authorized'; end if;
 update public.song_groups set played=p_played where id=p_request_id;
end;$$;
revoke all on function public.dj_mark_request_played(bigint,boolean) from public,anon;
grant execute on function public.dj_mark_request_played(bigint,boolean) to authenticated;

-- Private real-time change notifications (DJ must be logged in).
create policy "dj can subscribe to new requests" on public.song_requests
 for select to authenticated using (public.is_dj());
grant select on public.song_requests to authenticated;
do $$ begin
 alter publication supabase_realtime add table public.song_requests;
exception when duplicate_object then null; end $$;

-- ADMIN STEP: after adding a user in Authentication, replace this UUID:
-- insert into public.dj_accounts(user_id) values ('YOUR-DJ-AUTH-USER-UUID');