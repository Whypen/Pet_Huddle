import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://ztrbourwcnhrpmzwlrcn.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_DCn7OKhJ15mzHz1xcfTmsw_wxJh5zKd";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

const SENDER_EMAIL = "testaccount5@huddle.test";
const RECIPIENT_EMAIL = "testaccount6@huddle.test";
const PASSWORD = "TestHuddle123!";

async function login(page, email, password) {
  await page.goto("/auth", { waitUntil: "networkidle" });
  const continueBtn = page.getByRole("button", { name: /continue with email/i }).first();
  if (await continueBtn.isVisible().catch(() => false)) await continueBtn.click();
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 20000 });
}

function buildStarIntroPayload(senderId, recipientId) {
  return JSON.stringify({
    kind: "star_intro",
    sender_id: senderId,
    recipient_id: recipientId,
    created_at: new Date().toISOString(),
    text: "Star connection started.",
  });
}

async function main() {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const senderClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const senderAuth = await senderClient.auth.signInWithPassword({
    email: SENDER_EMAIL,
    password: PASSWORD,
  });
  if (senderAuth.error || !senderAuth.data.user) throw senderAuth.error || new Error("sender_sign_in_failed");

  const recipientAuthProbe = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (recipientAuthProbe.error) throw recipientAuthProbe.error;

  const users = recipientAuthProbe.data.users || [];
  const senderUser = users.find((u) => (u.email || "").toLowerCase() === SENDER_EMAIL);
  const recipientUser = users.find((u) => (u.email || "").toLowerCase() === RECIPIENT_EMAIL);
  if (!senderUser || !recipientUser) throw new Error("seed_users_missing");

  const ensureRoom = await senderClient.rpc("ensure_direct_chat_room", {
    p_target_user_id: recipientUser.id,
    p_target_name: "Test Account 6",
  });
  if (ensureRoom.error || !ensureRoom.data) throw ensureRoom.error || new Error("ensure_room_failed");
  const roomId = String(ensureRoom.data);

  const insertStar = await senderClient.from("chat_messages").insert({
    chat_id: roomId,
    sender_id: senderUser.id,
    content: buildStarIntroPayload(senderUser.id, recipientUser.id),
  });
  if (insertStar.error) throw insertStar.error;

  const sendNotif = await admin.rpc("enqueue_notification", {
    p_user_id: recipientUser.id,
    p_category: "chats",
    p_kind: "star",
    p_title: "⭐ Someone sent you a Star! Tap to see who.",
    p_body: "⭐ Someone sent you a Star! Tap to see who.",
    p_href: `/chat-dialogue?room=${roomId}&with=${senderUser.id}`,
    p_data: { room_id: roomId, from_user_id: senderUser.id, type: "star" },
  });
  if (sendNotif.error) throw sendNotif.error;

  const browser = await chromium.launch({ headless: true });
  try {
    const recipientPage = await browser.newPage({
      baseURL: "http://127.0.0.1:4173",
      viewport: { width: 430, height: 932 },
    });
    await login(recipientPage, RECIPIENT_EMAIL, PASSWORD);
    await recipientPage.goto("/chats", { waitUntil: "networkidle" });
    await recipientPage.getByRole("button", { name: /^Chats$/i }).first().click();
    await recipientPage.getByRole("button", { name: /^Friends$/i }).first().click();

    await recipientPage.getByText("Priority").first().waitFor({ timeout: 30000 });
    await recipientPage.getByText("New Star Connection ⭐").first().waitFor({ timeout: 30000 });
    console.log("recipient_priority_preview=ok");

    await recipientPage.getByText("Test Account 5").first().click();
    await recipientPage.getByText("used a Star to reach you. Say hi!").first().waitFor({ timeout: 30000 });
    console.log("recipient_hint=ok");
  } finally {
    await browser.close();
  }

  console.log("star_smoke=PASS");
}

main().catch((error) => {
  console.error(`star_smoke=FAIL ${error?.message || String(error)}`);
  process.exit(1);
});
