-- Taberna Flamenca / Musicrequest: mandatory guest-selected music category.
-- Apply this SQL in the existing Supabase project's SQL Editor.
-- No existing song requests, DJ accounts or categories are deleted.
-- Requires previous 20261105_dj_upgrade.sql migration.
-- New submissions are grouped only within the SAME guest-selected category.
-- The DJ may move a group afterward without altering guests or timestamps.
create or replace function public.submit_song_request_v3(
 p_guest_name text,p_song_title text,p_artist text,p_client_token text,p_category text)
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
 if p_category is null or p_category not in ('german','latino','international') or
    length(trim(coalesce(p_guest_name,''))) not between 1 and 60 or
    length(trim(coalesce(p_song_title,''))) not between 1 and 120 or
    length(trim(coalesce(p_artist,''))) not between 1 and 120 or
    p_client_token is null or p_client_token !~ '^[a-f0-9-]{36}$'
 then raise exception 'Invalid song request'; end if;
 perform pg_advisory_xact_lock(hashtext(p_client_token)::bigint);
 if exists(select 1 from public.song_requests
           where client_hash=token_hash and created_at>now()-interval '30 seconds')
 then raise exception using message='RATE_LIMIT',errcode='P0001'; end if;
 insert into public.dj_events(session_date,starts_at,ends_at)
 values(event_key,
        (event_key+time '06:00') at time zone 'Europe/Berlin',
        (event_key+1+time '06:00') at time zone 'Europe/Berlin')
 on conflict(session_date) do nothing;
 select id into selected_event from public.dj_events where session_date=event_key;
 perform pg_advisory_xact_lock(4839201);
 select id into selected_group from public.song_groups
 where event_id=selected_event
   and category=p_category
   and not played
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
         p_category)
  returning id into selected_group;
 end if;
 insert into public.song_requests(guest_name,song_title,artist,normalized_song,normalized_artist,group_id,event_id,client_hash)
 values(trim(p_guest_name),trim(p_song_title),trim(p_artist),n_song,n_artist,selected_group,selected_event,token_hash);
end;$$;

-- Remove guest access to older song-submission RPCs, so category selection cannot be bypassed.
-- Existing data and privileged DJ access remain untouched.
revoke execute on function public.submit_song_request(text,text,text) from public,anon,authenticated;
revoke execute on function public.submit_song_request_v2(text,text,text,text) from public,anon,authenticated;
revoke all on function public.submit_song_request_v3(text,text,text,text,text) from public;
grant execute on function public.submit_song_request_v3(text,text,text,text,text) to anon,authenticated;
