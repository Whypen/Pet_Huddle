#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const repoRoot = process.cwd();

const parseEnvFile = (filepath) => {
  if (!fs.existsSync(filepath)) return {};
  const raw = fs.readFileSync(filepath, "utf8");
  const out = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
};

const env = {
  ...parseEnvFile(path.join(repoRoot, "Backend.env.md")),
  ...parseEnvFile(path.join(repoRoot, ".env")),
  ...parseEnvFile(path.join(repoRoot, "Backend.env.local.md")),
};

const SUPABASE_URL = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || "https://ztrbourwcnhrpmzwlrcn.supabase.co").trim();
const SERVICE_ROLE_KEY = (env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY || "").trim();

if (!SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY / SERVICE_ROLE_KEY");
}

const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const REGION_DATA = {
  SF: {
    country: "United States",
    areas: [
      { district: "Downtown San Francisco", lat: 37.785, lng: -122.406 },
      { district: "SoMa", lat: 37.778, lng: -122.413 },
      { district: "Financial District", lat: 37.794, lng: -122.401 },
      { district: "Mission Bay", lat: 37.769, lng: -122.393 },
      { district: "North Beach", lat: 37.806, lng: -122.41 },
      { district: "Nob Hill", lat: 37.793, lng: -122.414 },
      { district: "Civic Center", lat: 37.779, lng: -122.419 },
      { district: "Yerba Buena", lat: 37.785, lng: -122.4 },
      { district: "South Beach", lat: 37.785, lng: -122.397 },
      { district: "Hayes Valley", lat: 37.775, lng: -122.425 },
    ],
  },
  HK: {
    country: "Hong Kong",
    areas: [
      { district: "Central", lat: 22.2819, lng: 114.1589 },
      { district: "Sheung Wan", lat: 22.2867, lng: 114.1454 },
      { district: "Sai Ying Pun", lat: 22.2864, lng: 114.1405 },
      { district: "Admiralty", lat: 22.2776, lng: 114.1652 },
      { district: "Wan Chai", lat: 22.2806, lng: 114.1733 },
      { district: "Causeway Bay", lat: 22.2805, lng: 114.1827 },
      { district: "North Point", lat: 22.2908, lng: 114.1954 },
      { district: "Quarry Bay", lat: 22.2844, lng: 114.2165 },
      { district: "Kennedy Town", lat: 22.2811, lng: 114.1284 },
      { district: "Mid-Levels", lat: 22.2765, lng: 114.1451 },
    ],
  },
};

const FIRST_NAMES = [
  "Ava", "Noah", "Isabel", "Miles", "Sophia", "Leo", "Maya", "Ethan", "Liam", "Nora",
  "Kai", "Juniper", "Ella", "Owen", "Mila", "Caleb", "Ruby", "Hugo", "Iris", "Daniel",
  "Elena", "Mateo", "Tessa", "Noah", "Maddox", "Freya", "Kai", "Willa", "Aria", "Jasper",
  "Layla", "Simon", "Gia", "Ivy", "Noel", "Soren", "Clara", "Felix", "Nico", "Daisy",
];

const LAST_NAMES = [
  "Chen", "Park", "Lopez", "Sato", "Ramirez", "Nguyen", "Martinez", "Kovacs", "Reed", "Singh",
  "Foster", "Wong", "Tan", "Keller", "Orr", "Foster", "Brooks", "Yamamoto", "Ross", "Vega",
  "Kim", "Costa", "Bennett", "Hsu", "Almeida", "Griffin", "Lin", "Sato", "Fleming", "Meyer",
  "Rossi", "Khan", "Santos", "Nakamura", "Diaz", "O'Neill", "Miller", "Lau", "Mori", "Stone",
];

const PROVIDER_IDX = new Set([
  2, 4, 6, 8, 10, 12, 14, 16, 18, 20,
  22, 24, 26, 28, 30, 32, 34, 36, 38, 40,
]);

const GENDER = ["Female", "Male", "Non-binary", "Female", "Male", "Female", "Male", "Non-binary", "Female", "Male"];
const PET_BREEDS = ["Beagle", "Bengal", "Shiba Inu", "Domestic Shorthair", "Cockatiel", "Tabby", "Golden Retriever", "Persian"];

