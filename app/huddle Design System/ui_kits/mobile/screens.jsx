/* global React, Header, IconBtn, BottomNav, Chip, CTAButton, GhostButton, GoldButton, InputField, UpsellBanner, Icon */
// huddle mobile UI kit — screens

const { useState } = React;

// ─── Home screen ──────────────────────────────────────────────────
function HomeScreen({ go }) {
  return (
    <div className="hd-screen">
      <Header right={<IconBtn name="settings" label="Settings" onClick={() => go("settings")} />} />
      <div className="hd-content">
        <div>
          <div className="hd-eyebrow">Pet dashboard</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.01em", margin: "4px 0 0", color: "var(--fg-1)" }}>
            Good morning, Alex<span className="hd-asterisk">*</span>
          </h1>
        </div>

        <div className="hd-neu">
          <div className="hd-eyebrow">Next event</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "var(--fg-1)", marginTop: 4 }}>24 Apr · Vet visit</div>
          <div style={{ fontSize: 13, color: "var(--fg-2)", marginTop: 2 }}>Buddy · Annual check-up at 3:00 PM</div>
        </div>

        <div className="hd-card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{
            height: 180, background: "linear-gradient(135deg, #2145CF 0%, #3A5FE8 100%)",
            position: "relative", display: "flex", alignItems: "flex-end", padding: 14, color: "#fff",
          }}>
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(14,14,16,0.6), transparent 55%)" }}></div>
            <div style={{ position: "relative", width: "100%" }}>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.01em" }}>Buddy</div>
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <span style={{ padding: "3px 10px", borderRadius: 9999, background: "rgba(255,255,255,0.2)", backdropFilter: "blur(6px)", fontSize: 11, fontWeight: 600 }}>Dog · Labrador</span>
                <span style={{ padding: "3px 10px", borderRadius: 9999, background: "rgba(255,255,255,0.2)", backdropFilter: "blur(6px)", fontSize: 11, fontWeight: 600 }}>4y</span>
              </div>
            </div>
          </div>
          <div style={{ padding: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Chip tone="neutral">Next walk · Sat 3 PM</Chip>
            <Chip tone="blue" dot>Vaccines up to date</Chip>
          </div>
        </div>

        <UpsellBanner
          tone="premium"
          title="huddle Premium"
          body="Higher quotas, advanced filters, priority discovery."
          cta="Upgrade"
          onPress={() => go("premium")}
        />

        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}><CTAButton onClick={() => go("petProfile")}>Add Pet</CTAButton></div>
          <div style={{ flex: 1 }}><GhostButton onClick={() => go("createThread")}>Create Thread</GhostButton></div>
        </div>

        <div className="hd-card">
          <div className="hd-eyebrow">A calm word</div>
          <p style={{ margin: "6px 0 0", fontSize: 14, lineHeight: 1.55, color: "var(--fg-1)" }}>
            Short walks after meals help digestion. Keep water nearby on warm afternoons — Buddy will thank you.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Auth screen ─────────────────────────────────────────────────
function AuthScreen({ go, onSignIn }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const passwordError = password.length > 0 && password.length < 6 ? "Password must be at least 6 characters." : null;

  const canSubmit = email.includes("@") && password.length >= 6 && (mode === "signin" || (phone.length > 5 && consent));

  return (
    <div className="hd-screen">
      <Header />
      <div className="hd-content" style={{ gap: 14 }}>
        <div style={{ marginTop: 8 }}>
          <div className="hd-eyebrow">{mode === "signin" ? "Welcome back" : "Create your account"}</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.01em", margin: "4px 0 0", color: "var(--fg-1)" }}>
            {mode === "signin" ? "Sign in to your huddle." : "Join the huddle."}
          </h1>
        </div>

        <InputField label="Email" placeholder="your@email.com" value={email} onChange={setEmail} type="email" />
        <InputField label="Password" placeholder="At least 6 characters" value={password} onChange={setPassword} type="password" error={passwordError} />
        {mode === "signup" && <InputField label="Phone" placeholder="+852..." value={phone} onChange={setPhone} type="tel" />}

        {mode === "signup" && (
          <button onClick={() => setConsent((v) => !v)} style={{
            padding: 12, borderRadius: 14, border: "1.5px solid " + (consent ? "var(--huddle-blue)" : "rgba(66,73,101,0.25)"),
            background: consent ? "rgba(33,69,207,0.05)" : "#fff", cursor: "pointer", textAlign: "left",
            display: "flex", gap: 10, alignItems: "flex-start",
          }}>
            <div style={{
              width: 20, height: 20, borderRadius: 6, flex: "0 0 20px",
              border: "1.5px solid " + (consent ? "var(--huddle-blue)" : "rgba(66,73,101,0.35)"),
              background: consent ? "var(--huddle-blue)" : "#fff", color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1,
            }}>
              {consent && <Icon name="check" size={14} />}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: "var(--fg-1)", fontWeight: 500 }}>
              I have read and agree to the <span style={{ color: "var(--huddle-blue)", fontWeight: 700 }}>Terms of Service</span> and <span style={{ color: "var(--huddle-blue)", fontWeight: 700 }}>Privacy Policy</span>.
            </div>
          </button>
        )}

        <CTAButton onClick={onSignIn} disabled={!canSubmit}>
          {mode === "signin" ? "Sign In" : "Sign Up"}
        </CTAButton>

        <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")} style={{
          background: "none", border: "none", padding: 10, color: "var(--huddle-blue)",
          fontFamily: "inherit", fontWeight: 700, fontSize: 14, cursor: "pointer",
        }}>
          {mode === "signin" ? "Create an account" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}

