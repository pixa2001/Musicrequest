begin;

create table public.dj_evenings (
 id bigint generated always as identity primary key,
 started_at timestamptz not null default clock_timestamp(),
 ended_at timestamptz
);
create unique index dj_evenings_one_open on public.dj_evenings ((ended_at is null)) where ended_at is null;
alter table public.dj_evenings enable row level security;
revoke all on public.dj_evenings from public, anon, authenticated;

alter table public.song_groups
 add column evening_id bigint references public.dj_evenings(id),
 add column category text not null default 'international'
 check (category in ('latino','german','international'));
create index song_groups_evening_idx on public.song_groups(evening_id);

create table public.guest_request_limits (
 token uuid primary key,
 submitted_at timestamptz not null
);
alter table public.guest_request_limits enable row level security;
revoke all on public.guest_request_limits from public, anon, authenticated;

create function public.music_category(title text, artist_name text)
returns text language sql immutable set search_path = '' as $$
 select case
  when latino and not german then 'latino'
  when german and not latino then 'german'
  else 'international' end
 from (
  select public.normalize_music_text(artist_name) ~ '^(bad bunny|shakira|daddy yankee|karol g|marc anthony|romeo santos|aventura|j balvin|celia cruz|juan luis guerra)$'
   or public.normalize_music_text(title) ~ '^(despacito|gasolina|bailando|vivir mi vida|la vida es un carnaval)$' as latino,
   public.normalize_music_text(artist_name) ~ '^(brings|black fooss|black foos|hohner|paveier|kasalla|cat ballou|helene fischer|andrea berg|juliane werding|nina chuba|die arzte)$'
   or public.normalize_music_text(title) ~ '^(viva colonia|atemlos durch die nacht|drink doch ene met)$' as german
 ) hints;
$$;

-- Scope matching to the active evening while retaining the existing matching rule.
-- The window is anchored to the first request and excludes minute 60.
create function public.submit_evening_song_request(
 p_guest_name text, p_song_title text, p_artist text, p_guest_token uuid
) returns void language plpgsql security definer
set search_path = pg_catalog, public, extensions as $$
declare
 n_song text := public.normalize_music_text(p_song_title);
 n_artist text := public.normalize_music_text(p_artist);
 active_evening bigint;
 match_id bigint;
 submitted timestamptz;
begin
 if p_guest_token is null
    or length(trim(coalesce(p_guest_name,''))) not between 1 and 60
    or length(trim(coalesce(p_song_title,''))) not between 1 and 120
    or length(trim(coalesce(p_artist,''))) not between 1 and 120
 then raise exception 'Invalid request'; end if;

 perform pg_advisory_xact_lock(4839201);
 submitted := clock_timestamp();
 insert into public.guest_request_limits as limits(token,submitted_at)
 values (p_guest_token,submitted)
 on conflict (token) do update set submitted_at=excluded.submitted_at
 where limits.submitted_at <= submitted - interval '30 seconds';
 if not found then
  raise exception using errcode='P0030', message='Bitte warte einen Moment, bevor du deinen nächsten Musikwunsch abschickst.';
 end if;
 delete from public.guest_request_limits where submitted_at <= submitted - interval '30 seconds';

 select id into active_evening from public.dj_evenings where ended_at is null;
 if active_evening is null then
  insert into public.dj_evenings(started_at) values(submitted) returning id into active_evening;
 end if;
 select id into match_id from public.song_groups
 where evening_id=active_evening and first_requested_at > submitted - interval '60 minutes'
   and (
    (normalized_song=n_song and normalized_artist=n_artist)
    or (length(n_song)>=5 and length(normalized_song)>=5
        and similarity(normalized_song,n_song) >= 0.83
        and similarity(normalized_artist,n_artist) >= 0.8)
   )
 order by first_requested_at desc,id desc limit 1;
 if match_id is null then
  insert into public.song_groups(song_title,artist,normalized_song,normalized_artist,first_requested_at,evening_id,category)
  values(trim(p_song_title),trim(p_artist),n_song,n_artist,submitted,active_evening,public.music_category(p_song_title,p_artist))
  returning id into match_id;
 end if;
 insert into public.song_requests(guest_name,song_title,artist,normalized_song,normalized_artist,group_id,created_at)
 values(trim(p_guest_name),trim(p_song_title),trim(p_artist),n_song,n_artist,match_id,submitted);