const inviteEmails = [
  "fongpoman114@gmail.com",
  "twenty_illkid@msn.com",
  "huddle.pet@icloud.com",
];

const seedRows = Array.from({ length: 40 }, (_, i) => {
  const n = i + 1;
  const isSF = n <= 20;
  const region = isSF ? "SF" : "HK";
  const offset = isSF ? n - 1 : n - 21;
  const area = REGION_DATA[region].areas[Math.floor(offset / 2)];
  const jitter = (n % 2 === 0 ? -0.0023 : 0.0021) * ((offset % 2) + 1);
  const isProvider = PROVIDER_IDX.has(n);
  return {
    n,
    email: `testaccount${n}@huddle.test`,
    password: `Huddletest${String(n).padStart(2, "0")}*`,
    socialId: `${isSF ? "sf" : "hk"}acct${String(isSF ? n : n - 20).padStart(2, "0")}pet`,
    firstName: FIRST_NAMES[i % FIRST_NAMES.length],
    lastName: LAST_NAMES[i % LAST_NAMES.length],
    region,
    country: REGION_DATA[region].country,
    district: area.district,
    lat: Number((area.lat + jitter / 500).toFixed(6)),
    lng: Number((area.lng + jitter / 600).toFixed(6)),
    isProvider,
    gender: GENDER[i % GENDER.length],
    pet: {
      name: `${region === "SF" ? "Poppy" : "Whisk"}${n}`,
      species: n % 2 ? "Dog" : "Cat",
      breed: PET_BREEDS[i % PET_BREEDS.length],
      weight: isSF ? 6 + (n % 9) : 3.8 + (n % 5) * 0.4,
      weightUnit: "kg",
      temperament: ["friendly", "curious", "energetic"].slice(0, (n % 3) + 1),
      bio: "Loves social walks, local pet meetups and easy neighborhood playdates.",
      dob: `${1985 + (n % 12)}-${String((n % 12) + 1).padStart(2, "0")}-${String((n % 27) + 1).padStart(2, "0")}`,
      hasCar: isProvider && n % 2 === 0,
    },
    profile: {
      hasCar: isProvider && n % 2 === 0,
      tier: isProvider ? "premium" : "premium",
      effectiveTier: isProvider && n % 3 === 0 ? "gold" : "plus",
      isVerified: isProvider ? true : n % 3 === 0,
      bio:
        region === "SF"
          ? "Early-morning dog person based in San Francisco who enjoys nearby parks and pet-safe cafés."
          : "Pet parent based in Hong Kong who enjoys regular walks and community care circles.",
    },
  };
});

const avatarForSeed = (socialId) => `https://api.dicebear.com/9.x/notionists/png?seed=${encodeURIComponent(socialId)}`;
const pick = (arr, idx) => arr[idx % arr.length];

const all = async () => {
  const allUsers = [];
  for (let page = 1; page < 50; page += 1) {
    const res = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (res.error) throw res.error;
    allUsers.push(...res.data.users);
    if (!res.data.users?.length || res.data.users.length < 1000) break;
  }
  return allUsers;
};

const findAuth = async (email) => {
  const users = await all();
  return users.find((u) => (u.email || "").toLowerCase() === email.toLowerCase()) || null;
};

const ensureUser = async (email, password) => {
  const existing = await findAuth(email);
  if (existing) {
    const update = await client.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    });
    if (update.error) throw update.error;
    return existing.id;
  }

  const created = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  return created.data.user.id;
};

const profileFor = (row) => {
  const name = `${row.firstName} ${row.lastName}`;
  const avatar = avatarForSeed(row.socialId);
  return {
    id: row.id,
    display_name: name,
    legal_name: name,
    social_id: row.socialId,
    bio: row.profile.bio,
    gender_genre: row.gender,
    dob: row.pet.dob,
    tier: row.profile.tier,
    effective_tier: row.profile.effectiveTier,
    role: "user",
    is_verified: row.profile.isVerified,
    verification_status: row.profile.isVerified ? "verified" : "pending",
    verified: row.profile.isVerified,
    has_car: row.pet.hasCar,
    onboarding_completed: true,
    location_name: `${row.district}, ${row.country}`,
    location_country: row.country,
    location_district: row.district,
    last_lat: row.lat,
    last_lng: row.lng,
    map_visible: true,
    hide_from_map: false,
    last_active_at: new Date().toISOString(),
    pet_experience: row.pet.species === "Dog" ? ["Dogs"] : ["Cats"],
    avatar_url: avatar,
    social_album: [avatar],
  };
};

