#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to run dev seed in production (NODE_ENV=production).");
  process.exit(1);
}

const parseDotEnv = (filepath) => {
  if (!fs.existsSync(filepath)) return;
  const raw = fs.readFileSync(filepath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
};

parseDotEnv(path.join(repoRoot, ".env"));
parseDotEnv(path.join(repoRoot, ".env.local"));
parseDotEnv(path.join(repoRoot, "supabase/functions/.env"));
parseDotEnv(path.join(repoRoot, "Backend.env.md"));
parseDotEnv(path.join(repoRoot, "Backend.env.local.md"));

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
const SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || "").trim();
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SERVICE_ROLE_KEY env for dev seeding.");
  process.exit(1);
}

const countArg = process.argv.find((arg) => arg.startsWith("--count="));
const count = countArg ? Number(countArg.split("=")[1]) : Number(process.argv[process.argv.indexOf("--count") + 1] || 50);
const seedCount = Number.isFinite(count) && count > 0 ? Math.min(count, 200) : 50;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const names = [
  "Alex", "Jordan", "Taylor", "Riley", "Cameron", "Drew", "Morgan", "Avery", "Casey", "Rowan",
  "Harper", "Parker", "Kai", "Jules", "Emerson", "Skyler", "Quinn", "Hayden", "Blake", "Reese",
];
const speciesPool = [["dog"], ["cat"], ["dog", "cat"], ["bird"], ["rabbit"], ["hamster"]];
const defaultTiers = ["free", "plus", "gold"];
const fallbackVerification = ["pending", "verified", "approved"];
const genders = ["Male", "Female", "Non-binary"];

const tableExists = async (table, probe = "id") => {
  const { error } = await supabase.from(table).select(probe).limit(1);
  return !error || !String(error.message || "").includes("does not exist");
};

const columnExists = async (table, column) => {
  const { error } = await supabase.from(table).select(column).limit(1);
  return !error || !String(error.message || "").includes("does not exist");
};

const ensureUser = async (email, password) => {
  const created = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (!created.error && created.data.user?.id) return created.data.user.id;

  const alreadyExists = String(created.error?.message || "").toLowerCase().includes("already");
  if (!alreadyExists) throw created.error;

  const listed = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listed.error) throw listed.error;
  const user = listed.data.users.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
  if (!user) throw new Error(`Unable to locate existing user for ${email}`);
  return user.id;
};