end;
$$;
revoke all on function public.submit_evening_song_request(text,text,text,uuid) from public;
grant execute on function public.submit_evening_song_request(text,text,text,uuid) to anon,authenticated;

create function public.dj_evening_list()
returns table(id bigint, started_at timestamptz, ended_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_dj() then raise exception 'Not authorized'; end if;
 return query select e.id,e.started_at,e.ended_at from public.dj_evenings e order by e.id desc;
end;
$$;

create function public.dj_evening_songs(p_evening bigint)
returns table(id bigint, "position" bigint, song_title text, artist text, played boolean,
 category text, request_count bigint, guest_names text[], normalized_song text, normalized_artist text)
language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_dj() then raise exception 'Not authorized'; end if;
 return query select g.id,row_number() over(partition by g.category order by g.first_requested_at,g.id),
 g.song_title,g.artist,g.played,g.category,count(r.id),array_agg(r.guest_name order by r.created_at,r.id),
 g.normalized_song,g.normalized_artist
 from public.song_groups g join public.song_requests r on r.group_id=g.id
 where g.evening_id is not distinct from p_evening
 group by g.id order by g.first_requested_at,g.id;
end;
$$;

-- Return one JSON value so PostgREST's row limit cannot truncate the download.
create function public.dj_evening_export(p_evening bigint)
returns jsonb language sql security invoker set search_path = '' as $$
 select coalesce(jsonb_agg(to_jsonb(song) order by first_id),'[]'::jsonb)
 from (
  select (array_agg(song_title order by id))[1] as song_title,
   (array_agg(artist order by id))[1] as artist,
   (array_agg(category order by id))[1] as category,
   sum(request_count) as request_count,
   min(id) as first_id
  from public.dj_evening_songs(p_evening)
  group by coalesce(nullif(normalized_song,''),lower(song_title)),
           coalesce(nullif(normalized_artist,''),lower(artist))
 ) song;
$$;

create function public.dj_move_song(p_id bigint,p_category text)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_dj() then raise exception 'Not authorized'; end if;
 update public.song_groups set category=p_category where id=p_id;
end;
$$;

create function public.dj_end_evening(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_dj() then raise exception 'Not authorized'; end if;
 perform pg_catalog.pg_advisory_xact_lock(4839201);
 update public.dj_evenings set ended_at=clock_timestamp() where id=p_id and ended_at is null;
end;
$$;

revoke all on function public.dj_evening_list(),public.dj_evening_songs(bigint),
 public.dj_move_song(bigint,text),public.dj_end_evening(bigint),public.dj_evening_export(bigint) from public,anon;
grant execute on function public.dj_evening_list(),public.dj_evening_songs(bigint),
 public.dj_move_song(bigint,text),public.dj_end_evening(bigint),public.dj_evening_export(bigint) to authenticated;

create function public.purge_expired_dj_evenings()
returns bigint language plpgsql security definer set search_path = '' as $$
declare
 removed bigint;
begin
 perform pg_catalog.pg_advisory_xact_lock(4839201);
 delete from public.song_requests r using public.song_groups g, public.dj_evenings e
 where r.group_id=g.id and g.evening_id=e.id and e.ended_at <= now() - interval '168 hours';
 delete from public.song_groups g using public.dj_evenings e
 where g.evening_id=e.id and e.ended_at <= now() - interval '168 hours';
 delete from public.dj_evenings where ended_at <= now() - interval '168 hours';
 get diagnostics removed = row_count;
 delete from public.guest_request_limits where submitted_at <= now() - interval '30 seconds';
 return removed;
end;
$$;
revoke all on function public.purge_expired_dj_evenings() from public,anon,authenticated;
grant execute on function public.purge_expired_dj_evenings() to service_role;

commit;