const petsFor = (row) => {
  const name = row.pet.name;
  const petRows = [
    {
      owner_id: row.id,
      name,
      species: row.pet.species,
      breed: row.pet.breed,
      gender: row.n % 2 ? "Female" : "Male",
      weight: Number(row.pet.weight.toFixed(2)),
      weight_unit: "kg",
      dob: "2020-04-12",
      temperament: row.pet.temperament,
      bio: row.pet.bio,
      is_public: true,
      is_active: true,
      neutered_spayed: true,
    },
  ];
  if (row.n % 5 === 0) {
    petRows.push({
      owner_id: row.id,
      name: `${name} Jr`,
      species: "Bird",
      breed: "Parakeet",
      gender: "Female",
      weight: 0.2,
      weight_unit: "kg",
      dob: "2021-07-17",
      temperament: ["playful", "social"],
      bio: "Small companion with a happy temperament.",
      is_public: true,
      is_active: true,
      neutered_spayed: false,
    });
  }
  return petRows;
};

const carerFor = (row) => ({
  user_id: row.id,
  story: `${row.firstName} supports pet families with practical, reliable care in ${row.district}.`,
  skills: ["Professional pet-carer", "Medical support", "Behaviorist / Trainer", "Passionate newbie"].slice(0, (row.n % 4) + 1),
  proof_metadata: {},
  services_offered: ["Walking", "Boarding", "Drop-in Visits", "Cat Sitting"].slice(0, (row.n % 4) + 1),
  services_other: null,
  pet_types: ["Dogs", "Cats"],
  dog_sizes: ["Small", "Medium", "Large"],
  days: ["Mon", "Wed", "Fri", "Sat"],
  time_blocks: ["Morning", "Evening"],
  emergency_readiness: row.n % 2 === 0,
  min_notice_value: row.n % 2 === 0 ? 12 : 24,
  min_notice_unit: "hours",
  location_styles: ["At your home", "At my home", "Meet-up / outdoor"],
  specify_area: false,
  area_name: row.district,
  area_lat: row.lat,
  area_lng: row.lng,
  completed: true,
  listing_active: true,
  currency: row.region === "SF" ? "USD" : "HKD",
  rates: [
    JSON.stringify({
      price: row.region === "SF" ? 28 : 260,
      rate: "walk",
      services: ["Walking"],
    }),
    JSON.stringify({
      price: row.region === "SF" ? 110 : 950,
      rate: "drop-in visit",
      services: ["Drop-in Visits"],
    }),
  ],
  listed: true,
  agreement_accepted: true,
  agreement_accepted_at: new Date().toISOString(),
  agreement_version: "1.0",
});

const pickThreads = (seeded) => {
  const sf = seeded.filter((u) => u.region === "SF");
  const hk = seeded.filter((u) => u.region === "HK");
  return [
    {
      title: "Quiet Sunday park walks in the Financial District",
      content:
        "Finding safe, off-peak walk windows and dog-friendly cafés for first-time meetings in SF.",
      userId: pick(sf, 0).id,
      tags: ["walk", "park", "sf"],
      image: "https://images.unsplash.com/photo-1552053831-71594a27632d?w=900",
    },
    {
      title: "Found a calm dog sitter near SoMa?",
      content:
        "Looking for a dependable sitter with good communication habits for a calm rescue hound.",
      userId: pick(sf, 1).id,
      tags: ["sitter", "pet-care", "soma"],
      image: "https://images.unsplash.com/photo-1450778869180-41d0601e046e?w=900",
    },
    {
      title: "Rainy-day cat enrichment ideas",
      content:
        "Sharing rotating crate and puzzle ideas that keep senior cats confident and occupied indoors.",
      userId: pick(hk, 0).id,
      tags: ["cat", "enrichment", "hk"],
      image: "https://images.unsplash.com/photo-1517849845537-4d257902454a?w=900",
    },
    {
      title: "Nob Hill to Mission Bay: best leash-friendly route?",
      content:
        "I’d love recommendations for low-traffic sidewalks and pet water spots along this corridor.",
      userId: pick(sf, 2).id,
      tags: ["route", "local"],
      image: "https://images.unsplash.com/photo-1581888227599-779811b57ea9?w=900",
    },
    {
      title: "Central Hong Kong meetups: paws, training and coffee",
      content:
        "Looking for a small group for weekend puppy socialization and practical training support.",
      userId: pick(hk, 1).id,
      tags: ["community", "training", "hk"],
      image: "https://images.unsplash.com/photo-1517849845537-4d257902454a?w=900",
    },
    {
      title: "Who has trusted mobile grooming in Quarry Bay?",
      content:
        "Need a reliable on-site groomer for a short-haired hound with sensitive paws.",
      userId: pick(hk, 2).id,
      tags: ["grooming", "trust"],
      image: "https://images.unsplash.com/photo-1517849845537-4d257902454a?w=900",
    },
  ];
};

