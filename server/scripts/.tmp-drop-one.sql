\pset pager off
delete from usage_events where "sourceRef" = 'chat:5671';
select count(*) as rows_left from usage_events;
