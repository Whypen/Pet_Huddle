/* sections-donts.jsx — Don'ts gallery */

function SectionDonts() {
  return (
    <section className="gb" id="donts">
      <div className="gb-head">
        <div><div className="gb-num">12 — Don'ts</div></div>
        <div>
          <h2 className="gb-title">Off-brand, <em style={{fontStyle:"italic", fontWeight:600, color:"#B91C1C"}}>at a glance.</em></h2>
          <p className="gb-lede">
            If a post drifts toward any of these, it stops being huddle. Use this gallery as a final pre-publish gut-check.
          </p>
        </div>
      </div>

      <div className="grid-3">
        <DontPost label="Don't · stock photo background">
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #cad9ff 0%, #f7c8a3 100%)" }}/>
          <div style={{ position: "relative", padding: 20, color: "white", fontWeight: 800, fontSize: 28, lineHeight: 1.0, textShadow: "0 2px 6px rgba(0,0,0,0.4)", textTransform: "uppercase" }}>
            Pet care that<br/>actually cares
          </div>
          <div className="muted" style={{ position: "absolute", left: 16, bottom: 16, fontSize: 10, color: "white" }}>No photographic backgrounds on social.</div>
        </DontPost>

        <DontPost label="Don't · centered, rainbow gradient">
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(45deg, #ff6b9d, #ffd166, #06d6a0, #118ab2)" }}/>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", color: "white", fontWeight: 800, fontSize: 32, textTransform: "uppercase", textShadow: "0 2px 6px rgba(0,0,0,0.3)" }}>
            FUN<br/>FOR ALL<br/>PETS!!!
          </div>
        </DontPost>

        <DontPost label="Don't · emoji overload">
          <div style={{ position: "absolute", inset: 0, background: "var(--soc-blue)" }}/>
          <div style={{ position: "absolute", inset: "12% 8%", color: "white", fontFamily: "Urbanist", fontWeight: 800, fontSize: 26, lineHeight: 1.1, textTransform: "uppercase" }}>
            🐶❤️ NEW<br/>FEATURE!!! 🚀<br/>SWIPE 👉👉👉<br/>🔥🔥🔥
          </div>
        </DontPost>

        <DontPost label="Don't · drop-shadow display type">
          <div style={{ position: "absolute", inset: 0, background: "var(--soc-paper)" }}/>
          <div style={{ position: "absolute", inset: "20% 10%", fontFamily: "Urbanist", fontWeight: 800, fontSize: 56, lineHeight: 0.95, color: "var(--huddle-blue)", textShadow: "5px 5px 0 var(--coral-orange), 10px 10px 14px rgba(0,0,0,0.3)", textTransform: "uppercase" }}>
            Big<br/>type<br/>energy
          </div>
        </DontPost>

        <DontPost label="Don't · alarmist red">
          <div style={{ position: "absolute", inset: 0, background: "#EF4444" }}/>
          <div style={{ position: "absolute", inset: "14% 10%", color: "white", fontFamily: "Urbanist" }}>
            <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: "0.2em", textTransform: "uppercase" }}>EMERGENCY!!</div>
            <div style={{ fontWeight: 800, fontSize: 38, lineHeight: 0.95, marginTop: 12, textTransform: "uppercase" }}>30% off<br/>premium<br/>today only</div>
          </div>
        </DontPost>

        <DontPost label="Don't · KPI-tile dashboard look">
          <div style={{ position: "absolute", inset: 0, background: "white", padding: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 8 }}>
            <div style={{ background: "#F3F4F6", borderRadius: 8, padding: 12 }}>
              <div className="upper muted">Members</div>
              <div style={{ fontSize: 32, fontWeight: 800 }}>14k</div>
            </div>
            <div style={{ background: "#F3F4F6", borderRadius: 8, padding: 12 }}>
              <div className="upper muted">Alerts</div>
              <div style={{ fontSize: 32, fontWeight: 800 }}>312</div>
            </div>
            <div style={{ background: "#F3F4F6", borderRadius: 8, padding: 12 }}>
              <div className="upper muted">Verified</div>
              <div style={{ fontSize: 32, fontWeight: 800 }}>98%</div>
            </div>
            <div style={{ background: "#F3F4F6", borderRadius: 8, padding: 12 }}>
              <div className="upper muted">Avg time</div>
              <div style={{ fontSize: 32, fontWeight: 800 }}>47m</div>
            </div>
          </div>
        </DontPost>
      </div>

      <div className="gb-subhead">Quick veto list</div>
      <div className="grid-2">
        <div className="cap bad"><span className="cap-tag">Veto</span>Centered display headlines.</div>
        <div className="cap bad"><span className="cap-tag">Veto</span>Photographic backgrounds on the canvas.</div>
        <div className="cap bad"><span className="cap-tag">Veto</span>More than three colors in a single post.</div>
        <div className="cap bad"><span className="cap-tag">Veto</span>Rainbow gradients, holographic, chrome effects.</div>
        <div className="cap bad"><span className="cap-tag">Veto</span>Mixing emoji with Friendly Outliner illustrations.</div>
        <div className="cap bad"><span className="cap-tag">Veto</span>The word "Emergency" outside lost-pet context.</div>
        <div className="cap bad"><span className="cap-tag">Veto</span>"Huddle" capitalised in body copy.</div>
        <div className="cap bad"><span className="cap-tag">Veto</span>Premium Gold used as a generic accent.</div>
        <div className="cap bad"><span className="cap-tag">Veto</span>Lime Green inside the app or product UI.</div>
        <div className="cap bad"><span className="cap-tag">Veto</span>Real iPhone bezel renders. Use the sketched phone.</div>
      </div>
    </section>
  );
}

function DontPost({ label, children }) {
  return (
    <div>
      <div className="dont-frame post r-4x5" style={{ position: "relative" }}>
        <div className="ban">No</div>
        {children}
      </div>
      <div className="upper" style={{ color: "#B91C1C", marginTop: 12 }}>{label}</div>
    </div>
  );
}

Object.assign(window, { SectionDonts });
