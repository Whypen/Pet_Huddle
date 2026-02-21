begin;

update public.profiles
set tier = 'plus'
where tier = 'premium';

update public.profiles
set effective_tier = 'plus'
where effective_tier = 'premium';

commit;