// ─── Chats screen ─────────────────────────────────────────────────
function ChatsScreen({ go }) {
  const threads = [
    { id: 1, name: "Sarah Chen", last: "Saturday 3 PM works for Buddy.", time: "2m", unread: 2, avatar: "linear-gradient(135deg, #FF7F50, #CFAB21)", status: "booked" },
    { id: 2, name: "Animal Friends · Wan Chai", last: "Marcus: Anyone free this weekend?", time: "18m", unread: 0, avatar: "linear-gradient(135deg, #2145CF, #3A5FE8)", status: "group" },
    { id: 3, name: "Dr. Lee's Clinic", last: "Your appointment is confirmed.", time: "1h", unread: 0, avatar: "linear-gradient(135deg, #22C55E, #BFFF00)", status: "verified" },
    { id: 4, name: "AI Vet", last: "Based on Buddy's age, I'd suggest…", time: "3h", unread: 0, avatar: "linear-gradient(135deg, #424965, #1C3ECC)", status: "ai" },
  ];
  return (
    <div className="hd-screen">
      <Header title="Chats" right={<IconBtn name="plus" label="New" />} />
      <div className="hd-content" style={{ paddingTop: 8 }}>
        <div className="hd-neu-inset" style={{ padding: "10px 14px", fontSize: 14, color: "var(--fg-2)" }}>
          Search chats…
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {threads.map((t) => (
            <div key={t.id} style={{ display: "flex", gap: 12, padding: "12px 4px", alignItems: "center", borderBottom: "1px solid rgba(66,73,101,0.06)" }}>
              <div style={{ width: 44, height: 44, borderRadius: 999, flex: "0 0 44px", background: t.avatar }}></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--fg-1)" }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: "var(--fg-2)" }}>{t.time}</div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                  <div style={{ fontSize: 13, color: "var(--fg-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220 }}>{t.last}</div>
                  {t.unread > 0 && (
                    <div style={{ minWidth: 20, height: 20, borderRadius: 999, background: "var(--huddle-blue)", color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 6px" }}>{t.unread}</div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Alerts / notifications screen ─────────────────────────────────
function AlertsScreen({ go }) {
  return (
    <div className="hd-screen">
      <Header title="Alerts" />
      <div className="hd-content" style={{ paddingTop: 8 }}>
        <div style={{
          padding: 14, borderRadius: 16, background: "linear-gradient(135deg, #FFF1E6, #FFE0C8)",
          border: "1px solid rgba(249,115,22,0.25)", display: "flex", gap: 12,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 12, flex: "0 0 36px",
            background: "var(--emergency-red)", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}><Icon name="alert" size={18} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Chip tone="emergency" dot>72H · 10km</Chip>
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--fg-1)", marginTop: 6 }}>Lost pet near you — Milo</div>
            <div style={{ fontSize: 13, color: "var(--fg-2)", marginTop: 3, lineHeight: 1.5 }}>
              Small tabby cat, last seen 20 min ago on Queen's Road East. Please keep an eye out.
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button className="hd-cta" style={{ height: 40, fontSize: 14, flex: 1 }}>View alert</button>
              <button className="hd-cta-ghost" style={{ height: 40, fontSize: 14, flex: 1 }}>Share</button>
            </div>
          </div>
        </div>

        <div className="hd-eyebrow" style={{ marginTop: 4 }}>Earlier this week</div>
        <div className="hd-card">
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 12, background: "rgba(33,69,207,0.08)", color: "var(--huddle-blue)", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 36px" }}><Icon name="shield" size={18} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Sarah Chen is now verified</div>
              <div style={{ fontSize: 12, color: "var(--fg-2)", marginTop: 2 }}>Your Saturday walker passed ID verification.</div>
              <div style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 4 }}>22 Apr · 10:04</div>
            </div>
          </div>
        </div>
        <div className="hd-card">
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 12, background: "rgba(207,171,33,0.12)", color: "#8B6F00", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 36px" }}><Icon name="sparkle" size={18} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>3 new walkers in your area</div>
              <div style={{ fontSize: 12, color: "var(--fg-2)", marginTop: 2 }}>All verified, averaging 4.9★.</div>
              <div style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 4 }}>21 Apr · 18:40</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Premium screen ───────────────────────────────────────────────
function PremiumScreen({ go }) {
  const premiumFeatures = ["Higher message quotas", "Advanced discovery filters", "Priority listing in marketplace", "Access to AI Vet"];
  const goldFeatures = ["Everything in Premium", "Unlimited Stars · direct chats", "Family quota sharing (up to 4)", "Longer broadcasts (72h · 20km)"];
  return (
    <div className="hd-screen">
      <Header title="Upgrade" left={<IconBtn name="back" label="Back" onClick={() => go("home")} />} />
      <div className="hd-content">
        <div>
          <div className="hd-eyebrow">Membership</div>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.01em", margin: "4px 0 0", lineHeight: 1.1 }}>
            Care for them <span style={{ color: "var(--coral-orange)" }}>better</span>.
          </h1>
          <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--fg-2)", lineHeight: 1.55 }}>
            Unlock higher quotas, richer discovery, and priority across the huddle network.
          </p>
        </div>

        <div style={{
          padding: 18, borderRadius: 20, background: "linear-gradient(160deg, #EBF5FF 0%, #E3EAFF 100%)",
          border: "1px solid rgba(33,69,207,0.15)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <Chip tone="blue">Premium</Chip>
              <div style={{ fontSize: 26, fontWeight: 800, marginTop: 8, letterSpacing: "-0.01em" }}>$9.99 <span style={{ fontSize: 14, fontWeight: 500, color: "var(--fg-2)" }}>/ mo</span></div>
            </div>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: "var(--huddle-blue)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="shield" />
            </div>
          </div>
          <ul style={{ margin: "14px 0 16px", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
            {premiumFeatures.map((f) => (
              <li key={f} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "var(--fg-1)" }}>
                <span style={{ color: "var(--huddle-blue)" }}><Icon name="check" size={16} /></span>{f}
              </li>
            ))}
          </ul>
          <CTAButton>Secure Privileges</CTAButton>
        </div>

        <div style={{
          padding: 18, borderRadius: 20, background: "linear-gradient(160deg, #FFF9E0 0%, #FFF2B8 100%)",
          border: "1px solid rgba(207,171,33,0.3)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <Chip tone="gold">Gold</Chip>
              <div style={{ fontSize: 26, fontWeight: 800, marginTop: 8, letterSpacing: "-0.01em" }}>$19.99 <span style={{ fontSize: 14, fontWeight: 500, color: "var(--fg-2)" }}>/ mo</span></div>
            </div>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: "var(--premium-gold)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="sparkle" />
            </div>
          </div>
          <ul style={{ margin: "14px 0 16px", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
            {goldFeatures.map((f) => (
              <li key={f} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "var(--fg-1)" }}>
                <span style={{ color: "#8B6F00" }}><Icon name="check" size={16} /></span>{f}
              </li>
            ))}
          </ul>
          <GoldButton>Go Gold</GoldButton>
        </div>
      </div>
    </div>
  );
}

// ─── Discover / Nearby screen ─────────────────────────────────────
function DiscoverScreen() {
  const nearby = [
    { name: "Buddy", meta: "Dog · Labrador · 4y", dist: "200m", bg: "linear-gradient(135deg, #FF7F50, #CFAB21)" },
    { name: "Luna", meta: "Cat · Calico · 2y", dist: "480m", bg: "linear-gradient(135deg, #2145CF, #3A5FE8)" },
    { name: "Marcus", meta: "Animal Friend", dist: "700m", bg: "linear-gradient(135deg, #BFFF00, #22C55E)", role: true },
    { name: "Mochi", meta: "Dog · Shiba · 1y", dist: "1.2km", bg: "linear-gradient(135deg, #F97316, #EF4444)" },
  ];
  return (
    <div className="hd-screen">
      <Header title="Discover" />
      <div className="hd-content" style={{ paddingTop: 8 }}>
        <div style={{ display: "flex", gap: 8, overflow: "hidden", flexWrap: "nowrap" }}>
          <Chip tone="blue" dot>All</Chip>
          <Chip>Dogs</Chip>
          <Chip>Cats</Chip>
          <Chip>Friends</Chip>
          <Chip>Services</Chip>
        </div>
        <div className="hd-eyebrow" style={{ marginTop: 4 }}>Nearby · within 2km</div>
        {nearby.map((p) => (
          <div key={p.name} className="hd-card" style={{ display: "flex", gap: 12, alignItems: "center", padding: 12 }}>
            <div style={{ width: 52, height: 52, borderRadius: 16, background: p.bg, flex: "0 0 52px" }}></div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{p.name}</div>
                {p.role && <Chip tone="blue">Animal Friend</Chip>}
              </div>
              <div style={{ fontSize: 12, color: "var(--fg-2)", marginTop: 2 }}>{p.meta}</div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--huddle-blue)", display: "flex", alignItems: "center", gap: 4 }}>
              <Icon name="mapPin" size={14} /> {p.dist}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── You / profile screen ─────────────────────────────────────────
function YouScreen({ go, onSignOut }) {
  return (
    <div className="hd-screen">
      <Header title="You" right={<IconBtn name="settings" label="Settings" />} />
      <div className="hd-content">
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div style={{
            width: 72, height: 72, borderRadius: 999, background: "linear-gradient(135deg, #FF7F50, #CFAB21)",
            flex: "0 0 72px",
          }}></div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "var(--fg-1)" }}>Alex Carter</div>
            <div style={{ fontSize: 13, color: "var(--fg-2)", marginTop: 2 }}>Wan Chai, Hong Kong</div>
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <Chip tone="blue" dot>Verified</Chip>
              <Chip>1 pet · Buddy</Chip>
            </div>
          </div>
        </div>

        <UpsellBanner
          tone="gold"
          title="Gold · family quota"
          body="Share limits across up to 4 family members."
          cta="Go Gold"
          onPress={() => go("premium")}
        />

        <div className="hd-card" style={{ padding: 0 }}>
          {[
            { icon: "paw", label: "My pets", sub: "1 pet · Buddy" },
            { icon: "shield", label: "Verification", sub: "Verified · 14 Mar 2026" },
            { icon: "bell", label: "Notifications", sub: "Alerts within 5km" },
            { icon: "settings", label: "Settings", sub: "Language, privacy, data" },
          ].map((row, i, arr) => (
            <div key={row.label} style={{
              display: "flex", gap: 12, padding: "14px 16px", alignItems: "center",
              borderBottom: i === arr.length - 1 ? "none" : "1px solid rgba(66,73,101,0.06)",
            }}>
              <div style={{ width: 36, height: 36, borderRadius: 12, background: "rgba(33,69,207,0.07)", color: "var(--huddle-blue)", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 36px" }}><Icon name={row.icon} size={18} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{row.label}</div>
                <div style={{ fontSize: 12, color: "var(--fg-2)" }}>{row.sub}</div>
              </div>
              <div style={{ color: "var(--fg-3)" }}>›</div>
            </div>
          ))}
        </div>

        <button onClick={onSignOut} style={{
          background: "transparent", border: "none", color: "var(--validation-red)",
          fontFamily: "inherit", fontSize: 14, fontWeight: 600, padding: 12, cursor: "pointer",
        }}>Sign out</button>
      </div>
    </div>
  );
}

Object.assign(window, { HomeScreen, AuthScreen, ChatsScreen, AlertsScreen, PremiumScreen, DiscoverScreen, YouScreen });
