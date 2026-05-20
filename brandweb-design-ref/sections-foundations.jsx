/* sections-foundations.jsx — Logo, Color, Type, Voice */

function SectionLogo() {
  return (
    <section className="gb" id="logo">
      <div className="gb-head">
        <div>
          <div className="gb-num">01 — Identity</div>
        </div>
        <div>
          <h2 className="gb-title">Logo, mark <em style={{fontStyle: "italic", fontWeight: 600, color: "var(--coral-orange)"}}>&</em> wordmark</h2>
          <p className="gb-lede">
            The huddle wordmark is the <strong>Marshmallow Bounce</strong> — a custom bubbly logotype with the bear-cub smiley face hiding in the <strong>e</strong>.
            Five color variants, one bear-face variant, and one inverted (white) set for dark surfaces.
          </p>
        </div>
      </div>

      <div className="gb-subhead">Wordmark family · Marshmallow Bounce</div>
      <div className="grid-3">
        <WMCard label="Blue · primary" tag="Default" tagCls="tag-rule" bg="white" src="assets/wordmark-blue.png"
          desc="For posters, footers, email signatures, and any time the brand needs to be read as a name." dark={false}/>
        <WMCard label="Full logo · bear face" tag="With character" tagCls="tag-rule" bg="white" src="assets/wordmark-full.png"
          desc="The bear-face variant with eyes + smile in the e. Use for hero moments, app store icons, and splash screens." dark={false}/>
        <WMCard label="Coral shadow" tag="Editorial" tagCls="tag-rule" bg="#F5F3EE" src="assets/wordmark-coral-shadow.png"
          desc="Blue wordmark with coral shadow offset. For cover cards, posters, and manifesto moments." dark={false}/>
        <WMCard label="Coral" tag="Warm accent" tagCls="tag-rule" bg="white" src="assets/wordmark-coral.png"
          desc="Mono-coral for warm surfaces. Pair with cream paper or white backgrounds." dark={false}/>
        <WMCard label="Lime" tag="Campaign" tagCls="tag-rule" bg="var(--huddle-blue)" src="assets/wordmark-lime.png"
          desc="Lime on blue. Reserved for campaigns, IRL events, and the email masthead." dark={true}/>
        <WMCard label="White · inverted" tag="On dark only" tagCls="tag-dont" bg="var(--huddle-blue)" src="assets/wordmark-white.png"
          desc="Use on Huddle Blue, Coral, photography, and dark scrims. Never on Lime — contrast collapses." dark={true}/>
      </div>

      <div className="gb-subhead">Bear mark · standalone</div>
      <div className="grid-3">
        <div className="card" style={{ paddingTop: 40, paddingBottom: 40 }}>
          <div className="card-head">
            <div className="card-eyebrow">Mark · blue</div>
            <span className="card-tag tag-rule">Avatars · Favicons</span>
          </div>
          <div style={{ display: "flex", justifyContent: "center", padding: "32px 0" }}>
            <BMark size={120}/>
          </div>
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
            The mark works alone at 32px and up. Below that, it loses the bear's face — switch to the wordmark.
          </div>
        </div>
        <div className="card" style={{ paddingTop: 40, paddingBottom: 40, background: "var(--huddle-blue)", border: "none" }}>
          <div className="card-head">
            <div className="card-eyebrow" style={{ color: "rgba(255,255,255,0.75)" }}>Mark · white</div>
            <span className="card-tag" style={{ color: "white", border: "1px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.10)" }}>On dark only</span>
          </div>
          <div style={{ display: "flex", justifyContent: "center", padding: "32px 0" }}>
            <BMark size={120} variant="white"/>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: "rgba(255,255,255,0.85)" }}>
            White mark on blue or dark surfaces. Same clear-space rules apply.
          </div>
        </div>
        <div className="card" style={{ paddingTop: 40, paddingBottom: 40 }}>
          <div className="card-head">
            <div className="card-eyebrow">Mark vs Wordmark</div>
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 24, padding: "32px 0", alignItems: "center" }}>
            <BMark size={48}/>
            <span style={{ fontSize: 20, color: "var(--fg-2)" }}>→</span>
            <Wordmark height={48}/>
          </div>
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
            At small sizes (below 48px tall), the mark loses legibility. Switch to the full wordmark.
          </div>
        </div>
      </div>

      <div className="gb-subhead">Clear space &amp; minimum sizes</div>

      <div className="grid-2">
        <div className="card">
          <div style={{ position: "relative", padding: 32, background: "#FBFAF6", borderRadius: 12 }}>
            <div style={{ position: "relative", padding: "var(--cs)", border: "1px dashed rgba(33,69,207,0.35)", display: "inline-block", "--cs": "32px" }}>
              <img src="assets/wordmark-blue.png" alt="" style={{ height: 72, display: "block" }}/>
            </div>
            <div style={{ position: "absolute", top: 12, left: 12, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 10, color: "var(--huddle-blue)" }}>x = height of the bear's face</div>
          </div>
          <div style={{ marginTop: 16 }}>
            <div className="upper muted">Clear space</div>
            <p className="gb-p">Reserve <span className="em">x</span> on every side of the wordmark, where <span className="em">x</span> equals the height of the bear's face inside the b. Don't crowd the cub.</p>
          </div>
        </div>

        <div className="card">
          <div style={{ display: "flex", alignItems: "flex-end", gap: 24, padding: 32, background: "#FBFAF6", borderRadius: 12, justifyContent: "center" }}>
            <div style={{ textAlign: "center" }}>
              <img src="assets/wordmark-blue.png" alt="" style={{ height: 12, display: "block", margin: "0 auto" }}/>
              <div className="mono muted" style={{ marginTop: 6 }}>32px ✕</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <img src="assets/wordmark-blue.png" alt="" style={{ height: 24, display: "block", margin: "0 auto" }}/>
              <div className="mono muted" style={{ marginTop: 6 }}>56px ✕</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <img src="assets/wordmark-blue.png" alt="" style={{ height: 36, display: "block", margin: "0 auto" }}/>
              <div className="mono" style={{ color: "var(--huddle-blue)", marginTop: 6, fontWeight: 700 }}>80px ✓</div>
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <div className="upper muted">Minimum size</div>
            <p className="gb-p">
              Wordmark: <span className="em">80px wide on screen</span>, 24mm in print. Mark: <span className="em">32px</span>.
              Below this, the bear's smile becomes a smudge.
            </p>
          </div>
        </div>
      </div>

      <div className="gb-subhead">Misuse</div>
      <div className="grid-4">
        <DontTile label="Don't recolor" >
          <img src="assets/wordmark-blue.png" style={{ height: 60, filter: "hue-rotate(120deg) saturate(2)" }} alt=""/>
        </DontTile>
        <DontTile label="Don't stretch">
          <img src="assets/wordmark-blue.png" style={{ height: 60, transform: "scaleX(0.5)" }} alt=""/>
        </DontTile>
        <DontTile label="Don't outline">
          <img src="assets/wordmark-blue.png" style={{ height: 60, filter: "drop-shadow(0 0 0 white) drop-shadow(2px 0 0 black)" }} alt=""/>
        </DontTile>
        <DontTile label="Don't drop-shadow">
          <img src="assets/wordmark-blue.png" style={{ height: 60, filter: "drop-shadow(4px 6px 0 rgba(0,0,0,0.3))" }} alt=""/>
        </DontTile>
      </div>
    </section>
  );
}