const createAlertRows = (seeded) => {
  const sf = seeded.filter((u) => u.region === "SF");
  const hk = seeded.filter((u) => u.region === "HK");
  const rows = [];
  sf.forEach((acc, index) => {
    rows.push({
      type: index % 3 === 0 ? "Stray" : index % 3 === 1 ? "Lost" : "Others",
      title: `SF Map Alert ${index + 1}`,
      description: `Local alert near ${acc.district} for a mixed-breed companion needing a calm walk plan.`,
      creator_id: acc.id,
      latitude: acc.lat + 0.001,
      longitude: acc.lng - 0.001,
      alert_type: index % 3 === 0 ? "Stray" : index % 3 === 1 ? "Lost" : "Found",
      duration_hours: 12,
      range_km: 3.5,
      media_urls: [],
      range_meters: 1200,
      is_active: true,
      location_district: acc.district,
      location_street: `${acc.district} side streets`,
      address: `${acc.district}, ${acc.country}`,
      post_on_social: false,
      post_on_threads: false,
      is_sensitive: false,
    });
  });
  hk.forEach((acc, index) => {
    rows.push({
      type: index % 3 === 0 ? "Stray" : index % 3 === 1 ? "Lost" : "Others",
      title: `HK Map Alert ${index + 1}`,
      description: `Local community alert in ${acc.district} for a nearby pet sitters-only coordination spot.`,
      creator_id: acc.id,
      latitude: acc.lat + 0.001,
      longitude: acc.lng - 0.001,
      alert_type: index % 3 === 0 ? "Stray" : index % 3 === 1 ? "Found" : "Lost",
      duration_hours: 10,
      range_km: 2.8,
      media_urls: [],
      range_meters: 900,
      is_active: true,
      location_district: acc.district,
      location_street: `${acc.district} waterfront`,
      address: `${acc.district}, ${acc.country}`,
      post_on_social: false,
      post_on_threads: false,
      is_sensitive: false,
    });
  });
  return rows;
};

const createBroadcastRows = (seeded) => {
  const sf = seeded.filter((u) => u.region === "SF");
  const hk = seeded.filter((u) => u.region === "HK");
  const rows = [];
  sf.forEach((acc, index) => {
    rows.push({
      creator_id: acc.id,
      type: "Caution",
      title: `SF Broadcast Caution ${index + 1}`,
      description: `Road crossing caution route tip for pet walkers near ${acc.district}.`,
      latitude: acc.lat - 0.0011,
      longitude: acc.lng + 0.0011,
      duration_hours: 24,
      range_km: 4,
      address: `${acc.district}, ${acc.country}`,
      post_on_threads: false,
      is_sensitive: false,
      images: [],
    });
  });
  hk.forEach((acc, index) => {
    rows.push({
      creator_id: acc.id,
      type: index % 2 === 0 ? "Lost" : "Stray",
      title: `HK Broadcast Caution ${index + 1}`,
      description: `Local alert for safe pet routes in ${acc.district}.`,
      latitude: acc.lat - 0.0011,
      longitude: acc.lng + 0.0011,
      duration_hours: 18,
      range_km: 3,
      address: `${acc.district}, ${acc.country}`,
      post_on_threads: false,
      is_sensitive: false,
      images: [],
    });
  });
  return rows;
};

