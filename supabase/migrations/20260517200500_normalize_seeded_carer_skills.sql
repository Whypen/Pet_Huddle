update public.pet_care_profiles
set skills = (
  select array_agg(distinct mapped.skill order by mapped.skill)
  from unnest(skills) as raw(skill)
  cross join lateral (
    select case raw.skill
      when 'Emergency / Life support' then 'Medical support'
      when 'Daily Walks' then 'Professional pet-carer'
      when 'Behavioral support' then 'Behaviorist / Trainer'
      else raw.skill
    end as skill
  ) mapped
  where mapped.skill = any(array[
    'Passionate newbie',
    'Professional pet-carer',
    'Professional veterinarian',
    'Professional groomer',
    'Behaviorist / Trainer',
    'Medical support',
    'Special-needs care',
    'Rescue / Shelter volunteer',
    'Experienced foster parent',
    'Transport to vet',
    'Licensed veterinarian',
    'Certified groomer',
    'Certified behaviorist / trainer',
    'Pet first-aid / CPR certified',
    'Certified pet-carer'
  ]::text[])
)
where skills && array['Daily Walks', 'Behavioral support']::text[]
  or (
    skills @> array['Emergency / Life support']::text[]
    and story ilike '%serves nearby pet families with practical, trusted support%'
  )
  or (
    skills @> array['Emergency / Life support']::text[]
    and story ilike '%supports pet families with practical, reliable care%'
  );