function DontTile({ label, children }) {
  return (
    <div className="dont-frame" style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 160, background: "white" }}>
      <div className="ban">No</div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>{children}</div>
      <div className="upper" style={{ color: "#B91C1C", marginTop: 8 }}>{label}</div>
    </div>
  );
}

function WMCard({ label, tag, tagCls, bg, src, desc, dark }) {
  return (
    <div className="card" style={{ paddingTop: 40, paddingBottom: 40, background: bg, border: dark ? "none" : undefined, color: dark ? "white" : undefined }}>
      <div className="card-head">
        <div className="card-eyebrow" style={dark ? { color: "rgba(255,255,255,0.75)" } : {}}>{label}</div>
        {tag && <span className={`card-tag ${tagCls || ""}`} style={dark ? { color: "white", border: "1px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.10)" } : {}}>{tag}</span>}
      </div>
      <div style={{ display: "flex", justifyContent: "center", padding: "24px 16px" }}>
        <img src={src} alt={label} style={{ maxWidth: "88%", maxHeight: 120 }}/>
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.5, color: dark ? "rgba(255,255,255,0.85)" : "var(--fg-2)" }}>
        {desc}
      </div>
    </div>
  );
}

/* ============================================================
   Color
   ============================================================ */

function SectionColor() {
  return (
    <section className="gb" id="color">
      <div className="gb-head">
        <div><div className="gb-num">02 — Color</div></div>
        <div>
          <h2 className="gb-title">A loud, <span style={{color: "var(--coral-orange)"}}>warm</span>, <span style={{color: "var(--huddle-blue)"}}>blue</span> palette</h2>
          <p className="gb-lede">
            In the app, color is restrained. On social, color is the <strong>headline</strong>. Lead with <span style={{color:"var(--huddle-blue)", fontWeight: 700}}>Huddle Blue</span>,
            cut with <span style={{color:"var(--coral-orange)", fontWeight: 700}}>Coral Orange</span> for warmth, and reserve <span style={{color:"#7CA800", fontWeight: 700}}>Lime</span> for moments of optimism.
          </p>
        </div>
      </div>

      <div className="gb-subhead">The five-color cast</div>
      <div className="grid-3">
        <div className="swatch" style={{ background: "var(--huddle-blue)", color: "white" }}>
          <div>
            <div className="swatch-role">Lead · 60%</div>
            <div className="swatch-name" style={{ marginTop: 8 }}>Huddle Blue</div>
            <div className="swatch-hex">#2145CF</div>
          </div>
          <div className="swatch-share">60</div>
        </div>
        <div className="swatch" style={{ background: "var(--soc-paper)", color: "var(--ink)" }}>
          <div>
            <div className="swatch-role">Surface · 25%</div>
            <div className="swatch-name" style={{ marginTop: 8 }}>Torn Paper</div>
            <div className="swatch-hex">#F5F3EE</div>
          </div>
          <div className="swatch-share">25</div>
        </div>
        <div className="swatch" style={{ background: "var(--coral-orange)", color: "white" }}>
          <div>
            <div className="swatch-role">Heat · 10%</div>
            <div className="swatch-name" style={{ marginTop: 8 }}>Coral Orange</div>
            <div className="swatch-hex">#FF7F50</div>
          </div>
          <div className="swatch-share">10</div>
        </div>
        <div className="swatch" style={{ background: "var(--soc-lime)", color: "var(--ink)" }}>
          <div>
            <div className="swatch-role">Lift · 5%</div>
            <div className="swatch-name" style={{ marginTop: 8 }}>Lime Green</div>
            <div className="swatch-hex">#BFFF00</div>
          </div>
          <div className="swatch-share">5</div>
        </div>
        <div className="swatch" style={{ background: "var(--ink)", color: "white" }}>
          <div>
            <div className="swatch-role">Type</div>
            <div className="swatch-name" style={{ marginTop: 8 }}>Ink</div>
            <div className="swatch-hex">#0E0E10</div>
          </div>
          <div className="upper" style={{ opacity: 0.7 }}>Outliner only</div>
        </div>
        <div className="swatch" style={{ background: "white", color: "var(--ink)" }}>
          <div>
            <div className="swatch-role">Type</div>
            <div className="swatch-name" style={{ marginTop: 8 }}>Off-white</div>
            <div className="swatch-hex">#FFFFFF</div>
          </div>
          <div className="upper" style={{ opacity: 0.7 }}>On blue / coral</div>
        </div>
      </div>

      <div className="gb-subhead">Recipes &amp; ratios</div>
      <p className="gb-p" style={{ maxWidth: "100%" }}>
        Pick <strong>one lead</strong>, <strong>one accent</strong>, and a paper or white anchor. Three colors per post is the ceiling.
        Ink is the only color allowed on illustrations.
      </p>

      <div className="grid-3">
        <Recipe lead="Huddle Blue" accent="Coral Orange" surface="Paper">
          <div style={{ height: 100, background: "var(--huddle-blue)", display: "flex" }}>
            <div style={{ width: "30%", background: "var(--coral-orange)" }}/>
            <div style={{ width: "20%", background: "var(--soc-paper)" }}/>
          </div>
          <div style={{ padding: 12 }} className="upper muted">Default · Manifesto / feature</div>
        </Recipe>
        <Recipe lead="Lime" accent="Huddle Blue" surface="Paper">
          <div style={{ height: 100, background: "var(--soc-lime)", display: "flex" }}>
            <div style={{ width: "30%", background: "var(--huddle-blue)" }}/>
            <div style={{ width: "20%", background: "white" }}/>
          </div>
          <div style={{ padding: 12 }} className="upper muted">Optimism · Email · IRL meet-up</div>
        </Recipe>
        <Recipe lead="Paper" accent="Huddle Blue" surface="Coral">
          <div style={{ height: 100, background: "var(--soc-paper)", display: "flex" }}>
            <div style={{ width: "30%", background: "var(--huddle-blue)" }}/>
            <div style={{ width: "20%", background: "var(--coral-orange)" }}/>
          </div>
          <div style={{ padding: 12 }} className="upper muted">Tip · Quiet community moment</div>
        </Recipe>
      </div>

      <div className="gb-subhead">Reserved</div>
      <div className="grid-2">
        <div className="card row" style={{ borderLeft: "4px solid #F97316" }}>
          <div style={{ width: 48, height: 48, background: "#F97316", borderRadius: 8, flexShrink: 0 }}/>
          <div>
            <div className="upper muted">Emergency Red — #F97316</div>
            <div className="gb-h3" style={{ fontSize: 18 }}>Lost-pet broadcasts only.</div>
            <p className="gb-p" style={{ margin: 0 }}>Never a generic accent. Never on a feature post that isn't safety.</p>
          </div>
        </div>
        <div className="card row" style={{ borderLeft: "4px solid #CFAB21" }}>
          <div style={{ width: 48, height: 48, background: "#CFAB21", borderRadius: 8, flexShrink: 0 }}/>
          <div>
            <div className="upper muted">Premium Gold — #CFAB21</div>
            <div className="gb-h3" style={{ fontSize: 18 }}>Gold tier creative only.</div>
            <p className="gb-p" style={{ margin: 0 }}>Verified badges and Gold-tier promo. Don't borrow it for "important" things.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Recipe({ lead, accent, surface, children }) {
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {children}
      <div style={{ padding: "16px 16px 20px" }}>
        <div className="upper muted">Lead · Accent · Surface</div>
        <div style={{ fontWeight: 700, fontSize: 16, marginTop: 4 }}>{lead} · {accent} · {surface}</div>
      </div>
    </div>
  );
}

