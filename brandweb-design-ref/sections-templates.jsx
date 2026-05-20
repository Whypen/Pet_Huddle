/* sections-templates.jsx — v4
   ANCHORED ON ACTUAL REFERENCES.
   The guidebook documents posts using the real ref PNGs as canonical examples,
   then explains the rules with annotated overlays. NO redrawing of refs.
*/

const REFS = [
  { src: "assets/ref-content-4.png", title: "01 · Hero · Pencil-sketch register", caption: "Asterisk + headline left · pencil illustration right · search-lockup base", role: "manifesto" },
  { src: "assets/ref-content-5.png", title: "02 · Feature spotlight · Mixed register", caption: "Modern-flat character + pencil phone-mockup · two-tone caption", role: "feature" },
  { src: "assets/ref-content-6.png", title: "03 · Pencil phone showcase", caption: "Phone left · headline right · italic sub · search-lockup base", role: "showcase" },
  { src: "assets/ref-cover.png", title: "04 · Editorial cover · Italic serif", caption: "Coral italic serif display · stacked composition", role: "cover" },
  { src: "assets/ref-cover-key.png", title: "05 · Manifesto cover · Pencil hero", caption: "Full-bleed pencil illustration · oversized italic serif", role: "cover" },
  { src: "assets/ref-content-1.png", title: "06 · Cast tile-set · Modern flat register", caption: "Six framed character vignettes · single ink + blue fill", role: "cast" },
  { src: "assets/ref-content-2.png", title: "07 · Editorial spread", caption: "Single character composition · two-line headline", role: "feature" },
  { src: "assets/ref-content-3.png", title: "08 · Lifestyle moment", caption: "Character-led · spot illustration support", role: "feature" },
];

function RefPostCard({ src, title, caption }) {
  return (
    <div className="template-card">
      <div className="template-meta">
        <div className="template-title">{title}</div>
        <div className="template-caption">{caption}</div>
      </div>
      <div className="template-frame" style={{ background: "#FCFAF6", aspectRatio: "4/5", overflow: "hidden", border: "1px solid rgba(0,0,0,0.08)" }}>
        <img src={src} alt={title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} draggable={false}/>
      </div>
    </div>
  );
}

function AnatomyOverlay() {
  return (
    <div style={{ position: "relative", aspectRatio: "4/5", background: "#FCFAF6", border: "1px solid rgba(0,0,0,0.08)", overflow: "hidden" }}>
      <img src="assets/ref-content-4.png" alt="anatomy" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.45 }}/>
      <Annot top="6%" left="4%" right="60%" color="var(--coral-orange)" label="A · Torn paper top band" desc="3–6% of canvas · cream paper revealed"/>
      <Annot top="18%" left="6%" right="55%" color="var(--huddle-blue)" label="B · Asterisk mark" desc="Sized 1× headline cap-height"/>
      <Annot top="28%" left="12%" right="38%" color="var(--huddle-blue)" label="C · Headline · condensed sans caps" desc="Anton / Bebas-style · ALL CAPS · tight tracking"/>
      <Annot top="44%" left="12%" right="50%" color="var(--huddle-blue)" label="D · Sub-caption" desc="Urbanist 500 · sentence case · half headline size"/>
      <Annot top="55%" left="55%" right="6%" color="var(--coral-orange)" label="E · Pencil-sketch illustration" desc="Charcoal/graphite · hatched shading · hand tremor"/>
      <Annot top="78%" left="6%" right="55%" color="var(--huddle-blue)" label="F · Modern-flat illustration" desc="Black hair · blue garment fill · clean line"/>
      <Annot top="90%" left="22%" right="22%" color="var(--coral-orange)" label="G · Search-bar lockup · base"/>
      <Annot top="95%" left="20%" right="20%" color="var(--coral-orange)" label="H · Torn paper bottom band"/>
    </div>
  );
}

