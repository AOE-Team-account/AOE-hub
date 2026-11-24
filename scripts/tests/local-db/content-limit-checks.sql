\set ON_ERROR_STOP 0
insert into auth.users (id, email, raw_user_meta_data) values ('22222222-2222-4222-8222-222222222222','b@example.com','{"name":"Bob","age_attested_min":13,"accepted_terms":true}') on conflict do nothing;
set role service_role; select set_config('request.jwt.claims','{"role":"service_role"}',false);
\echo [svc] create_file_post (expect a row):
select title from public.create_file_post('22222222-2222-4222-8222-222222222222','T','D','curriculum','document','original',null,false);
reset role;
set role authenticated; select set_config('request.jwt.claims','{"role":"authenticated","sub":"22222222-2222-4222-8222-222222222222"}',false);
\echo [member] direct file_posts insert (expect permission denied):
insert into public.file_posts (author_id,title,description,section,media_type,authorship) values ('22222222-2222-4222-8222-222222222222','x','y','curriculum','document','original');
\echo [member] direct delete of file post (expect permission denied):
delete from public.file_posts;
\echo [member] 200 KB experience post (expect check violation):
insert into public.experience_posts (author_id, category, title, body) values ('22222222-2222-4222-8222-222222222222','reflections','t', repeat('a',200000));
\echo [member] 25 comments burst (expect error after 20):
do $$ declare p uuid; begin
  insert into public.experience_posts (author_id, category, title, body) values ('22222222-2222-4222-8222-222222222222','reflections','t','hello') returning id into p;
  for i in 1..25 loop insert into public.comments (parent_type,parent_id,author_id,type,body) values ('experience-post',p,'22222222-2222-4222-8222-222222222222','sharing','c'||i); end loop;
end $$;
\echo [member] create_file_post (expect permission denied):
select * from public.create_file_post('22222222-2222-4222-8222-222222222222','T','D','curriculum','document','original',null,false);
reset role;