/* ============================================================
   Typography
   ============================================================ */
function SectionType() {
  return (
    <section className="gb" id="type">
      <div className="gb-head">
        <div><div className="gb-num">03 — Typography</div></div>
        <div>
          <h2 className="gb-title">Urbanist, <em style={{color:"var(--coral-orange)", fontStyle:"italic", fontWeight: 600}}>screaming.</em></h2>
          <p className="gb-lede">
            One typeface. Six weights. The same family that runs the app — but on social we let it shout. Display sizes, all-caps, tight tracking, no decoration.
          </p>
        </div>
      </div>

      <div className="gb-subhead">Display — the social megaphone</div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ background: "var(--huddle-blue)", color: "white", padding: "48px 40px" }}>
          <div style={{ fontSize: "clamp(60px, 11vw, 168px)", fontWeight: 800, lineHeight: 0.92, letterSpacing: "-0.04em", textTransform: "uppercase" }}>
            Care.<br/>
            <span style={{ color: "var(--coral-orange)" }}>Connected.</span><br/>
            Together.
          </div>
        </div>
        <div style={{ padding: 20, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, fontSize: 12 }}>
          <Spec label="Family" value="Urbanist 800"/>
          <Spec label="Size" value="120–168px"/>
          <Spec label="Tracking" value="-0.04em"/>
          <Spec label="Leading" value="0.92"/>
        </div>
      </div>

      <div className="gb-subhead">Hierarchy</div>
      <TypeSpec
        label="Hero display"
        meta="Urbanist 800 · 120–168px · −0.04em · 0.92 lh · UPPER"
        sample={<div style={{ fontSize: 88, fontWeight: 800, lineHeight: 0.92, letterSpacing: "-0.04em", textTransform: "uppercase" }}>SOCIAL PET CARE</div>}
      />
      <TypeSpec
        label="Editorial headline"
        meta="Urbanist 700 · 56–80px · −0.025em · 1.0 lh · Title or UPPER"
        sample={<div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.0, letterSpacing: "-0.025em" }}>Because they're family.</div>}
      />
      <TypeSpec
        label="Asterisk eyebrow"
        meta="Urbanist 700 · 14–16px · 0.16em · UPPER · Huddle Blue"
        sample={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Asterisk size={28}/>
            <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--huddle-blue)" }}>Every lost soul has a story</span>
          </div>
        }
      />
      <TypeSpec
        label="Supporting"
        meta="Urbanist 500 · 16–20px · 1.4 lh · sentence case"
        sample={<div style={{ fontSize: 18, fontWeight: 500, color: "var(--huddle-blue)" }}>they just need someone to see it</div>}
      />
      <TypeSpec
        label="Body"
        meta="Urbanist 400 · 14–16px · 1.55 lh"
        sample={<div style={{ fontSize: 15, lineHeight: 1.55, maxWidth: 460, color: "var(--fg-1)" }}>We take Marketplace personally and work hard to keep it trusted. Every member is verified before a single message is sent.</div>}
      />
      <TypeSpec
        label="Caption / meta"
        meta="Urbanist 600 · 11px · 0.16em · UPPER"
        sample={<div className="upper" style={{ fontSize: 11, color: "var(--fg-2)" }}>Lost pet alerts · Verified profiles · Real community</div>}
      />

      <div className="gb-subhead">Do &amp; don't</div>
      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <div className="card-eyebrow">Do</div>
            <span className="card-tag tag-do">✓</span>
          </div>
          <ul style={{ paddingLeft: 18, lineHeight: 1.7, fontSize: 14, color: "var(--fg-1)", margin: 0 }}>
            <li>Set headlines flush-left, ragged-right.</li>
            <li>Color one half of a headline Coral, the other White or Blue.</li>
            <li>Use italic 600 for emphasis inside a sentence — not for whole headlines.</li>
            <li>Use the brand <strong>huddle</strong> in lowercase, even at 168px.</li>
          </ul>
        </div>
        <div className="card">
          <div className="card-head">
            <div className="card-eyebrow">Don't</div>
            <span className="card-tag tag-dont">✕</span>
          </div>
          <ul style={{ paddingLeft: 18, lineHeight: 1.7, fontSize: 14, color: "var(--fg-1)", margin: 0 }}>
            <li>Don't justify or center display type — it kills the editorial feel.</li>
            <li>Don't outline, drop-shadow, or 3D-extrude the type.</li>
            <li>Don't pair Urbanist with a second display face. Ever.</li>
            <li>Don't ALL-CAPS body copy. Sentence case stays human.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function Spec({ label, value }) {
  return (
    <div>
      <div className="upper muted" style={{ fontSize: 10 }}>{label}</div>
      <div className="mono" style={{ marginTop: 4, color: "var(--fg-1)" }}>{value}</div>
    </div>
  );
}
function TypeSpec({ label, meta, sample }) {
  return (
    <div className="type-spec" style={{ marginBottom: 16 }}>
      <div>
        <div className="label">{label}</div>
        <div className="meta">{meta}</div>
      </div>
      <div>{sample}</div>
    </div>
  );
}

