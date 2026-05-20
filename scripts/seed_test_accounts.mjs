/**
 * seed_test_accounts.mjs
 * Creates 10 varied test accounts against the REMOTE Supabase project.
 * Also sets admin+gold for twenty_illkid@msn.com and plus for fongpoman114@gmail.com.
 *
 * Usage: node scripts/seed_test_accounts.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://ztrbourwcnhrpmzwlrcn.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── 10 varied test accounts ────────────────────────────────────────────────
const TEST_ACCOUNTS = [
  {
    n: 1, email: "testaccount1@huddle.test", socialId: "testacc1",
    display: "Test Account 1", gender: "Female", dob: "1992-03-15",
    bio: "Dog mum based in Central. Love long walks and dog parks.",
    tier: "gold", verified: true, hasCar: true,
    location: { name: "Central, HK", district: "Central", country: "HK", lat: 22.2830, lng: 114.1587 },
    pets: [{ name: "Biscuit", species: "Dog", breed: "Golden Retriever", gender: "Male", weight: 28.5, dob: "2020-06-01", bio: "Friendly and loves fetch.", temperament: ["Friendly","Playful","Energetic"] }],
    carer: {
      story: "I've been caring for dogs my whole life. Certified in pet first aid and have experience with puppies and seniors.",
      skills: ["Pet first-aid / CPR certified", "Behaviorist / Trainer", "Passionate newbie"],
      services_offered: ["Dog Walking", "Dog Boarding", "Drop-in Visits"],
      pet_types: ["Dogs"], dog_sizes: ["Small", "Medium", "Large"],
      days: ["Mon","Tue","Wed","Thu","Fri"],
      time_blocks: ["Morning", "Afternoon"],
      emergency_readiness: true,
      min_notice_value: 24, min_notice_unit: "hours",
      location_styles: ["At your home", "At my home"],
      area_name: "Central & Sheung Wan",
      currency: "HKD", starting_price: 180,
      rates: ["HKD 180 per walk", "HKD 350 per night"],
    },
  },
  {
    n: 2, email: "testaccount2@huddle.test", socialId: "testacc2",
    display: "Test Account 2", gender: "Male", dob: "1988-11-22",
    bio: "Cat dad in Causeway Bay. Fostering since 2019.",
    tier: "plus", verified: true, hasCar: false,
    location: { name: "Causeway Bay, HK", district: "Causeway Bay", country: "HK", lat: 22.2799, lng: 114.1840 },
    pets: [
      { name: "Mochi", species: "Cat", breed: "British Shorthair", gender: "Female", weight: 4.2, dob: "2021-02-14", bio: "Loves cuddles and afternoon naps.", temperament: ["Calm","Affectionate"] },
      { name: "Dumpling", species: "Cat", breed: "Tabby", gender: "Male", weight: 5.1, dob: "2019-08-30", bio: "Curious explorer, foodie.", temperament: ["Curious","Independent"] },
    ],
    carer: {
      story: "Experienced cat carer with 3 foster cats at a time. I understand cat behaviour and provide a calm, comfortable environment.",
      skills: ["Experienced foster parent", "Medical support"],
      services_offered: ["Cat Sitting", "Drop-in Visits", "Home Visits"],
      pet_types: ["Cats"],
      days: ["Sat","Sun","Mon"],
      time_blocks: ["Morning", "Evening"],
      emergency_readiness: false,
      min_notice_value: 48, min_notice_unit: "hours",
      location_styles: ["At my home"],
      area_name: "Causeway Bay",
      currency: "HKD", starting_price: 120,
      rates: ["HKD 120 per visit", "HKD 280 per night"],
    },
  },
  {
    n: 3, email: "testaccount3@huddle.test", socialId: "testacc3",
    display: "Test Account 3", gender: "Female", dob: "1995-07-08",
    bio: "Professional dog trainer in Tsim Sha Tsui. 5 years experience.",
    tier: "gold", verified: true, hasCar: true,
    location: { name: "Tsim Sha Tsui, HK", district: "Tsim Sha Tsui", country: "HK", lat: 22.2988, lng: 114.1722 },
    pets: [
      { name: "Rocky", species: "Dog", breed: "Labrador", gender: "Male", weight: 32.0, dob: "2018-04-20", bio: "Trained therapy dog.", temperament: ["Gentle","Obedient","Loyal"] },
    ],
    carer: {
      story: "Certified dog trainer specialising in positive reinforcement. Available for obedience training, puppy classes, and behaviour correction.",
      skills: ["Behaviorist / Trainer", "Pet first-aid / CPR certified", "Passionate newbie"],
      services_offered: ["Dog Training", "Dog Walking", "Puppy Classes"],
      pet_types: ["Dogs"], dog_sizes: ["Small", "Medium", "Large", "Extra Large"],
      days: ["Mon","Tue","Wed","Thu","Fri","Sat"],
      time_blocks: ["Morning", "Afternoon", "Evening"],
      emergency_readiness: true,
      min_notice_value: 12, min_notice_unit: "hours",
      location_styles: ["At your home", "At my home", "Outdoor"],
      area_name: "Kowloon",
      currency: "HKD", starting_price: 450,
      rates: ["HKD 450 per training session", "HKD 200 per walk"],
    },
  },
  {
    n: 4, email: "testaccount4@huddle.test", socialId: "testacc4",
    display: "Test Account 4", gender: "Male", dob: "1990-01-30",
    bio: "Rabbit and small animal specialist. Mong Kok area.",
    tier: "free", verified: false, hasCar: false,
    location: { name: "Mong Kok, HK", district: "Mong Kok", country: "HK", lat: 22.3193, lng: 114.1694 },
    pets: [
      { name: "Bun Bun", species: "Rabbit", breed: "Holland Lop", gender: "Female", weight: 1.8, dob: "2022-09-05", bio: "Loves hay and veggies.", temperament: ["Gentle","Shy"] },
    ],
    carer: {
      story: "Small animal enthusiast with years of rabbit and guinea pig experience. Happy to care for exotic pets that others might not accept.",
      skills: ["Passionate newbie", "Special-needs care"],
      services_offered: ["Small Animal Sitting", "Drop-in Visits"],
      pet_types: ["Rabbits", "Others"], dog_sizes: [],
      days: ["Sat","Sun"],
      time_blocks: ["Afternoon", "Evening"],
      emergency_readiness: false,
      min_notice_value: 3, min_notice_unit: "days",
      location_styles: ["At my home"],
      area_name: "Mong Kok",
      currency: "HKD", starting_price: 80,
      rates: ["HKD 80 per visit", "HKD 200 per night"],
    },
  },
  {
    n: 5, email: "testaccount5@huddle.test", socialId: "testacc5",
    display: "Test Account 5", gender: "Female", dob: "1997-05-19",
    bio: "Vet nurse with 6 years clinical experience. Wan Chai.",
    tier: "plus", verified: true, hasCar: true,
    location: { name: "Wan Chai, HK", district: "Wan Chai", country: "HK", lat: 22.2793, lng: 114.1723 },
    pets: [
      { name: "Nala", species: "Dog", breed: "Corgi", gender: "Female", weight: 12.5, dob: "2021-11-11", bio: "Sassy and smart.", temperament: ["Energetic","Smart","Stubborn"] },
      { name: "Whiskers", species: "Cat", breed: "Persian", gender: "Male", weight: 4.8, dob: "2020-03-03", bio: "Fluffy and dramatic.", temperament: ["Calm","Affectionate","Demanding"] },
    ],
    carer: {
      story: "As a vet nurse I can administer medications, monitor health conditions, and provide post-surgery care. Your pet is in professional hands.",
      skills: ["Licensed veterinarian", "Pet first-aid / CPR certified", "Medical support", "Special-needs care"],
      proof_metadata: {
        "Licensed veterinarian": { country: "Hong Kong", clinic: "Wan Chai Animal Clinic", license: "VET-HK-5621" },
        "Pet first-aid / CPR certified": { course: "Pet CPR & First Aid", certNumber: "CPR-HK-2024-118" },
      },
      services_offered: ["Pet Sitting", "Medical Care", "Medication Administration", "Dog Walking"],
      pet_types: ["Dogs", "Cats"], dog_sizes: ["Small", "Medium"],
      days: ["Mon","Wed","Fri","Sat","Sun"],
      time_blocks: ["Morning", "Evening"],
      emergency_readiness: true,
      min_notice_value: 6, min_notice_unit: "hours",
      location_styles: ["At your home", "At my home"],
      area_name: "Wan Chai & Admiralty",
      currency: "HKD", starting_price: 220,
      rates: ["HKD 220 per visit", "HKD 400 per night", "HKD 150 per walk"],
    },
  },
  {
    n: 6, email: "testaccount6@huddle.test", socialId: "testacc6",
    display: "Test Account 6", gender: "Male", dob: "1985-09-14",
    bio: "Full-time pet sitter, Sham Shui Po. 10+ years experience.",
    tier: "gold", verified: true, hasCar: true,
    location: { name: "Sham Shui Po, HK", district: "Sham Shui Po", country: "HK", lat: 22.3310, lng: 114.1628 },
    pets: [
      { name: "Max", species: "Dog", breed: "German Shepherd", gender: "Male", weight: 35.0, dob: "2019-07-15", bio: "Protective and loyal.", temperament: ["Loyal","Alert","Intelligent"] },
      { name: "Luna", species: "Dog", breed: "Poodle", gender: "Female", weight: 8.0, dob: "2022-01-20", bio: "Playful and smart.", temperament: ["Playful","Intelligent","Friendly"] },
    ],
    carer: {
      story: "Decade-long professional pet sitter with over 200 happy clients. Specialise in multiple-dog households and large breeds.",
      skills: ["Certified pet-carer", "Certified behaviorist / trainer", "Behaviorist / Trainer", "Pet first-aid / CPR certified", "Special-needs care", "Passionate newbie"],
      proof_metadata: {
        "Certified pet-carer": { org: "HK Pet Care Guild", number: "CPC-88921" },
        "Certified behaviorist / trainer": { certNumber: "CBT-2023-552", program: "Canine Behaviour Specialist" },
      },
      services_offered: ["Dog Boarding", "Dog Walking", "Dog Day Care", "Pet Sitting"],
      pet_types: ["Dogs", "Cats"], dog_sizes: ["Small", "Medium", "Large", "Extra Large"],
      days: ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],
      time_blocks: ["Morning", "Afternoon", "Evening"],
      emergency_readiness: true,
      min_notice_value: 1, min_notice_unit: "days",
      location_styles: ["At my home", "At your home"],
      area_name: "Kowloon West",
      currency: "HKD", starting_price: 280,
      rates: ["HKD 280 per night boarding", "HKD 160 per day care", "HKD 120 per walk"],
    },
  },
  {
    n: 7, email: "testaccount7@huddle.test", socialId: "testacc7",
    display: "Test Account 7", gender: "Female", dob: "2000-12-01",
    bio: "Part-time walker and sitter, Sha Tin area. Uni student.",
    tier: "free", verified: false, hasCar: false,
    location: { name: "Sha Tin, HK", district: "Sha Tin", country: "HK", lat: 22.3833, lng: 114.1833 },
    pets: [
      { name: "Coco", species: "Dog", breed: "Shih Tzu", gender: "Female", weight: 5.5, dob: "2023-02-28", bio: "New puppy, loves everyone.", temperament: ["Friendly","Playful"] },
    ],
    carer: {
      story: "Grew up with dogs and cats. Looking to earn extra income doing what I love while studying. Reliable and caring.",
      skills: ["Passionate newbie"],
      services_offered: ["Dog Walking", "Drop-in Visits"],
      pet_types: ["Dogs", "Cats"], dog_sizes: ["Small", "Medium"],
      days: ["Tue","Thu","Sat","Sun"],
      time_blocks: ["Afternoon", "Evening"],
      emergency_readiness: false,
      min_notice_value: 24, min_notice_unit: "hours",
      location_styles: ["At your home"],
      area_name: "Sha Tin",
      currency: "HKD", starting_price: 90,
      rates: ["HKD 90 per walk", "HKD 60 per drop-in"],
    },
  },
  {
    n: 8, email: "testaccount8@huddle.test", socialId: "testacc8",
    display: "Test Account 8", gender: "Male", dob: "1993-04-27",
    bio: "Groomer and stylist, Kwun Tong. Mobile service available.",
    tier: "plus", verified: true, hasCar: true,
    location: { name: "Kwun Tong, HK", district: "Kwun Tong", country: "HK", lat: 22.3132, lng: 114.2262 },
    pets: [
      { name: "Fluffy", species: "Dog", breed: "Bichon Frise", gender: "Male", weight: 4.0, dob: "2020-10-10", bio: "Always perfectly groomed.", temperament: ["Gentle","Playful"] },
      { name: "Simba", species: "Cat", breed: "Maine Coon", gender: "Male", weight: 7.2, dob: "2019-05-05", bio: "King of the apartment.", temperament: ["Confident","Playful","Social"] },
    ],
    carer: {
      story: "Professional groomer with 7 years experience. Mobile grooming van available across Kowloon. All breeds welcome.",
      skills: ["Certified groomer", "Pet first-aid / CPR certified"],
      proof_metadata: {
        "Certified groomer": { certNumber: "GRM-HK-2024-311", school: "HK Grooming Academy" },
        "Pet first-aid / CPR certified": { course: "Pet CPR & First Aid", certNumber: "CPR-HK-2023-921" },
      },
      services_offered: ["Grooming", "Mobile Grooming", "Nail Trimming"],
      pet_types: ["Dogs", "Cats"], dog_sizes: ["Small", "Medium", "Large"],
      days: ["Mon","Tue","Wed","Thu","Fri"],
      time_blocks: ["Morning", "Afternoon"],
      emergency_readiness: false,
      min_notice_value: 2, min_notice_unit: "days",
      location_styles: ["Mobile (come to you)", "At my home"],
      area_name: "Kwun Tong & Kowloon Bay",
      currency: "HKD", starting_price: 350,
      rates: ["HKD 350 full groom (small)", "HKD 480 full groom (large)", "HKD 120 nail trim"],
    },
  },
  {
    n: 9, email: "testaccount9@huddle.test", socialId: "testacc9",
    display: "Test Account 9", gender: "Female", dob: "1991-08-16",
    bio: "Retired vet. Senior pet specialist and palliative care. Taikoo.",
    tier: "gold", verified: true, hasCar: true,
    location: { name: "Taikoo, HK", district: "Taikoo", country: "HK", lat: 22.2843, lng: 114.2163 },
    pets: [
      { name: "Grandpa", species: "Dog", breed: "Beagle", gender: "Male", weight: 11.0, dob: "2012-06-06", bio: "Senior dog, slow walks preferred.", temperament: ["Gentle","Calm","Affectionate"] },
    ],
    carer: {
      story: "30-year veterinary career, now focused on at-home senior and palliative pet care. If your pet has special medical needs, I'm your person.",
      skills: ["Pet first-aid / CPR certified", "Special-needs care", "Medical support"],
      services_offered: ["Senior Pet Care", "Medical Care", "Palliative Care", "Home Visits"],
      pet_types: ["Dogs", "Cats"], dog_sizes: ["Small", "Medium", "Large"],
      days: ["Mon","Tue","Wed","Thu","Fri"],
      time_blocks: ["Morning", "Afternoon"],
      emergency_readiness: true,
      min_notice_value: 24, min_notice_unit: "hours",
      location_styles: ["At your home"],
      area_name: "Island East",
      currency: "HKD", starting_price: 500,
      rates: ["HKD 500 per home visit", "HKD 300 per medication round"],
    },
  },
  {
    n: 10, email: "testaccount10@huddle.test", socialId: "testacc10",
    display: "Test Account 10", gender: "Male", dob: "1987-02-14",
    bio: "Dog & cat lover, weekend carer. North Point.",
    tier: "plus", verified: true, hasCar: false,
    location: { name: "North Point, HK", district: "North Point", country: "HK", lat: 22.2915, lng: 114.2007 },
    pets: [
      { name: "Oreo", species: "Dog", breed: "Dalmatian", gender: "Male", weight: 24.0, dob: "2021-03-22", bio: "Spotted and speedy.", temperament: ["Energetic","Playful","Intelligent"] },
      { name: "Miso", species: "Cat", breed: "Siamese", gender: "Female", weight: 3.5, dob: "2022-07-07", bio: "Talkative and curious.", temperament: ["Vocal","Curious","Affectionate"] },
    ],
    carer: {
      story: "Weekend carer for dogs and cats. Clean apartment, no other pets on site. Great references from neighbours.",
      skills: ["Passionate newbie", "Experienced foster parent"],
      services_offered: ["Dog Boarding", "Cat Sitting", "Drop-in Visits"],
      pet_types: ["Dogs", "Cats"], dog_sizes: ["Small", "Medium"],
      days: ["Sat","Sun"],
      time_blocks: ["All day"],
      emergency_readiness: false,
      min_notice_value: 3, min_notice_unit: "days",
      location_styles: ["At my home"],
      area_name: "North Point",
      currency: "HKD", starting_price: 200,
      rates: ["HKD 200 per night (dog)", "HKD 150 per night (cat)"],
    },
  },
];

// ── helpers ────────────────────────────────────────────────────────────────
async function listAllUsers() {
  const all = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    all.push(...(data?.users || []));
    if (!data?.users?.length || data.users.length < 1000) break;
  }
  return all;
}

async function ensureAuthUser(email, password) {
  const all = await listAllUsers();
  const existing = all.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
  if (existing) {
    console.log(`  [auth] exists: ${email} (${existing.id})`);
    return existing.id;
  }
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  console.log(`  [auth] created: ${email} (${data.user.id})`);
  return data.user.id;
}

// tier text column accepts: free | premium | gold
// effective_tier enum accepts: free | plus
function dbTier(t) { return t === "plus" ? "premium" : t; }
function dbEffectiveTier(t) { return t === "gold" ? "plus" : t === "premium" ? "plus" : t; }

async function upsertProfile(userId, acc) {
  const row = {
    id: userId,
    display_name: acc.display,
    legal_name: acc.display,
    social_id: acc.socialId,
    bio: acc.bio,
    gender_genre: acc.gender,
    dob: acc.dob,
    tier: dbTier(acc.tier),
    effective_tier: dbEffectiveTier(acc.tier),
    role: "user",
    is_verified: acc.verified,
    verification_status: acc.verified ? "verified" : "unverified",
    has_car: acc.hasCar,
    location_name: acc.location.name,
    location_district: acc.location.district,
    location_country: acc.location.country,
    last_lat: acc.location.lat,
    last_lng: acc.location.lng,
    last_active_at: new Date().toISOString(),
    pet_experience: acc.pets.map((p) => p.species.toLowerCase()),
    onboarding_completed: true,
    non_social: false,
    hide_from_map: false,
    updated_at: new Date().toISOString(),
  };
  const { error } = await admin.from("profiles").upsert(row, { onConflict: "id" });
  if (error) throw error;
  // set location via RPC (best-effort)
  try {
    await admin.rpc("set_user_location", {
      p_lat: acc.location.lat,
      p_lng: acc.location.lng,
      p_name: acc.location.name,
    });
  } catch (_) {}
  console.log(`  [profile] upserted: ${acc.display}`);
}

async function upsertPets(userId, acc) {
  for (const pet of acc.pets) {
    const petId = randomUUID();
    const row = {
      id: petId,
      owner_id: userId,
      name: pet.name,
      species: pet.species,
      breed: pet.breed,
      gender: pet.gender,
      weight: pet.weight,
      weight_unit: "kg",
      dob: pet.dob,
      bio: pet.bio,
      temperament: pet.temperament,
      is_public: true,
      is_active: true,
      neutered_spayed: true,
    };
    // check if pet already exists for this owner+name
    const { data: existing } = await admin.from("pets").select("id").eq("owner_id", userId).eq("name", pet.name).maybeSingle();
    if (existing) {
      const { error } = await admin.from("pets").update(row).eq("id", existing.id);
      if (error) throw error;
      console.log(`  [pet] updated: ${pet.name}`);
    } else {
      const { error } = await admin.from("pets").insert(row);
      if (error) throw error;
      console.log(`  [pet] created: ${pet.name}`);
    }
  }
}

async function upsertCarerProfile(userId, acc) {
  const c = acc.carer;
  const SERVICE_ALIAS_MAP = {
    "Dog Boarding": "Boarding",
    "Dog Walking": "Walking",
    "Dog Day Care": "Day Care",
    "Drop-in Visits": "Drop-in",
    "Home Visits": "Drop-in",
    "Mobile Grooming": "Grooming",
    "Nail Trimming": "Grooming",
    "Dog Training": "Training",
    "Puppy Classes": "Training",
    "Medical Care": "Vet / Licensed Care",
    "Medication Administration": "Vet / Licensed Care",
    "Senior Pet Care": "Vet / Licensed Care",
    "Palliative Care": "Vet / Licensed Care",
    "Pet Sitting": "Boarding",
    "Cat Sitting": "Boarding",
    "Small Animal Sitting": "Drop-in",
  };
  const LOCATION_ALIAS_MAP = {
    "At your home": "At owner's place",
    "At my home": "At my place",
    "Outdoor": "Meet-up / outdoor",
    "Mobile (come to you)": "At owner's place",
  };
  const normalizeService = (value) => SERVICE_ALIAS_MAP[value] || value;
  const normalizeLocation = (value) => LOCATION_ALIAS_MAP[value] || value;
  const SKILL_ALIAS_MAP = {
    "Pet First Aid": "Pet first-aid / CPR certified",
    "Pet first aid": "Pet first-aid / CPR certified",
    "Licensed veterinarian": "Licensed veterinarian",
    "Certified groomer": "Certified groomer",
    "Certified behaviorist / trainer": "Certified behaviorist / trainer",
    "Pet first-aid / CPR certified": "Pet first-aid / CPR certified",
    "Certified pet-carer": "Certified pet-carer",
    "Dog Training": "Behaviorist / Trainer",
    "Puppy Care": "Experienced foster parent",
    "Cat Behaviour": "Behaviorist / Trainer",
    "Medication Administration": "Medical support",
    "Post-Surgery Care": "Medical support",
    "Senior Pet Care": "Special-needs care",
    "Palliative Care": "Special-needs care",
    "Small Animal Care": "Special-needs care",
    "Exotic Pet Care": "Special-needs care",
    "Transport to vet": "Transport to vet",
    "Emergency / Life support": "Emergency / Life support",
  };
  const ALLOWED_SKILLS = new Set([
    "Passionate newbie",
    "Professional pet-carer",
    "Professional veterinarian",
    "Professional groomer",
    "Behaviorist / Trainer",
    "Medical support",
    "Special-needs care",
    "Rescue / Shelter volunteer",
    "Experienced foster parent",
    "Transport to vet",
    "Emergency / Life support",
    "Licensed veterinarian",
    "Certified groomer",
    "Certified behaviorist / trainer",
    "Pet first-aid / CPR certified",
    "Certified pet-carer",
  ]);
  const normalizeRateUnit = (value) => {
    const s = String(value || "").trim().toLowerCase();
    if (!s) return "visit";
    if (/session/.test(s) || /training/.test(s)) return "session";
    if (/walk/.test(s)) return "walk";
    if (/night|boarding/.test(s)) return "night";
    if (/day care|daycare|day/.test(s)) return "day";
    if (/visit|drop-?in|home|medication/.test(s)) return "visit";
    if (/groom|trim/.test(s)) return "visit";
    if (/hour/.test(s)) return "hour";
    return s.replace(/^\s*per\s+/i, "");
  };
  const detectServiceForRate = (raw, fallbackIndex) => {
    const text = String(raw || "").toLowerCase();
    const serviceOrder = normalizedServices.length > 0 ? normalizedServices : ["Others"];
    if (/groom|trim/.test(text) && serviceOrder.includes("Grooming")) return "Grooming";
    if (/walk/.test(text) && serviceOrder.includes("Walking")) return "Walking";
    if (/boarding|night/.test(text) && serviceOrder.includes("Boarding")) return "Boarding";
    if (/day\s*care|daycare/.test(text) && serviceOrder.includes("Day Care")) return "Day Care";
    if (/drop-?in|visit|home/.test(text) && serviceOrder.includes("Drop-in")) return "Drop-in";
    if (/train/.test(text) && serviceOrder.includes("Training")) return "Training";
    if (/medical|medication|vet|licensed|senior|palliative/.test(text) && serviceOrder.includes("Vet / Licensed Care")) return "Vet / Licensed Care";
    return serviceOrder[Math.min(fallbackIndex, serviceOrder.length - 1)] || "Others";
  };
  const normalizedServices = Array.from(new Set((c.services_offered || []).map(normalizeService)));
  const normalizedLocations = Array.from(new Set((c.location_styles || []).map(normalizeLocation)));
  const normalizedDays = (c.days || []).map((day) => String(day).slice(0, 3));
  const normalizedTimeBlocks = (c.time_blocks || []).map((slot) => {
    if (slot === "All day") return "Full-day";
    if (slot === "Morning" || slot === "Afternoon" || slot === "Evening") return slot;
    return slot;
  });
  const normalizedSkills = Array.from(
    new Set(
      (c.skills || [])
        .map((skill) => SKILL_ALIAS_MAP[skill] || skill)
        .filter((skill) => Boolean(skill) && ALLOWED_SKILLS.has(skill)),
    ),
  );
  const normalizedRates = (c.rates || [])
    .map((rate, index) => {
      if (typeof rate === "string") {
        const match = rate.match(/([0-9]+(?:\.[0-9]+)?)/);
        const price = match?.[1] || String(c.starting_price || "");
        const detectedService = detectServiceForRate(rate, index);
        const unit = normalizeRateUnit(rate.replace(/^.*?\bper\b/i, "").trim() || rate);
        return JSON.stringify({
          price,
          rate: unit,
          services: [detectedService],
        });
      }
      if (rate && typeof rate === "object") {
        const raw = rate;
        const services = Array.isArray(raw.services) && raw.services.length > 0
          ? raw.services.map((item) => normalizeService(String(item))).filter(Boolean)
          : [detectServiceForRate(raw.rate || "", index)];
        return JSON.stringify({
          price: String(raw.price || c.starting_price || ""),
          rate: normalizeRateUnit(raw.rate || ""),
          services,
        });
      }
      return JSON.stringify({
        price: String(c.starting_price || ""),
        rate: "visit",
        services: [detectServiceForRate("", index)],
      });
    })
    .filter(Boolean);
  const row = {
    user_id: userId,
    story: c.story,
    skills: normalizedSkills,
    proof_metadata: c.proof_metadata || {},
    services_offered: normalizedServices,
    pet_types: c.pet_types,
    dog_sizes: c.dog_sizes || [],
    days: normalizedDays,
    time_blocks: normalizedTimeBlocks,
    emergency_readiness: c.emergency_readiness,
    min_notice_value: c.min_notice_value,
    min_notice_unit: c.min_notice_unit,
    location_styles: normalizedLocations,
    area_name: c.area_name,
    currency: c.currency,
    starting_price: c.starting_price,
    rates: normalizedRates,
    completed: true,
    listed: true,
    agreement_accepted: true,
    agreement_accepted_at: new Date().toISOString(),
    agreement_version: "1.0",
  };
  const { data: existing } = await admin.from("pet_care_profiles").select("id").eq("user_id", userId).maybeSingle();
  if (existing) {
    const { error } = await admin.from("pet_care_profiles").update(row).eq("user_id", userId);
    if (error) throw error;
    console.log(`  [carer] updated: ${acc.display}`);
  } else {
    const { error } = await admin.from("pet_care_profiles").insert(row);
    if (error) throw error;
    console.log(`  [carer] created: ${acc.display}`);
  }
}

// ── main ───────────────────────────────────────────────────────────────────
async function main() {
  const PASSWORD = "TestHuddle123!";

  console.log("\n=== Seeding 10 test accounts ===\n");
  for (const acc of TEST_ACCOUNTS) {
    console.log(`\n[${acc.n}/10] ${acc.display} (${acc.email})`);
    try {
      const userId = await ensureAuthUser(acc.email, PASSWORD);
      await upsertProfile(userId, acc);
      await upsertPets(userId, acc);
      await upsertCarerProfile(userId, acc);
      console.log(`  ✓ Done`);
    } catch (err) {
      console.error(`  ✗ Failed: ${err?.message || err}`);
    }
  }

  console.log("\n=== Setting admin + gold for twenty_illkid@msn.com ===");
  try {
    const all = await listAllUsers();
    const adminUser = all.find((u) => (u.email || "").toLowerCase() === "twenty_illkid@msn.com");
    if (!adminUser) {
      console.error("  ✗ User twenty_illkid@msn.com not found in auth");
    } else {
      const { error } = await admin.from("profiles").update({
        role: "admin",
        tier: "gold",
        effective_tier: "plus",
        is_verified: true,
        verification_status: "verified",
        updated_at: new Date().toISOString(),
      }).eq("id", adminUser.id);
      if (error) throw error;
      console.log(`  ✓ twenty_illkid@msn.com → admin + gold`);
    }
  } catch (err) {
    console.error(`  ✗ Failed: ${err?.message || err}`);
  }

  console.log("\n=== Setting plus for fongpoman114@gmail.com ===");
  try {
    const all = await listAllUsers();
    const plusUser = all.find((u) => (u.email || "").toLowerCase() === "fongpoman114@gmail.com");
    if (!plusUser) {
      console.error("  ✗ User fongpoman114@gmail.com not found in auth");
    } else {
      const { error } = await admin.from("profiles").update({
        tier: "premium",
        effective_tier: "plus",
        updated_at: new Date().toISOString(),
      }).eq("id", plusUser.id);
      if (error) throw error;
      console.log(`  ✓ fongpoman114@gmail.com → plus`);
    }
  } catch (err) {
    console.error(`  ✗ Failed: ${err?.message || err}`);
  }

  console.log("\n=== Done ===\n");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