const groupDefinitions = [
  { name: "[UAT] SF Downtown Open Hounds", country: "United States", area: "Downtown San Francisco", type: "open", join: "instant", code: null, districtIndex: 0, theme: ["Dog", "Leash"] },
  { name: "[UAT] SF Mission Bay Dog Social", country: "United States", area: "Mission Bay", type: "open", join: "instant", code: null, districtIndex: 3, theme: ["Dog", "Walk"] },
  { name: "[UAT] SF SF by Code", country: "United States", area: "Civic Center", type: "join-code", join: "request", code: "123456", districtIndex: 6, theme: ["Social", "Meetups"] },
  { name: "[UAT] SF Request Group", country: "United States", area: "Hayes Valley", type: "request", join: "request", code: null, districtIndex: 9, theme: ["Pet Parents"] },
  { name: "[UAT] SF Invite Circle", country: "United States", area: "South Beach", type: "invited", join: "request", code: null, districtIndex: 8, theme: ["Care Circle"] },
  { name: "[UAT] HK Open Central Club", country: "Hong Kong", area: "Central", type: "open", join: "instant", code: null, districtIndex: 0, theme: ["Cat", "Rescue"] },
  { name: "[UAT] HK Mid-level Paws", country: "Hong Kong", area: "Mid-Levels", type: "open", join: "instant", code: null, districtIndex: 9, theme: ["Paws", "Routine"] },
  { name: "[UAT] HK By Code Community", country: "Hong Kong", area: "Wan Chai", type: "join-code", join: "request", code: "123456", districtIndex: 4, theme: ["Group", "Care"] },
  { name: "[UAT] HK Request Group", country: "Hong Kong", area: "Sheung Wan", type: "request", join: "request", code: null, districtIndex: 1, theme: ["City Walk"] },
  { name: "[UAT] HK Invite Circle", country: "Hong Kong", area: "Kennedy Town", type: "invited", join: "request", code: null, districtIndex: 8, theme: ["Owner Circle"] },
];

const resolveInviteUserIds = async () => {
  const users = await all();
  const map = {};
  users.forEach((u) => {
    if (u.email) map[u.email.toLowerCase()] = u.id;
  });
  return Object.fromEntries(
    inviteEmails.map((email) => [email, map[email.toLowerCase()] || null]),
  );
};

const getCurrentUatGroupIds = async () => {
  const existing = await client.from("chats").select("id").like("name", "[UAT]%").is("type", "group");
  if (existing.error) throw existing.error;
  return (existing.data || []).map((row) => row.id);
}