/* ============================================================
   Voice & captions
   ============================================================ */
function SectionVoice() {
  return (
    <section className="gb" id="voice">
      <div className="gb-head">
        <div><div className="gb-num">04 — Voice</div></div>
        <div>
          <h2 className="gb-title">Calm <em style={{fontStyle:"italic", fontWeight:600}}>everywhere</em>.<br/>Bold <span style={{color:"var(--coral-orange)"}}>on the cover.</span></h2>
          <p className="gb-lede">
            In the app: a trusted neighbour. On social: the same neighbour with a megaphone — louder, funnier, never alarmist.
            We are first-person plural for the brand, second-person for the reader. We never use third-person "the user."
          </p>
        </div>
      </div>

      <div className="gb-subhead">Four caption families</div>
      <p className="gb-p">Use these as starting frames. Mix the headline (loud, on-image) with a caption (calm, in-feed).</p>

      <div className="gb-subhead" style={{ color: "var(--coral-orange)" }}>Educational — pet-care wisdom</div>
      <div className="cap-list">
        <Cap tag="60–90 chars">A new home is a new world. Give your rescue 3 days to decompress, 3 weeks to learn your routine, 3 months to feel safe.</Cap>
        <Cap tag="Tip thread">Hot pavement check: hold the back of your hand to the asphalt for 7 seconds. If you can't, your dog can't.</Cap>
        <Cap tag="Friendly">Your cat isn't ignoring you. They're a small, silent observer. That's the whole job.</Cap>
        <Cap tag="Wisdom">A tired dog is a happy dog. A bored dog is a furniture-eating dog.</Cap>
        <Cap tag="Seasonal">First fireworks night of the year? Drawn curtains, low TV, a chew toy, and you on the floor next to them. That's it.</Cap>
        <Cap tag="Health">Vaccinations aren't an event. They're a 14-year subscription to a quieter life.</Cap>
        <Cap tag="Gentle">"Sit" before food. Not because they have to earn it — because predictability is love.</Cap>
        <Cap tag="Practical">Microchip first, collar second, photo third. In that order, every time.</Cap>
        <Cap tag="Counter-intuitive">Don't punish a fearful dog. You're proving the room is dangerous.</Cap>
        <Cap tag="Reframe">"Stubborn" is usually "I don't understand what you want yet."</Cap>
      </div>

      <div className="gb-subhead" style={{ color: "var(--coral-orange)" }}>Emotional — community &amp; family</div>
      <div className="cap-list">
        <Cap tag="Manifesto">Every lost soul has a story. They just need someone to see it.</Cap>
        <Cap tag="Belonging">If your album is 80% pet photos, you're in the right place.</Cap>
        <Cap tag="Inclusive">No pet yet? You're still part of the huddle. We saved you a seat.</Cap>
        <Cap tag="Quiet">Family isn't defined by blood. It's defined by who's waiting at the door.</Cap>
        <Cap tag="Story-led">Maya was missing for 11 days. The huddle she's in found her in 11 hours.</Cap>
        <Cap tag="Empathy">Grief, when a pet goes, is real grief. We say it loud so you don't have to whisper.</Cap>
        <Cap tag="Welcome">Every member starts as a stranger. Most of them stop pretty quickly.</Cap>
        <Cap tag="Thank-you">To the neighbour who shared the alert at 2am: you don't know us, but our dog is home because of you.</Cap>
        <Cap tag="Invitation">There's a group chat for your block. We started it. You can take it from here.</Cap>
        <Cap tag="Soft">A quiet evening, a snoring dog, the sound of someone you love. That's a good week.</Cap>
      </div>

      <div className="gb-subhead" style={{ color: "var(--coral-orange)" }}>Promotional — features &amp; tiers</div>
      <div className="cap-list">
        <Cap tag="Feature">The only swipe your partner approved. New pet on the block — meet them on huddle.</Cap>
        <Cap tag="Service">Pet Nanny, Pet Groomer, Licensed Vet. Every Marketplace pro is verified before they appear.</Cap>
        <Cap tag="Premium">Premium isn't a paywall. It's the version that takes the friction out.</Cap>
        <Cap tag="Gold">Gold adds Stars — say hi to anyone, even before you've met. Use them sparingly.</Cap>
        <Cap tag="Specific">Set a 10km, 24h alert. Stop refreshing your neighbour's stories at midnight.</Cap>
        <Cap tag="Direct">Two taps to broadcast. Forty-three eyes to find them.</Cap>
        <Cap tag="Truth">We charge for Premium so we don't have to sell your data. That's the whole sentence.</Cap>
        <Cap tag="Anti-FOMO">No streaks, no points, no badges-for-the-sake-of-it. Just a calmer feed.</Cap>
        <Cap tag="Specific-2">Family quota sharing on Gold: one plan, four members, four times the safety net.</Cap>
        <Cap tag="Service-2">Sitter cancelled? Open Marketplace, choose verified, book in two minutes. Bring the kettle.</Cap>
      </div>

      <div className="gb-subhead" style={{ color: "var(--coral-orange)" }}>Community spotlight — member voice</div>
      <div className="cap-list">
        <Cap tag="Quote">"I joined for Cleo. I stayed for the people who help me find her when she sneaks out." — Asha, with Cleo, age 4.</Cap>
        <Cap tag="Story">Three years ago, Theo's old block didn't know his name. Today, eight neighbours know when he's due his walk.</Cap>
        <Cap tag="Profile">Meet Rin. Pet Nanny by morning, agility coach by afternoon, marshmallow by evening. Verified since '24.</Cap>
        <Cap tag="Local">Sai Ying Pun's lost-pet response time, October: 2h 18m. November: 47 minutes. We see you, Sai Ying Pun.</Cap>
        <Cap tag="Praise">Shoutout to the SoHo huddle group — 312 members, 0 unanswered alerts this month.</Cap>
        <Cap tag="Mod">Group leaders aren't volunteers. They're neighbours we ask, neighbours we thank, and neighbours we equip.</Cap>
        <Cap tag="Gentle">A new member joined today and asked, "Is this the place to talk about my hamster?" Reader, it absolutely is.</Cap>
        <Cap tag="IRL">Saturday's Coffee &amp; Cubs meet at Tamar Park: 38 humans, 17 dogs, 1 cat in a stroller. Same time next month.</Cap>
        <Cap tag="Ask">Tell us about the neighbour who knows your dog's name. We want to write about them.</Cap>
        <Cap tag="Birthday">Today, huddle is two. Two years of someone always being awake when you need them.</Cap>
      </div>

      <div className="gb-subhead">Voice rules at a glance</div>
      <div className="grid-2">
        <div className="cap"><span className="cap-tag">Do</span>Say <strong>huddle</strong> — lowercase, always, even at 168px.</div>
        <div className="cap bad"><span className="cap-tag">Don't</span><del>Huddle™ revolutionizes pet-parent engagement.</del></div>
        <div className="cap"><span className="cap-tag">Do</span>Use sentence case for body, UPPER only for display.</div>
        <div className="cap bad"><span className="cap-tag">Don't</span><del>EVERY POST IN ALL CAPS, EVEN IN THE COMMENTS.</del></div>
        <div className="cap"><span className="cap-tag">Do</span>Reserve the word <em>Emergency</em> for Lost Pet alerts.</div>
        <div className="cap bad"><span className="cap-tag">Don't</span><del>EMERGENCY: 30% off Premium today only!!!</del></div>
        <div className="cap"><span className="cap-tag">Do</span>Em-dash for asides, middle-dot · for metadata.</div>
        <div className="cap bad"><span className="cap-tag">Don't</span><del>Use !!! or ??? to manufacture urgency.</del></div>
      </div>
    </section>
  );
}
function Cap({ tag, children }) {
  return (
    <div className="cap">
      <span className="cap-tag">{tag}</span>
      {children}
    </div>
  );
}

Object.assign(window, { SectionLogo, SectionColor, SectionType, SectionVoice });
