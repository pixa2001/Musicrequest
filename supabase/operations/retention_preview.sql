-- Read-only preview of the evenings eligible for the next cleanup.
select e.id, e.started_at, e.ended_at, count(distinct g.id) as song_groups, count(r.id) as requests
from public.dj_evenings e
left join public.song_groups g on g.evening_id=e.id
left join public.song_requests r on r.group_id=g.id
where e.ended_at <= now() - interval '168 hours'
group by e.id
order by e.ended_at;