(async () => {
  const started = new Date().toISOString();
  console.log(`[STARTED ${started}]`);

  console.log("1) Preparing seed user list");
  const rows = seedRows.map((r) => ({ ...r, displayName: `${r.firstName} ${r.lastName}` }));

  console.log("2) Creating / updating auth users");
  for (const row of rows) {
    row.id = await ensureUser(row.email, row.password);
  }

  const seededIds = rows.map((r) => r.id);
  const inviteMap = await resolveInviteUserIds();
  const inviteIds = inviteEmails.map((email) => inviteMap[email]).filter(Boolean);

  console.log("3) Writing profiles");
  for (const row of rows) {
    const upserted = await client.from("profiles").upsert(profileFor(row), { onConflict: "id" });
    if (upserted.error) throw upserted.error;
  }

  console.log("4) Seeding pets and provider profiles");
  for (const row of rows) {
    const ownerPets = petsFor(row);
    await client.from("pets").delete().eq("owner_id", row.id);
    const insertedPets = await client.from("pets").insert(ownerPets);
    if (insertedPets.error) throw insertedPets.error;

    const provider = carerFor(row);
    if (row.isProvider) {
      const upsertCarer = await client
        .from("pet_care_profiles")
        .upsert(provider, { onConflict: "user_id" });
      if (upsertCarer.error) throw upsertCarer.error;
    }
  }

  console.log("5) Cleaning prior UAT app data");
  await client.from("social_feed_events").delete().like("metadata", "%\"thread_id%"); // placeholder-safe cleanup for prior runs
  await client.from("thread_supports").delete().in("thread_id", (await client.from("threads").select("id").like("title", "[UAT]%").then((r) => (r.data || []).map((x) => x.id)));
  await client.from("thread_comments").delete().in("thread_id", (await client.from("threads").select("id").like("title", "[UAT]%").then((r) => (r.data || []).map((x) => x.id)));
  await client.from("social_feed_events").delete().in("thread_id", (await client.from("threads").select("id").like("title", "[UAT]%").then((r) => (r.data || []).map((x) => x.id)));
  await client.from("threads").delete().like("title", "[UAT] %");
  await client.from("broadcast_alerts").delete().like("title", "[UAT] %");
  await client.from("map_alerts").delete().like("title", "[UAT] %");
  await client.from("pins").delete().in("user_id", seededIds);
  await client.from("chats").delete().like("name", "[UAT] %");

  console.log("6) Inserting map pins");
  const pins = rows.map((r) => ({
    user_id: r.id,
    lat: r.lat,
    lng: r.lng,
    is_public: true,
    is_invisible: false,
    address: `${r.district}, ${r.country}`,
    thread_id: null,
  }));
  const pinInsert = await client.from("pins").insert(pins);
  if (pinInsert.error) throw pinInsert.error;

  console.log("7) Inserting map and broadcast alerts");
  const mapAlerts = createAlertRows(rows).map((a) => ({ ...a, expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() }));
  const broadcast = createBroadcastRows(rows).map((a) => ({ ...a, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() }));
  const insMap = await client.from("map_alerts").insert(mapAlerts);
  if (insMap.error) throw insMap.error;
  const insBroadcast = await client.from("broadcast_alerts").insert(broadcast);
  if (insBroadcast.error) throw insBroadcast.error;

  console.log("8) Inserting social threads + comments + support + feed events");
  const threadPlans = pickThreads(rows);
  const insertedThreadsResp = await client
    .from("threads")
    .insert(
      threadPlans.map((thread) => ({
        user_id: thread.userId,
        title: `[UAT] ${thread.title}`,
        content: thread.content,
        images: [thread.image],
        is_public: true,
        is_sensitive: false,
        tags: thread.tags,
        hashtags: ["uat", thread.tags[0]],
      })),
      { returning: "representation" },
    );
  if (insertedThreadsResp.error) throw insertedThreadsResp.error;
  const createdThreads = insertedThreadsResp.data || [];

  const commentRows = [];
  const supportRows = [];
  const feedEventRows = [];
  const sfPool = rows.filter((u) => u.region === "SF");
  const hkPool = rows.filter((u) => u.region === "HK");

  for (const [idx, thread] of createdThreads.entries()) {
    const commenter = (idx % 2 === 0 ? hkPool : sfPool)[idx % 10];
    commentRows.push({
      thread_id: thread.id,
      user_id: commenter.id,
      text: `Great tip — I’m meeting this route on Thursday and this helps a lot, thanks.`,
      images: [],
    });
    if (idx % 2 === 1) {
      const second = (idx % 2 === 0 ? sfPool : hkPool)[(idx + 3) % 10];
      commentRows.push({
        thread_id: thread.id,
        user_id: second.id,
        text: "Love this community energy for pet parents.",
        images: [],
      });
    }
    supportRows.push({
      thread_id: thread.id,
      user_id: sfPool[idx % sfPool.length].id,
    });
    if (idx % 2 === 0) {
      supportRows.push({
        thread_id: thread.id,
        user_id: hkPool[idx % hkPool.length].id,
      });
    }
    const viewer = commenter.id;
    feedEventRows.push({
      viewer_id: viewer,
      thread_id: thread.id,
      author_id: thread.user_id,
      event_type: "impression",
      metadata: { source: "uat-seed", when: "bootstrap" },
    });
    feedEventRows.push({
      viewer_id: viewer,
      thread_id: thread.id,
      author_id: thread.user_id,
      event_type: "comment",
      metadata: { source: "uat-seed", kind: "reply" },
    });
  }

  const cInsert = await client.from("thread_comments").insert(commentRows);
  if (cInsert.error) throw cInsert.error;
  const sInsert = await client.from("thread_supports").insert(supportRows);
  if (sInsert.error) throw sInsert.error;
  const eInsert = await client.from("social_feed_events").insert(feedEventRows);
  if (eInsert.error) throw eInsert.error;

  console.log("9) Creating UAT groups");
  const sfMembers = rows.filter((r) => r.region === "SF");
  const hkMembers = rows.filter((r) => r.region === "HK");

  for (const def of groupDefinitions) {
    const isSF = def.country === "United States";
    const pool = isSF ? sfMembers : hkMembers;
    const location = REGION_DATA[isSF ? "SF" : "HK"].areas[def.districtIndex];
    const creator = pool[0];
    const chatCreate = await client.from("chats").insert({
      type: "group",
      name: def.name,
      created_by: creator.id,
      location_label: def.area,
      location_country: def.country,
      visibility: def.type === "open" ? "public" : "private",
      join_method: def.join,
      room_code: def.code,
      avatar_url: avatarForSeed(`${def.name.toLowerCase().replace(/[^a-z0-9]/g, "")}`),
      pet_focus: def.theme,
      description: `UAT ${def.type} group in ${def.area} with realistic member flow.`,
    }, { returning: "representation" });
    if (chatCreate.error) throw chatCreate.error;
    const chat = chatCreate.data[0];

    const memberCount = def.type === "request" ? 2 : 6;
    const members = [creator, ...pool.slice(1, memberCount)];
    const roomRows = members.map((member, idx) => ({
      chat_id: chat.id,
      user_id: member.id,
      role: idx === 0 ? "admin" : "member",
    }));
    const pRows = members.map((member, idx) => ({
      chat_id: chat.id,
      user_id: member.id,
      role: idx === 0 ? "admin" : "member",
    }));
    const rInsert = await client.from("chat_room_members").upsert(roomRows, { onConflict: "chat_id,user_id" });
    if (rInsert.error) throw rInsert.error;
    const pInsert = await client.from("chat_participants").upsert(pRows, { onConflict: "chat_id,user_id" });
    if (pInsert.error) throw pInsert.error;

    if (def.type === "invited") {
      const inviteRows = inviteIds.map((uid) => ({
        chat_id: chat.id,
        inviter_user_id: creator.id,
        invitee_user_id: uid,
        status: "pending",
        chat_name: def.name,
      }));
      const invInsert = await client.from("group_chat_invites").upsert(inviteRows, { onConflict: "chat_id,invitee_user_id" });
      if (invInsert.error) throw invInsert.error;
    }
    if (def.type === "request") {
      const requestRows = pool.slice(1, 4).map((member) => ({
        chat_id: chat.id,
        user_id: member.id,
        status: "pending",
      }));
      const reqInsert = await client.from("group_join_requests").upsert(requestRows, { onConflict: "chat_id,user_id" });
      if (reqInsert.error) throw reqInsert.error;
    }
  }

  console.log("10) Producing verification counts");
  const counts = await client.rpc("pg_get_functiondef", { a: "1" }).then(() => null).catch(() => null); // no-op

  const checks = await Promise.all([
    client.from("profiles").select("id", { count: "exact", head: true }).or(`email.ilike.testaccount1@huddle.test`),
    client.from("pets").select("id", { count: "exact", head: true }),
    client.from("pet_care_profiles").select("id", { count: "exact", head: true }),
    client.from("threads").select("id", { count: "exact", head: true }).like("title", "[UAT] %"),
    client.from("pins").select("id", { count: "exact", head: true }),
    client.from("map_alerts").select("id", { count: "exact", head: true }).like("title", "[UAT] %"),
    client.from("broadcast_alerts").select("id", { count: "exact", head: true }).like("title", "[UAT] %"),
    client.from("chats").select("id", { count: "exact", head: true }).like("name", "[UAT] %"),
    client.from("group_chat_invites").select("id", { count: "exact", head: true }),
    client.from("group_join_requests").select("id", { count: "exact", head: true }),
    client.from("matches").select("id", { count: "exact", head: true }),
    client.from("waves").select("id", { count: "exact", head: true }),
    client.from("social_interactions").select("id", { count: "exact", head: true }),
  ]);

  console.log("SEED_OK");
  console.log("ACCOUNTS=", rows.length);
  console.log("PROVIDER_ACCOUNTS=", rows.filter((r) => r.isProvider).length);
  console.log("CHECKS_STARTED");
  console.log(JSON.stringify(checks.map((c) => c.count || null)));
})().catch((err) => {
  console.error("Seed failed:", err?.message || err);
  process.exit(1);
});
