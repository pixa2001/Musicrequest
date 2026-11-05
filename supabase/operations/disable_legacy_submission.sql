-- Run only after the new guest page is live and submissions have been verified.
-- Older cached pages must be reloaded after this cutover.
revoke execute on function public.submit_song_request(text,text,text) from public,anon,authenticated;
