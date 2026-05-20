/* global React */
// huddle mobile UI kit — primitives
// Lucide icons loaded via CDN <svg> — inlined here as SVG paths so icons stay tight.

const { useState } = React;

// ─── Icon: minimal inline Lucide-style SVGs ─────────────────────────────
function Icon({ name, size = 22 }) {
  const paths = {
    home: <><path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
    chat: <><path d="M4 5h16v12H7l-3 3V5z"/></>,
    bell: <><path d="M12 2v2"/><path d="M5 9a7 7 0 0 1 14 0v5l2 3H3l2-3V9z"/><path d="M10 20a2 2 0 0 0 4 0"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    plus: <><path d="M12 5v14"/><path d="M5 12h14"/></>,
    back: <><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
    alert: <><path d="m21.7 18.3-8.5-14.6a1.4 1.4 0 0 0-2.4 0L2.3 18.3A1.4 1.4 0 0 0 3.5 20.4h17A1.4 1.4 0 0 0 21.7 18.3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
    paw: <><circle cx="7" cy="10" r="2"/><circle cx="17" cy="10" r="2"/><circle cx="5" cy="15" r="1.6"/><circle cx="19" cy="15" r="1.6"/><path d="M8 18c0-2.5 1.8-4 4-4s4 1.5 4 4a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3z"/></>,
    sparkle: <><path d="M12 2l1.8 6 6.2 2-6.2 2-1.8 6-1.8-6-6.2-2 6.2-2z"/></>,
    shield: <><path d="M12 2 4 5v7c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V5l-8-3Z"/><path d="m9 12 2 2 4-4"/></>,
    check: <><path d="M20 6 9 17l-5-5"/></>,
    send: <><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></>,
    mapPin: <><path d="M20 10c0 7-8 12-8 12S4 17 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></>,
  };
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ stroke: "currentColor", fill: "none", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round" }}>
      {paths[name]}
    </svg>
  );
}

// ─── Header ────────────────────────────────────────────────────────
function Header({ left = null, right = null, title = null }) {
  return (
    <div className="hd-header">
      {left && <div className="hd-header-left">{left}</div>}
      {title ? (
        <div style={{ fontSize: 17, fontWeight: 700, color: "var(--fg-1)" }}>{title}</div>
      ) : (
        <img src="../../assets/huddle-wordmark.png" alt="huddle" />
      )}
      {right && <div className="hd-header-right">{right}</div>}
    </div>
  );
}
function IconBtn({ name, onClick, label }) {
  return (
    <button className="hd-iconbtn" aria-label={label} onClick={onClick}>
      <Icon name={name} />
    </button>
  );
}

// ─── Bottom nav ────────────────────────────────────────────────────
function BottomNav({ active, onChange }) {
  const tabs = [
    { id: "home", label: "Home", icon: "home" },
    { id: "discover", label: "Discover", icon: "search" },
    { id: "alerts", label: "Alerts", icon: "bell" },
    { id: "chats", label: "Chats", icon: "chat" },
    { id: "you", label: "You", icon: "user" },
  ];
  return (
    <nav className="hd-nav">
      {tabs.map((t) => (
        <button key={t.id} className={"hd-tab" + (active === t.id ? " active" : "")} onClick={() => onChange(t.id)}>
          <Icon name={t.icon} />
          {t.label}
        </button>
      ))}
    </nav>
  );
}

// ─── Chip ─────────────────────────────────────────────────────────
function Chip({ tone = "neutral", children, dot = false }) {
  const cls = { neutral: "hd-chip", blue: "hd-chip hd-chip-blue", gold: "hd-chip hd-chip-gold", emergency: "hd-chip hd-chip-emergency" }[tone];
  return (
    <span className={cls}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: 999, background: "currentColor", display: "inline-block", marginRight: 2 }} />}
      {children}
    </span>
  );
}

// ─── CTA buttons ──────────────────────────────────────────────────
function CTAButton({ children, onClick, disabled }) {
  return <button className="hd-cta" onClick={onClick} disabled={disabled}>{children}</button>;
}
function GhostButton({ children, onClick }) {
  return <button className="hd-cta-ghost" onClick={onClick}>{children}</button>;
}
function GoldButton({ children, onClick }) {
  return <button className="hd-cta-gold" onClick={onClick}>{children}</button>;
}

// ─── Input field ──────────────────────────────────────────────────
function InputField({ label, placeholder, value, onChange, type = "text", error }) {
  const [focus, setFocus] = useState(false);
  const cls = "hd-input-field hd-neu-inset" + (focus ? " focus" : "") + (error ? " error" : "");
  return (
    <div>
      <div className={cls}>
        <span className="lab" style={error ? { color: "#B91C1C" } : (focus ? { color: "var(--huddle-blue)" } : null)}>{label}</span>
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
        />
      </div>
      {error && <div className="hd-input-err" style={{ marginTop: 4 }}>{error}</div>}
    </div>
  );
}

// ─── Upsell banner (Premium / Gold) ───────────────────────────────
function UpsellBanner({ tone = "premium", title, body, cta, onPress }) {
  const isGold = tone === "gold";
  return (
    <button onClick={onPress} style={{
      width: "100%", padding: 14, borderRadius: 16, border: "none", textAlign: "left",
      background: isGold ? "linear-gradient(135deg, #FFF4C8, #FFE58A)" : "linear-gradient(135deg, #EBF5FF, #E3EAFF)",
      display: "flex", gap: 12, alignItems: "center", cursor: "pointer",
      boxShadow: "0 6px 18px rgba(66,73,101,0.07)",
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 12, flex: "0 0 36px",
        background: isGold ? "var(--premium-gold)" : "var(--huddle-blue)", color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon name={isGold ? "sparkle" : "shield"} size={18} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--fg-1)" }}>{title}</div>
        <div style={{ fontSize: 12, color: "var(--fg-2)", marginTop: 2, lineHeight: 1.4 }}>{body}</div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: isGold ? "#8B6F00" : "var(--huddle-blue)" }}>{cta} →</div>
    </button>
  );
}

// ─── Expose to window ────────────────────────────────────────────
Object.assign(window, { Icon, Header, IconBtn, BottomNav, Chip, CTAButton, GhostButton, GoldButton, InputField, UpsellBanner });
