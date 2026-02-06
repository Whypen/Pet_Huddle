import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const envPath = path.resolve('Backend.env.md');
const envText = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
const getEnvFile = (key) => {
  const m = envText.match(new RegExp(`^${key}="?([^"\n]+)"?`, 'm'));
  return m ? m[1] : null;
};

const SUPABASE_URL = process.env.SUPABASE_URL || getEnvFile('VITE_SUPABASE_URL');
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || getEnvFile('SUPABASE_SERVICE_ROLE_KEY');
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const randomUserId = () => String(Math.floor(1e9 + Math.random() * 9e9));

const personas = [
  {
    label: 'free_non_verified',
    email: 'user.free25@example.com',
    password: 'TestPass!234',
    display_name: 'Mia Carter',
    dob: '1999-04-18',
    location_country: 'United Kingdom',
    location_district: 'Camden',
    tier: 'free',
    verification_status: 'pending',
    is_verified: false,
    user_role: 'user'
  },
  {
    label: 'premium_verified',
    email: 'user.premium30@example.com',
    password: 'TestPass!234',
    display_name: 'Alex Morgan',
    dob: '1995-08-12',
    location_country: 'United Kingdom',
    location_district: 'Westminster',
    tier: 'premium',
    verification_status: 'approved',
    is_verified: true,
    user_role: 'user'
  },
  {
    label: 'gold_verified',
    email: 'user.gold28@example.com',
    password: 'TestPass!234',
    display_name: 'Sophie Blake',
    dob: '1997-02-25',
    location_country: 'United Kingdom',
    location_district: 'Islington',
    tier: 'gold',
    verification_status: 'approved',
    is_verified: true,
    user_role: 'user'
  },
  {
    label: 'under16',
    email: 'user.teen15@example.com',
    password: 'TestPass!234',
    display_name: 'Jamie Reed',
    dob: '2010-06-10',
    location_country: 'United Kingdom',
    location_district: 'Hackney',
    tier: 'free',
    verification_status: 'pending',
    is_verified: false,
    user_role: 'user'
  },
  {
    label: 'nanny_verified',
    email: 'user.nanny32@example.com',
    password: 'TestPass!234',
    display_name: 'Daniel Scott',
    dob: '1992-11-03',
    location_country: 'United Kingdom',
    location_district: 'Kensington',
    tier: 'premium',
    verification_status: 'approved',
    is_verified: true,
    user_role: 'nanny'
  },
  {
    label: 'dual_role',
    email: 'user.dual29@example.com',
    password: 'TestPass!234',
    display_name: 'Olivia Hayes',
    dob: '1996-09-19',
    location_country: 'United Kingdom',
    location_district: 'Greenwich',
    tier: 'gold',
    verification_status: 'approved',
    is_verified: true,
    user_role: 'nanny'
  }
];

const pets = [
  { name: 'Luna', species: 'Cat', breed: 'British Shorthair', temperament: ['Calm','Playful'] },
  { name: 'Bolt', species: 'Dog', breed: 'Border Collie', temperament: ['Energetic','Smart'] }
];

const run = async () => {
  const results = [];
  for (const p of personas) {
    const phone = `+447700900${Math.floor(100 + Math.random() * 900)}`;
    const userId = randomUserId();
    const { data: userData, error: userErr } = await supabase.auth.admin.createUser({
      email: p.email,
      password: p.password,
      email_confirm: true,
      phone,
      phone_confirm: true,
      user_metadata: {
        display_name: p.display_name,
        legal_name: p.display_name,
        phone
      }
    });
    if (userErr) throw userErr;

    const uid = userData.user.id;
    const subscription_status = p.tier === 'free' ? 'free' : 'premium_active';

    const profile = {
      id: uid,
      display_name: p.display_name,
      legal_name: p.display_name,
      phone,
      dob: p.dob,
      location_country: p.location_country,
      location_district: p.location_district,
      location_name: `${p.location_district}, ${p.location_country}`,
      tier: p.tier,
      subscription_status,
      verification_status: p.verification_status,
      verification_comment: null,
      verification_document_url: null,
      is_verified: p.is_verified,
      user_role: p.user_role,
      user_id: userId,
      onboarding_completed: true,
      owns_pets: true,
      has_car: false,
      languages: ['English'],
      relationship_status: 'single',
      social_availability: true,
      availability_status: ['available']
    };

    const { error: profileErr } = await supabase.from('profiles').upsert(profile);
    if (profileErr) throw profileErr;

    for (const pet of pets.slice(0, 1)) {
      const { error: petErr } = await supabase.from('pets').insert({
        owner_id: uid,
        name: pet.name,
        species: pet.species,
        breed: pet.breed,
        temperament: pet.temperament || [],
        clinic_name: 'Camden Vet Clinic',
        preferred_vet: 'Dr. Patel',
        phone_no: '+447700900200',
        vaccination_dates: ['2024-10-01'],
        next_vaccination_reminder: '2026-12-01',
        neutered_spayed: true,
        is_public: true
      });
      if (petErr) throw petErr;
    }

    if (p.user_role === 'nanny') {
      await supabase.from('sitter_profiles').upsert({
        user_id: uid,
        stripe_connect_account_id: 'acct_test_' + randomUserId(),
        payouts_enabled: true,
        charges_enabled: true,
        hourly_rate: 2500
      });
    }

    results.push({ label: p.label, id: uid, email: p.email, phone, display_name: p.display_name, user_id: userId });
  }

  console.log(JSON.stringify({ created: results }, null, 2));
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