function Annot({ top, left, right, color, label, desc }) {
  return (
    <div style={{ position: "absolute", top, left, right, border: `1.5px dashed ${color}`, padding: "4px 8px", borderRadius: 4, background: "rgba(255,255,255,0.85)", pointerEvents: "none" }}>
      <div style={{ fontFamily: "Urbanist", fontWeight: 700, fontSize: 10, color, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      {desc && <div style={{ fontSize: 9, color: "#1A1A1F", marginTop: 1, lineHeight: 1.3 }}>{desc}</div>}
    </div>
  );
}

function SectionTemplates() {
  return (
    <section className="gb" id="templates">
      <div className="gb-eyebrow">section · 09</div>
      <h2 className="gb-h2">Post templates</h2>
      <p className="gb-lead">
        Eight canonical compositions, anchored on real production posts. Use these as your starting point — match the layout, swap the words, commission new illustration in the documented register.
      </p>

      <div style={{ background: "var(--bg-blue-soft)", border: "1px solid rgba(33,69,207,0.18)", padding: "16px 20px", borderRadius: 8, marginBottom: 28 }}>
        <div className="upper" style={{ fontWeight: 700, color: "var(--huddle-blue)", fontSize: 11, marginBottom: 6 }}>Composition rules · all posts</div>
        <ul style={{ fontSize: 14, color: "#1A1A1F", lineHeight: 1.6, paddingLeft: 18, margin: 0 }}>
          <li>Background is always cream paper (<code>#FCFAF6</code>) — never pure white</li>
          <li>Torn-paper bands top + bottom — 3–6% of canvas height each, with subtle paper-edge shadow</li>
          <li>Asterisk * mark in huddle-blue anchors every headline (top-left of type block)</li>
          <li>Headline = condensed sans display, ALL CAPS, huddle-blue (or coral italic serif for editorial)</li>
          <li>Sub-caption = Urbanist 500, sentence case, ~50% of headline cap-height</li>
          <li>Search-bar lockup pinned to base of every canvas — never absent</li>
        </ul>
      </div>

      <div className="gb-subhead">Anatomy</div>
      <div className="grid-2">
        <AnatomyOverlay/>
        <div>
          <p className="gb-p" style={{ marginTop: 0 }}>Every post can be deconstructed into eight named slots. The first job of any new post is to identify which slots it needs and which it skips. The base layer (paper + torn bands + lockup) never changes.</p>
          <ul style={{ fontSize: 13, color: "#1A1A1F", lineHeight: 1.7, paddingLeft: 0, listStyle: "none", margin: 0 }}>
            <li><strong style={{ color: "var(--coral-orange)" }}>A</strong> &nbsp; Torn paper top — fixed</li>
            <li><strong style={{ color: "var(--huddle-blue)" }}>B</strong> &nbsp; Asterisk — always present, scales to cap-height</li>
            <li><strong style={{ color: "var(--huddle-blue)" }}>C</strong> &nbsp; Headline — condensed caps, max 2 lines</li>
            <li><strong style={{ color: "var(--huddle-blue)" }}>D</strong> &nbsp; Sub-caption — optional</li>
            <li><strong style={{ color: "var(--coral-orange)" }}>E</strong> &nbsp; Pencil illustration — manifesto register</li>
            <li><strong style={{ color: "var(--huddle-blue)" }}>F</strong> &nbsp; Modern-flat illustration — feature register</li>
            <li><strong style={{ color: "var(--coral-orange)" }}>G</strong> &nbsp; Search-lockup — fixed</li>
            <li><strong style={{ color: "var(--coral-orange)" }}>H</strong> &nbsp; Torn paper bottom — fixed</li>
          </ul>
        </div>
      </div>

      <div className="gb-subhead">Reference posts · 4:5</div>
      <div className="grid-3">
        {REFS.map(r => <RefPostCard key={r.src} {...r}/>)}
      </div>

      <div className="gb-subhead">Type system in posts</div>
      <div className="grid-3">
        <div className="card">
          <div style={{ fontFamily: "'Anton', 'Urbanist', sans-serif", fontSize: 56, lineHeight: 0.95, color: "var(--huddle-blue)", letterSpacing: "0.01em", textTransform: "uppercase" }}>
            Every<br/>lost soul
          </div>
          <div className="upper muted" style={{ marginTop: 16 }}>Headline · Anton 400 · ALL CAPS</div>
          <div className="mono muted">tracking +10 · leading 0.95</div>
        </div>
        <div className="card">
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 56, lineHeight: 0.95, color: "var(--coral-orange)", fontStyle: "italic" }}>
            Pet Care
          </div>
          <div className="upper muted" style={{ marginTop: 16 }}>Editorial display · DM Serif italic</div>
          <div className="mono muted">Reserved for cover/manifesto</div>
        </div>
        <div className="card">
          <div style={{ fontFamily: "Urbanist", fontWeight: 500, fontSize: 22, lineHeight: 1.4, color: "var(--huddle-blue)" }}>
            They just need someone to see it
          </div>
          <div className="upper muted" style={{ marginTop: 16 }}>Sub-caption · Urbanist 500</div>
          <div className="mono muted">Sentence case · ~40% of headline</div>
        </div>
      </div>
    </section>
  );
}

function SectionStories() {
  return (
    <section className="gb" id="stories">
      <div className="gb-eyebrow">section · 10</div>
      <h2 className="gb-h2">Story &amp; Reel</h2>
      <p className="gb-lead">
        Vertical surfaces follow the same anatomy as the 4:5 feed posts but reserve top 14% and bottom 14% as unsafe zones for platform UI overlays. Lockup moves to ~80% from the top so it stays clear of the reply bar.
      </p>
      <div className="card">
        <div style={{ fontSize: 14, color: "#1A1A1F", lineHeight: 1.6 }}>
          <strong style={{ color: "var(--huddle-blue)" }}>Recipe:</strong> use the same illustration + headline + lockup vocabulary, but stack vertically. Drop the sub-caption if space is tight. Keep the asterisk mark at the top of the headline block.
        </div>
      </div>
    </section>
  );
}

function SectionEmail() {
  return (
    <section className="gb" id="email">
      <div className="gb-eyebrow">section · 11</div>
      <h2 className="gb-h2">Email masthead</h2>
      <p className="gb-lead">
        Newsletter masthead. Solid huddle-blue band with the wordmark + bear lockup, issue number tag right-aligned. Body content below mirrors social composition rules.
      </p>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ background: "var(--huddle-blue)", padding: "32px 36px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <WordmarkBear height={42} variant="white"/>
          <div style={{ color: "white", fontFamily: "Urbanist", fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.85 }}>
            Issue 014 · Spring 2026
          </div>
        </div>
        <div style={{ padding: "36px 36px 36px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <Asterisk size={36}/>
            <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 44, lineHeight: 0.95, color: "var(--huddle-blue)", textTransform: "uppercase", letterSpacing: "0.01em" }}>
              What we learned<br/>building Stray Pin
            </div>
          </div>
          <div style={{ fontSize: 14, color: "#1A1A1F", lineHeight: 1.6, marginTop: 16, maxWidth: 560 }}>
            Six months of fieldwork with city councils, vets, and 400+ early users. Here's what changed our mind about lost pets, privacy, and why the new pin is incognito by default.
          </div>
          <div style={{ marginTop: 24 }}>
            <SearchBarLockup/>
          </div>
        </div>
        <div style={{ background: "var(--soc-lime)", padding: "28px 36px", display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 24, alignItems: "center" }}>
          <BMark size={32}/>
          <div>
            <div style={{ fontFamily: "Urbanist", fontWeight: 700, fontSize: 13, color: "#0E0E10", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              The Friday huddle
            </div>
            <div style={{ fontFamily: "Urbanist", fontWeight: 500, fontSize: 12, color: "#0E0E10", opacity: 0.75, marginTop: 2 }}>
              One email a week. Pets, neighbours, the occasional confession.
            </div>
          </div>
          <div style={{ display: "flex", gap: 16, fontSize: 11, fontFamily: "Urbanist", fontWeight: 600, color: "#0E0E10", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            <span>Reply</span>
            <span>·</span>
            <span>Forward</span>
            <span>·</span>
            <span>Unsubscribe</span>
          </div>
        </div>
        <div style={{ background: "var(--soc-lime)", padding: "0 36px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, fontFamily: "Urbanist", fontWeight: 600, color: "#0E0E10", letterSpacing: "0.08em", textTransform: "uppercase", borderTop: "1px solid rgba(14,14,16,0.12)", paddingTop: 16 }}>
          <span>huddle.app</span>
          <span>Hong Kong · made with care</span>
          <span>© 2026</span>
        </div>
      </div>
    </section>
  );
}

function SectionPrint() {
  return (
    <section className="gb" id="print">
      <div className="gb-eyebrow">section · 12</div>
      <h2 className="gb-h2">Print &amp; out-of-home</h2>
      <p className="gb-lead">
        Posters scale the social system to A2/A3 — same eight-slot anatomy, larger illustration, headline can grow to two-column. Stickers strip back to wordmark or bear-mark only on a single colour disc.
      </p>
      <div className="grid-3">
        <StickerTile bg="var(--soc-lime)"><Wordmark height={28}/></StickerTile>
        <StickerTile bg="var(--huddle-blue)"><BMark size={56} variant="white"/></StickerTile>
        <StickerTile bg="var(--coral-orange)">
          <div style={{ color: "white", fontFamily: "'Anton', sans-serif", fontSize: 22, lineHeight: 1.0, textTransform: "uppercase", textAlign: "center", letterSpacing: "0.04em" }}>
            stray<br/>spotter
          </div>
        </StickerTile>
      </div>
    </section>
  );
}

function StickerTile({ bg, children }) {
  return (
    <div style={{
      aspectRatio: "1/1", background: bg, borderRadius: "50%",
      display: "flex", alignItems: "center", justifyContent: "center",
      border: "8px solid white", boxShadow: "0 18px 36px -18px rgba(20,30,60,0.3)"
    }}>
      {children}
    </div>
  );
}

Object.assign(window, { SectionTemplates, SectionStories, SectionEmail, SectionPrint });
