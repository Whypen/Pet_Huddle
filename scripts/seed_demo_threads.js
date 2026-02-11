import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  content.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return;
    const [key, ...rest] = trimmed.split("=");
    const raw = rest.join("=").trim();
    const value = raw.replace(/^\"|\"$/g, "");
    if (!process.env[key]) process.env[key] = value;
  });
}

const backendEnv = path.resolve(process.cwd(), "..", "Backend logins.env.md");
if (fs.existsSync(backendEnv)) {
  const content = fs.readFileSync(backendEnv, "utf-8");
  content.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return;
    const [key, ...rest] = trimmed.split("=");
    const value = rest.join("=").trim();
    if (!process.env[key]) process.env[key] = value;
  });
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !(SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY)) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY);

const demoThreadIdByAlert = {
  "stray-1": "9888a51c-eb39-418d-b779-b5171b1d399d",
  "stray-2": "2bd23e9b-9758-46fd-a807-4803a4ee12e7",
  "stray-3": "8dfe8ca2-7141-4465-b8a3-0f535e8fbd6b",
  "stray-4": "6ead51ff-33f7-450d-8122-38226b368924",
  "stray-5": "2bf80aea-6dec-4728-a21d-ee61b04536b7",
  "stray-6": "e8bc3c1d-c6cd-453d-89f2-1250662ab997",
  "stray-7": "5693eb81-1036-4902-826c-644e713b65e4",
  "stray-8": "f1d667ca-c495-457f-ad19-74aaca9c41bb",
  "stray-9": "f68abbe9-1ca8-4845-b43c-9d5cd19f7165",
  "stray-10": "18cf7406-d38f-47bf-aa86-0bdd5fc02924",
  "lost-1": "43a06dd1-0ce0-4854-8448-42dd905a4d18",
  "lost-2": "f6fe5d47-48f8-4c29-a065-5e1068ff0a09",
  "lost-3": "c4856dc0-2ff1-42b9-916a-560de967a8e1",
  "lost-4": "605143ad-6131-46f4-8aa5-8cb717ef14d0",
  "lost-5": "d06bc79a-c105-4bc3-baba-c0020baee022",
  "lost-6": "9eff8465-7454-40b8-a8d3-bb0deda1c024",
  "lost-7": "66f64fe6-1bc7-4f5a-ba59-b3c303fe59ae",
  "lost-8": "f2ac2b03-24ef-4c04-b645-938622f5edce",
  "lost-9": "c33ecb2c-c2b9-487d-8910-ffe71d3f30ba",
  "lost-10": "97f1a18a-e748-41d5-8ebf-f5e3768792b4",
};

const demoUserNameByCreator = {
  "demo-user-1": "Sarah Chen",
  "demo-user-2": "Marcus Wong",
  "demo-user-3": "Emily Lam",
  "demo-user-4": "James Liu",
  "demo-user-5": "Jessica Ng",
  "demo-user-6": "David Chan",
  "demo-user-7": "Amy Tsang",
  "demo-user-8": "Kevin Ho",
  "demo-user-9": "Michelle Yip",
  "demo-user-10": "Tom Lee",
  "demo-user-11": "Ava Lau",
  "demo-user-12": "Brian Kwok",
  "demo-user-13": "Chloe Fung",
  "demo-user-14": "Daniel Tse",
  "demo-user-15": "Sophie Cheng",
  "demo-user-16": "Oscar Leung",
  "demo-user-17": "Grace Ip",
  "demo-user-18": "Jason Mak",
  "demo-user-19": "Ivy Tam",
  "demo-user-20": "Jacky Poon",
};

