/* sections-illustration.jsx — v4
   Two-register illustration system, documented vividly enough for AI generation.
   No more inline-SVG cast — use real reference PNGs as canonical examples.
*/

function SectionIllustration() {
  return (
    <section className="gb" id="illustration">
      <div className="gb-head">
        <div><div className="gb-num">05 — Illustration</div></div>
        <div>
          <h2 className="gb-title">Two registers, <span style={{color:"var(--coral-orange)", fontStyle:"italic"}}>one family.</span></h2>
          <p className="gb-lede">
            huddle uses two complementary illustration styles. They share the same blue, the same warmth, the same hand-drawn confidence — but they do different jobs.
            Every post commissions illustration in <strong>one</strong> of these registers (mixing within a single panel is allowed, see Mixed Register below, but never mid-stroke).
          </p>
        </div>
      </div>

      <div className="gb-subhead">Register A · Modern Flat</div>
      <div className="grid-2">
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <img src="assets/ref-illus-cast.png" alt="Modern flat cast" style={{ width: "100%", display: "block" }}/>
        </div>
        <div className="card">
          <div className="gb-h3">When to use</div>
          <p className="gb-p">Feature spotlights, marketplace tiles, lifestyle moments, app-screen contents. Anything that needs to feel <strong>modern, optimistic, app-like</strong>.</p>
          <div className="gb-h3" style={{ marginTop: 16 }}>Style spec · vivid</div>
          <ul style={{ fontSize: 13, lineHeight: 1.65, paddingLeft: 18, margin: 0, color: "#1A1A1F" }}>
            <li><strong>Line:</strong> ~3px clean monoline ink in <strong>black (#0E0E10)</strong>, rounded terminals, slight blocky character. Confident curves, NOT vector-perfect — small wobble is correct.</li>
            <li><strong>Hair / dark mass:</strong> solid black silhouette as a single shape. No strands, no detail. Bowl-cut or simple chin-length is canonical.</li>
            <li><strong>Garment fill:</strong> exactly <strong>one</strong> piece of clothing filled flat in <strong>huddle-blue (#2145CF)</strong>. Sweater, t-shirt, or apron. Never two blue garments per character.</li>
            <li><strong>Skin:</strong> left as paper-cream — no fill, no shading.</li>
            <li><strong>Faces:</strong> two dot eyes, optional one-curve smile, occasional pink cheek dot. No nose unless animal.</li>
            <li><strong>Animals:</strong> drawn in the same line weight, fur indicated by short ticks not full hatching. Tiny blue heart-collar or accent mark optional.</li>
            <li><strong>Backgrounds:</strong> none — characters float on cream paper. Ground line allowed (single short stroke under feet).</li>
            <li><strong>Composition:</strong> 3/4 view, knees-up or full-body sitting. Characters interact with animals at their scale (not towering).</li>
          </ul>
          <div className="gb-h3" style={{ marginTop: 18 }}>AI prompt template</div>
          <div className="mono" style={{ fontSize: 11, background: "#0E0E10", color: "#9DD9F4", padding: "12px 14px", borderRadius: 6, lineHeight: 1.55, overflow: "auto" }}>
{`Modern flat character illustration, single character, 3/4 view, simple bowl-cut black hair as solid silhouette, clean ~3px black line ink with rounded terminals, ONE garment filled flat huddle-blue (#2145CF), skin left unfilled (cream paper), two dot eyes, no nose, optional one-line smile, [SCENE: e.g. kneeling beside a wet puppy in a cardboard box], floating on cream background no scenery, slight hand-drawn wobble not vector-perfect, friendly modern editorial style, reference: Daniel Kwok / Gabriella Sanchez --no gradients --no shading --no two color fills`}
          </div>
        </div>
      </div>

      <div className="gb-subhead" style={{ marginTop: 36 }}>Register B · Pencil Sketch</div>
      <div className="grid-2">
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <img src="assets/ref-cover-key.png" alt="Pencil sketch register" style={{ width: "100%", display: "block" }}/>
        </div>
        <div className="card">
          <div className="gb-h3">When to use</div>
          <p className="gb-p">Manifesto posters, editorial covers, emotional storytelling moments, phone-mockup screens. Anything that needs <strong>warmth, gravity, vulnerability</strong>.</p>
          <div className="gb-h3" style={{ marginTop: 16 }}>Style spec · vivid</div>
          <ul style={{ fontSize: 13, lineHeight: 1.65, paddingLeft: 18, margin: 0, color: "#1A1A1F" }}>
            <li><strong>Medium:</strong> graphite pencil / charcoal on cream paper. Visible grain, smudge, eraser marks. Not digital line art with a "pencil filter".</li>
            <li><strong>Line quality:</strong> variable weight — pressed harder on outlines, lighter on interior detail. Clear hand tremor. Some lines doubled or ghosted.</li>
            <li><strong>Shading:</strong> hatching and cross-hatching for shadow planes. Smudged graphite for soft tone. Strong contrast between light and shadow.</li>
            <li><strong>Color:</strong> mostly grayscale graphite. Single accent of <strong>huddle-blue (#2145CF)</strong> applied flat — typically map pin centers, dog collar, water droplets, or a single garment. Rare coral accent allowed.</li>
            <li><strong>Subject matter:</strong> phones (always pencil-drawn, never stock-photo), hands holding things, weather (rain hatch lines), animals being held or comforted, urban props (lampposts, mailboxes).</li>
            <li><strong>Ground / context:</strong> light shadow puddle under subject, optional. Otherwise floats on cream paper.</li>
          </ul>
          <div className="gb-h3" style={{ marginTop: 18 }}>AI prompt template</div>
          <div className="mono" style={{ fontSize: 11, background: "#0E0E10", color: "#9DD9F4", padding: "12px 14px", borderRadius: 6, lineHeight: 1.55, overflow: "auto" }}>
{`Hand-drawn graphite pencil illustration on cream paper, [SUBJECT: e.g. a smartphone showing a map with three location pins], visible pencil grain and smudges, variable line weight, cross-hatching for shadow, clear hand tremor not digital, mostly grayscale, single flat huddle-blue accent (#2145CF) on [pin centers / collar / water droplets only], subtle ground shadow, no background scenery, traditional pencil sketch aesthetic, reference: editorial illustration on newsprint --no digital pencil filter --no perfect lines --no full color`}
          </div>
        </div>
      </div>

      <div className="gb-subhead" style={{ marginTop: 36 }}>Mixed register · ref examples</div>
      <p className="gb-p">Some posts pair both registers in one canvas — the modern-flat character anchors the human moment, the pencil sketch carries the product or environmental context. Always physically separate them (one left, one right; one foreground, one background) — never overlap.</p>
      <div className="grid-3">
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <img src="assets/ref-content-4.png" alt="Mixed register example" style={{ width: "100%", display: "block" }}/>
          <div style={{ padding: 14 }}>
            <div className="upper" style={{ color: "var(--huddle-blue)", fontWeight: 700, fontSize: 11 }}>Mixed · pencil phone + flat character</div>
            <div style={{ fontSize: 12, color: "#1A1A1F", marginTop: 4 }}>Phone (Register B, top-right) carries the product. Girl with dog (Register A, bottom-left) carries the emotion.</div>
          </div>
        </div>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <img src="assets/ref-content-5.png" alt="Mixed register example" style={{ width: "100%", display: "block" }}/>
          <div style={{ padding: 14 }}>
            <div className="upper" style={{ color: "var(--huddle-blue)", fontWeight: 700, fontSize: 11 }}>Mixed · flat character + pencil app screen</div>
            <div style={{ fontSize: 12, color: "#1A1A1F", marginTop: 4 }}>Pencil-rendered phone holds a Register A character inside its screen — register-within-register is OK when the inner illustration is clearly diegetic (on-screen).</div>
          </div>
        </div>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <img src="assets/ref-content-6.png" alt="Pencil only example" style={{ width: "100%", display: "block" }}/>
          <div style={{ padding: 14 }}>
            <div className="upper" style={{ color: "var(--huddle-blue)", fontWeight: 700, fontSize: 11 }}>Pencil only · phone showcase</div>
            <div style={{ fontSize: 12, color: "#1A1A1F", marginTop: 4 }}>When the product itself is the hero, lean fully into Register B. The pencil treatment makes screenshots feel handmade rather than corporate.</div>
          </div>
        </div>
      </div>

      <div className="gb-subhead" style={{ marginTop: 36 }}>Don'ts · both registers</div>
      <div className="grid-3">
        <DontTile label="No gradients">
          <div style={{ width: 100, height: 100, borderRadius: "50%", background: "linear-gradient(135deg, var(--huddle-blue), var(--coral-orange))" }}/>
        </DontTile>
        <DontTile label="No drop shadows on subjects">
          <div style={{ filter: "drop-shadow(4px 6px 6px rgba(0,0,0,0.4))", color: "var(--huddle-blue)", fontSize: 56, fontWeight: 800 }}>★</div>
        </DontTile>
        <DontTile label="No emoji mixing">
          <div style={{ fontSize: 56 }}>🐶❤️</div>
        </DontTile>
        <DontTile label="No two-tone color fills">
          <svg width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="36" fill="var(--huddle-blue)"/><circle cx="50" cy="50" r="20" fill="var(--coral-orange)"/></svg>
        </DontTile>
        <DontTile label="No digital pencil filters">
          <div style={{ fontFamily: "Caveat, cursive", fontSize: 28, color: "#666" }}>fake pencil</div>
        </DontTile>
        <DontTile label="No 3D / isometric">
          <svg width="100" height="100" viewBox="0 0 100 100"><polygon points="50,15 85,35 85,75 50,95 15,75 15,35" fill="var(--huddle-blue)" opacity="0.4"/></svg>
        </DontTile>
      </div>
    </section>
  );
}

function DontTile({ label, children }) {
  return (
    <div className="card" style={{ padding: 24, position: "relative", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 100, opacity: 0.55 }}>{children}</div>
      <div className="upper" style={{ color: "#B91C1C", fontWeight: 700, marginTop: 12, textAlign: "center" }}>✕ {label}</div>
    </div>
  );
}

function SectionPhone() {
  return (
    <section className="gb" id="phone">
      <div className="gb-head">
        <div><div className="gb-num">06 — Phone mockup</div></div>
        <div>
          <h2 className="gb-title">A <em style={{fontStyle:"italic", fontWeight:600, color:"var(--huddle-blue)"}}>pencil-drawn</em> phone, never a real one.</h2>
          <p className="gb-lede">
            Stock-photo phones break the spell. Every device in our communication is rendered in <strong>Register B (pencil sketch)</strong> — visible graphite, hand tremor, slight body-tilt, optional ground shadow. The screen contents inside can be Register A (flat) when they're showing app UI, OR pencil when showing a map / generic content.
          </p>
        </div>
      </div>
      <div className="grid-2">
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <img src="assets/ref-content-4.png" alt="Pencil phone with map" style={{ width: "100%", display: "block" }}/>
          <div style={{ padding: 14 }}>
            <div className="upper" style={{ color: "var(--huddle-blue)", fontWeight: 700, fontSize: 11 }}>Pencil phone · pencil screen (map)</div>
            <div style={{ fontSize: 12, color: "#1A1A1F", marginTop: 4 }}>Map content stays in pencil. Pin centers and accent dots in flat huddle-blue.</div>
          </div>
        </div>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <img src="assets/ref-content-5.png" alt="Pencil phone with flat UI" style={{ width: "100%", display: "block" }}/>
          <div style={{ padding: 14 }}>
            <div className="upper" style={{ color: "var(--huddle-blue)", fontWeight: 700, fontSize: 11 }}>Pencil phone · flat UI inside</div>
            <div style={{ fontSize: 12, color: "#1A1A1F", marginTop: 4 }}>When the phone is showing real product UI, the screen flips to Register A. The bezel always stays pencil.</div>
          </div>
        </div>
      </div>
      <div className="gb-subhead">Phone-bezel spec · pencil</div>
      <div className="card">
        <ul style={{ fontSize: 13, lineHeight: 1.7, paddingLeft: 18, margin: 0, color: "#1A1A1F" }}>
          <li>Generic modern smartphone shape — soft-rounded corners, no notch, no brand bezel</li>
          <li>Body outlined in single press-varied graphite line (~3–5mm rendered scale), with a thinner inner stroke around the screen</li>
          <li>Tiny circular speaker line and home-button or chin-bar — sketched, not perfect</li>
          <li>Subtle smudge shadow under the device + on the back-side edge for body roundness</li>
          <li>Typically tilted 4–8° off vertical so it reads as held, not photographed</li>
        </ul>
      </div>
    </section>
  );
}

function SectionCTA() {
  return (
    <section className="gb" id="cta">
      <div className="gb-head">
        <div><div className="gb-num">07 — CTA lockup</div></div>
        <div>
          <h2 className="gb-title">The search-bar <em style={{fontStyle:"italic", fontWeight:600, color:"var(--coral-orange)"}}>signature.</em></h2>
          <p className="gb-lede">
            Every social post or print piece ends with the same lockup — outlined pill, bear-mark left, wordmark middle, click-cursor escaping the right edge. It reads as a typed search query, because that's the action we want.
          </p>
        </div>
      </div>
      <div className="grid-3">
        <div className="card center" style={{ padding: 40, background: "#FCFAF6" }}>
          <SearchBarLockup/>
          <div className="upper muted" style={{ marginTop: 24 }}>Default · on cream</div>
        </div>
        <div className="card center" style={{ padding: 40, background: "var(--huddle-blue)", border: "none" }}>
          <SearchBarLockup invert={true}/>
          <div className="upper" style={{ marginTop: 24, color: "rgba(255,255,255,0.75)" }}>Inverted · on huddle-blue</div>
        </div>
        <div className="card center" style={{ padding: 40, background: "#FCFAF6" }}>
          <SearchBarLockup lime={true}/>
          <div className="upper muted" style={{ marginTop: 24 }}>Lime · campaigns</div>
        </div>
      </div>
    </section>
  );
}

Object.assign(window, { SectionIllustration, SectionPhone, SectionCTA, DontTile });