const run = async () => {
  const hasProfiles = await tableExists("profiles");
  if (!hasProfiles) {
    throw new Error("profiles table not found; cannot seed dev data");
  }

  const optionalProfileColumns = [
    "tier",
    "effective_tier",
    "verification_status",
    "last_lat",
    "last_lng",
    "last_active_at",
    "pet_experience",
    "is_verified",
    "has_car",
    "bio",
    "gender_genre",
    "dob",
    "location_name",
    "social_id",
    "legal_name",
  ];
  const available = new Set();
  for (const col of optionalProfileColumns) {
    if (await columnExists("profiles", col)) available.add(col);
  }

  let tiers = [...defaultTiers];
  if (available.has("tier")) {
    const existingTiers = await supabase
      .from("profiles")
      .select("tier")
      .not("tier", "is", null)
      .limit(100);
    if (!existingTiers.error) {
      const distinct = [...new Set((existingTiers.data || []).map((r) => String(r.tier || "").toLowerCase()).filter(Boolean))];
      if (distinct.length) tiers = distinct;
    }
  }

  let verificationStatuses = [...fallbackVerification];
  if (available.has("verification_status")) {
    const existingStatuses = await supabase
      .from("profiles")
      .select("verification_status")
      .not("verification_status", "is", null)
      .limit(100);
    if (!existingStatuses.error) {
      const distinct = [...new Set((existingStatuses.data || []).map((r) => String(r.verification_status || "").toLowerCase()).filter(Boolean))];
      if (distinct.length) verificationStatuses = distinct;
    }
  }

  const seededUsers = [];
  for (let i = 0; i < seedCount; i += 1) {
    const email = `dev.seed.user+${i}@huddle.local`;
    const password = "HuddleDevSeed123!";
    const userId = await ensureUser(email, password);
    const lat = 22.28 + (Math.random() - 0.5) * 0.12;
    const lng = 114.16 + (Math.random() - 0.5) * 0.12;
    const tier = tiers[i % tiers.length];
    const profileRow = {
      id: userId,
      display_name: `${names[i % names.length]} ${i + 1}`,
    };

    if (available.has("bio")) profileRow.bio = `Pet-loving ${tier} member ready to chat and help.`;
    if (available.has("legal_name")) profileRow.legal_name = `${names[i % names.length]} Seed ${i + 1}`;
    if (available.has("gender_genre")) profileRow.gender_genre = genders[i % genders.length];
    if (available.has("dob")) profileRow.dob = `199${i % 10}-0${(i % 8) + 1}-1${i % 9}`;
    if (available.has("location_name")) profileRow.location_name = "Hong Kong";
    if (available.has("social_id")) profileRow.social_id = String(9000000000 + i);
    if (available.has("has_car")) profileRow.has_car = i % 3 === 0;
    if (available.has("pet_experience")) profileRow.pet_experience = speciesPool[i % speciesPool.length];
    if (available.has("is_verified")) profileRow.is_verified = verificationStatuses[i % verificationStatuses.length] === "verified";
    if (available.has("verification_status")) profileRow.verification_status = verificationStatuses[i % verificationStatuses.length];
    if (available.has("tier")) profileRow.tier = tier;
    if (available.has("effective_tier")) profileRow.effective_tier = tier;
    if (available.has("last_lat")) profileRow.last_lat = lat;
    if (available.has("last_lng")) profileRow.last_lng = lng;
    if (available.has("last_active_at")) profileRow.last_active_at = new Date().toISOString();

    const upserted = await supabase.from("profiles").upsert(profileRow, { onConflict: "id" });
    if (upserted.error) throw upserted.error;
    seededUsers.push({ userId, displayName: profileRow.display_name, lat, lng, tier });
  }

  const hasRooms = await tableExists("chats");
  const hasMembers = await tableExists("chat_room_members");
  const hasMessages = await tableExists("chat_messages");

  if (hasRooms && hasMembers && hasMessages && seededUsers.length >= 6) {
    const pairs = Math.min(12, seededUsers.length - 1);
    for (let i = 1; i <= pairs; i += 1) {
      const me = seededUsers[0];
      const other = seededUsers[i];
      const createdRoom = await supabase
        .from("chats")
        .insert({ name: `${me.displayName} & ${other.displayName}`, type: "direct", created_by: me.userId })
        .select("id")
        .single();
      if (createdRoom.error) continue;
      const roomId = String(createdRoom.data.id);
      await supabase.from("chat_room_members").upsert(
        [
          { chat_id: roomId, user_id: me.userId },
          { chat_id: roomId, user_id: other.userId },
        ],
        { onConflict: "chat_id,user_id" }
      );
      await supabase.from("chat_messages").insert([
        { chat_id: roomId, sender_id: me.userId, content: `Hey ${other.displayName}, welcome to Huddle!` },
        { chat_id: roomId, sender_id: other.userId, content: "Great to connect. Ready for a pet meetup?" },
      ]);
    }
  }

  const hasPins = await tableExists("pins", "user_id");
  if (hasPins) {
    await supabase
      .from("pins")
      .delete()
      .in("user_id", seededUsers.map((u) => u.userId));

    const pinRows = seededUsers.slice(0, Math.min(30, seededUsers.length)).map((u, index) => ({
      user_id: u.userId,
      lat: u.lat,
      lng: u.lng,
      address: `Seed Zone ${index + 1}, Hong Kong`,
      is_invisible: false,
    }));
    await supabase.from("pins").insert(pinRows);
  }

  console.log(`Seed complete. Users: ${seededUsers.length}`);
  console.log(`Primary seeded user_id: ${seededUsers[0]?.userId || "n/a"}`);
};

run().catch((error) => {
  console.error("Dev seed failed:", error?.message || error);
  process.exit(1);
});