const demoAlerts = [
  { id: "stray-1", type: "Stray", description: "Friendly stray dog spotted near Central Ferry Pier. Black and white, medium size. Looks well-fed but no collar.", photoUrl: "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=400", createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), creatorId: "demo-user-1" },
  { id: "stray-2", type: "Stray", description: "Group of stray cats near Wan Chai Market. About 4-5 cats. Someone has been feeding them regularly.", createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(), creatorId: "demo-user-4" },
  { id: "stray-3", type: "Stray", description: "Small stray puppy seen near Tsim Sha Tsui Star Ferry terminal. Brown fur, timid but approachable.", photoUrl: "https://images.unsplash.com/photo-1583337130417-13219ce08108?w=400", createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), creatorId: "demo-user-5" },
  { id: "stray-4", type: "Stray", description: "Stray ginger cat hanging around Mong Kok flower market area. Appears healthy, very vocal.", createdAt: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(), creatorId: "demo-user-12" },
  { id: "stray-5", type: "Stray", description: "Two stray dogs near Aberdeen promenade. One is limping, may need medical attention.", photoUrl: "https://images.unsplash.com/photo-1601758228041-f3b2795255f1?w=400", createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), creatorId: "demo-user-8" },
  { id: "stray-6", type: "Stray", description: "Stray cat colony near Sham Shui Po wet market. About 8 cats. Need volunteers to help with TNR.", createdAt: new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString(), creatorId: "demo-user-10" },
  { id: "stray-7", type: "Stray", description: "Young stray kitten found behind IFC mall loading dock. Needs foster home urgently.", photoUrl: "https://images.unsplash.com/photo-1526336024174-e58f5cdd8e13?w=400", createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), creatorId: "demo-user-9" },
  { id: "stray-8", type: "Stray", description: "Stray dog near Tseung Kwan O waterfront park. Friendly, seems to be abandoned. Medium-large size.", createdAt: new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString(), creatorId: "demo-user-7" },
  { id: "stray-9", type: "Stray", description: "Stray cat family under bridge near Kwai Chung estate. Mother cat with 3 kittens.", createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(), creatorId: "demo-user-13" },
  { id: "stray-10", type: "Stray", description: "Elderly stray dog near Cheung Sha Wan park. Grey muzzle, walks slowly. Could use some food and water.", photoUrl: "https://images.unsplash.com/photo-1558788353-f76d92427f16?w=400", createdAt: new Date(Date.now() - 14 * 60 * 60 * 1000).toISOString(), creatorId: "demo-user-20" },
  { id: "lost-1", type: "Lost", description: "Lost golden retriever near Victoria Park. Answers to 'Buddy'. Very friendly. Reward offered!", photoUrl: "https://images.unsplash.com/photo-1552053831-71594a27632d?w=400", createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), creatorId: "demo-user-2" },
  { id: "lost-2", type: "Lost", description: "Missing tabby cat. Last seen near Sheung Wan MTR. Has a blue collar with name tag 'Mochi'.", photoUrl: "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=400", createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(), creatorId: "demo-user-9" },
  { id: "lost-3", type: "Lost", description: "Lost shiba inu near Tai Wai MTR. Wearing green harness. Very shy, please do not chase.", photoUrl: "https://images.unsplash.com/photo-1517423440428-a5a00ad493e8?w=400", createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), creatorId: "demo-user-6" },
  { id: "lost-4", type: "Lost", description: "Missing white rabbit near Sai Ying Pun. Escaped during cage cleaning. Reward for safe return.", photoUrl: "https://images.unsplash.com/photo-1474073705359-5da2b0a44b3e?w=400", createdAt: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(), creatorId: "demo-user-3" },
  { id: "lost-5", type: "Lost", description: "Lost cockatiel spotted flying around Kowloon City. Yellow head, grey body. Responds to whistle.", photoUrl: "https://images.unsplash.com/photo-1516466723877-e4ec1d736c8a?w=400", createdAt: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(), creatorId: "demo-user-15" },
  { id: "lost-6", type: "Lost", description: "Missing corgi near Causeway Bay. Wearing pink collar with tag 'Luna'. Please call if found.", photoUrl: "https://images.unsplash.com/photo-1558944351-c155c94a0381?w=400", createdAt: new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString(), creatorId: "demo-user-5" },
  { id: "lost-7", type: "Lost", description: "Lost bengal cat near Quarry Bay. Very active and curious. Has distinctive spots.", photoUrl: "https://images.unsplash.com/photo-1518791841217-8f162f1e1131?w=400", createdAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(), creatorId: "demo-user-11" },
  { id: "lost-8", type: "Lost", description: "Missing parrot near Tsuen Wan. Green feathers with red beak. Can say 'hello'.", photoUrl: "https://images.unsplash.com/photo-1501706362039-c6b2a4b7c5f8?w=400", createdAt: new Date(Date.now() - 16 * 60 * 60 * 1000).toISOString(), creatorId: "demo-user-18" },
  { id: "lost-9", type: "Lost", description: "Lost brown dachshund near Prince Edward. Wearing blue jacket. Very friendly.", photoUrl: "https://images.unsplash.com/photo-1518717758536-85ae29035b6d?w=400", createdAt: new Date(Date.now() - 11 * 60 * 60 * 1000).toISOString(), creatorId: "demo-user-17" },
  { id: "lost-10", type: "Lost", description: "Missing black cat near North Point. Yellow collar with bell. Please help.", photoUrl: "https://images.unsplash.com/photo-1518791841217-8f162f1e1131?w=400", createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), creatorId: "demo-user-19" },
];

const buildThread = (alert, userId) => ({
  id: demoThreadIdByAlert[alert.id],
  user_id: userId,
  title: alert.type === "Others" ? "Community Notice" : `${alert.type} Alert`,
  content: alert.description,
  tags: ["News"],
  hashtags: [],
  images: alert.photoUrl ? [alert.photoUrl] : [],
  is_map_alert: true,
  created_at: alert.createdAt,
});

const run = async () => {
  const { data: userList, error: userErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
  const users = userList?.users || [];
  if (userErr || users.length === 0) {
    console.error("Failed to fetch auth user for demo threads:", userErr);
    process.exit(1);
  }
  const userId = users[0].id;
  const { data: profile } = await supabase.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (!profile) {
    const name = "Huddle Demo";
    const { error: profileErr } = await supabase.from("profiles").insert({
      id: userId,
      display_name: name,
      legal_name: name,
      phone: "+85200000000",
      onboarding_completed: true,
    });
    if (profileErr) {
      console.error("Failed to seed demo profile:", profileErr);
      process.exit(1);
    }
  }
  const rows = demoAlerts.map((alert) => buildThread(alert, userId));
  const { error } = await supabase.from("threads").upsert(rows, { onConflict: "id" });
  if (error) {
    console.error("Failed to seed demo threads:", error);
    process.exit(1);
  }
  console.log(`Seeded ${rows.length} demo threads.`);
};

run();
