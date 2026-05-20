/* primitives.jsx — shared social-vocab building blocks
   v3: Monoline-blue illustration cast, simplified chrome.
*/

const HBLUE = "var(--huddle-blue)";
const CORAL = "var(--coral-orange)";
const STROKE_WEIGHT = 4.2;
const STROKE_FINE = 2.6;

/* ============================================================
   Asterisk * mark — used in editorial captions, NOT in posts
   ============================================================ */
function Asterisk({ size = 32, color = HBLUE, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={style} aria-hidden="true">
      <g fill={color}>
        <path d="M48 6 C 50 6, 52 6, 54 8 L 55 38 C 54 42, 48 42, 47 38 L 48 6 Z" />
        <path d="M52 94 C 50 94, 48 94, 46 92 L 45 64 C 46 60, 52 60, 53 64 L 52 94 Z" />
        <path d="M6 48 C 6 50, 6 52, 8 54 L 38 55 C 42 54, 42 48, 38 47 L 6 48 Z" />
        <path d="M94 52 C 94 50, 94 48, 92 46 L 64 45 C 60 46, 60 52, 64 53 L 94 52 Z" />
        <path d="M16 18 C 18 16, 20 14, 22 16 L 42 36 C 44 40, 40 44, 36 42 L 16 22 C 14 20, 14 20, 16 18 Z" />
        <path d="M84 82 C 82 84, 80 86, 78 84 L 58 64 C 56 60, 60 56, 64 58 L 84 78 C 86 80, 86 80, 84 82 Z" />
        <path d="M82 16 C 84 18, 86 20, 84 22 L 64 42 C 60 44, 56 40, 58 36 L 78 16 C 80 14, 80 14, 82 16 Z" />
        <path d="M18 84 C 16 82, 14 80, 16 78 L 36 58 C 40 56, 44 60, 42 64 L 22 84 C 20 86, 20 86, 18 84 Z" />
      </g>
    </svg>
  );
}

/* ============================================================
   Click cursor — UI marker, not a post primitive
   ============================================================ */
function ClickCursor({ size = 26, color = HBLUE }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M7 5 L 7 22 L 12 18 L 14 24 L 17 23 L 15 17 L 22 17 Z"
        fill="white" stroke={color} strokeWidth="1.6" strokeLinejoin="round"/>
      <line x1="22" y1="6" x2="25" y2="3" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
      <line x1="25" y1="9" x2="28" y2="8" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
      <line x1="22" y1="13" x2="25" y2="14" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  );
}

/* ============================================================
   The canonical bear-mark (raster). variant: blue | white
   ============================================================ */
function BMark({ size = 28, variant = "blue", alt = "huddle bear mark" }) {
  const src = variant === "white"
    ? "assets/huddle-bear-mark-white.png"
    : "assets/huddle-bear-mark.png";
  return (
    <img src={src} alt={alt}
      style={{ height: size, width: "auto", display: "inline-block", verticalAlign: "middle" }}
      draggable={false}/>
  );
}

/* Wordmark — Marshmallow Bounce logotype.
   variant: blue (default) | white | lime | coral | coral-shadow | full
   "full" = bear-face variant with eyes+smile in the e */
function Wordmark({ height = 36, variant = "blue", alt = "huddle" }) {
  const MAP = {
    "blue":          "assets/wordmark-blue.png",
    "white":         "assets/wordmark-white.png",
    "lime":          "assets/wordmark-lime.png",
    "coral":         "assets/wordmark-coral.png",
    "coral-shadow":  "assets/wordmark-coral-shadow.png",
    "full":          "assets/wordmark-full.png",
    "full-white":    "assets/wordmark-full-white.png",
  };
  const src = MAP[variant] || MAP.blue;
  return (
    <img src={src} alt={alt}
      style={{ height, width: "auto", display: "inline-block", verticalAlign: "middle" }}
      draggable={false}/>
  );
}

/* Convenience alias for the full bear-face wordmark */
function WordmarkBear({ height = 36, variant = "blue", alt = "huddle" }) {
  const v = variant === "white" ? "full-white" : "full";
  return <Wordmark height={height} variant={v} alt={alt}/>;
}

/* ============================================================
   "huddle" search-bar lockup — pill + b-mark + wordmark + cursor
   Width auto-sizes to content; pass `compact` to shrink.
   ============================================================ */
function SearchBarLockup({ invert = false, lime = false, compact = false }) {
  const cls = "lockup" + (invert ? " invert" : "") + (lime ? " lime" : "") + (compact ? " compact" : "");
  const cursorColor = invert ? "white" : (lime ? "#0E0E10" : HBLUE);
  const wmVariant = invert || lime ? "blue" : "blue";
  return (
    <div className={cls}>
      <BMark size={compact ? 18 : 22} variant={invert ? "white" : "blue"}/>
      <Wordmark height={compact ? 14 : 18} variant={invert ? "white" : "blue"}/>
      <span className="lockup-cursor"><ClickCursor color={cursorColor} size={compact ? 16 : 20}/></span>
    </div>
  );
}

/* ============================================================
   Carousel dot indicator — top-right of carousel posts
   ============================================================ */
function CarouselDots({ count = 5, active = 0, color = CORAL, size = 14 }) {
  return (
    <div style={{ display: "flex", gap: 6 }} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} style={{
          width: size, height: size, borderRadius: "50%",
          border: `2px solid ${color}`,
          background: i === active ? color : "transparent",
          display: "block"
        }}/>
      ))}
    </div>
  );
}

/* ============================================================
   Coral right-arrow — bottom-right of carousel posts ("swipe →")
   ============================================================ */
function SwipeArrow({ size = 56, color = CORAL }) {
  return (
    <svg width={size} height={size * 0.45} viewBox="0 0 120 54" fill="none" aria-hidden="true">
      <path d="M6 27 L 110 27 M 88 8 L 110 27 L 88 46"
            stroke={color} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

/* ============================================================
   MARKER HEADLINE — uses Urbanist heavy with rough text-stroke effect
   to mimic the marker-drawn quality of references.
   `band` true = reversed on blue block, false = blue on cream.
   ============================================================ */
function MarkerHeadline({ children, band = false, size = "clamp(28px, 5.4vw, 64px)", lines = 1, color }) {
  const c = color || (band ? "white" : HBLUE);
  const bg = band ? HBLUE : "transparent";
  return (
    <div style={{
      background: bg,
      padding: band ? "10px 20px" : 0,
      display: "inline-block",
      maxWidth: "100%"
    }}>
      <h2 className="marker-h" style={{
        fontFamily: "Urbanist, sans-serif",
        fontWeight: 800,
        fontSize: size,
        lineHeight: 1.02,
        letterSpacing: "-0.015em",
        textTransform: "uppercase",
        color: c,
        margin: 0,
        textShadow: band ? "none" : undefined
      }}>{children}</h2>
    </div>
  );
}

/* ============================================================
   Coral italic accent — for the EMOTIONAL word
   ============================================================ */
function CoralAccent({ children, size = "clamp(28px, 5.4vw, 64px)" }) {
  return (
    <span style={{
      fontFamily: "Urbanist, sans-serif",
      fontStyle: "italic",
      fontWeight: 800,
      fontSize: size,
      color: CORAL,
      letterSpacing: "-0.015em",
      textTransform: "uppercase",
      lineHeight: 1.02
    }}>{children}</span>
  );
}

/* ============================================================
   Friendly Outliner ILLUSTRATION CAST
   Locked aesthetic: huddle-blue monoline, no fills, no offsets.
   ~4.2px stroke for primary forms, ~2.6px for secondary lines.
   Hand-drawn confident curves, no perfectly geometric shapes.
   ============================================================ */

/* Walking person */
function IllusPerson({ size = 200 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 240" fill="none">
      <g stroke={HBLUE} strokeWidth={STROKE_WEIGHT} strokeLinecap="round" strokeLinejoin="round" fill="none">
        {/* Hair / head */}
        <path d="M82 48 Q 80 30 100 28 Q 122 28 124 48 Q 124 56 122 60"/>
        <path d="M82 50 Q 78 70 86 80 Q 94 88 100 88 Q 110 88 118 80 Q 124 72 122 58"/>
        <path d="M86 46 Q 90 36 104 36 Q 118 36 122 48 Q 122 42 118 36 Q 110 30 100 30 Q 90 30 86 38 Z"
              fill={HBLUE}/>
        {/* Face */}
        <circle cx="92" cy="64" r="1.6" fill={HBLUE}/>
        <circle cx="112" cy="64" r="1.6" fill={HBLUE}/>
        <path d="M99 73 Q 102 76 105 73" strokeWidth={STROKE_FINE}/>
        {/* Neck */}
        <path d="M96 90 L 96 100 M108 90 L 108 100"/>
        {/* Jacket — open collar, loose */}
        <path d="M70 110 Q 80 100 96 100 L 108 100 Q 124 100 132 112 L 134 168 Q 130 180 122 178 L 122 132"/>
        <path d="M82 100 Q 86 116 96 120"/>
        <path d="M118 100 Q 114 116 104 120"/>
        {/* Arms */}
        <path d="M70 112 Q 56 138 60 162 Q 62 174 72 172"/>
        <path d="M132 114 Q 144 142 138 168 Q 134 178 124 174"/>
        {/* Pants */}
        <path d="M86 168 L 84 220 Q 84 226 92 226 L 96 174"/>
        <path d="M116 168 L 118 220 Q 118 226 110 226 L 106 174"/>
        {/* Shoes */}
        <path d="M80 226 Q 76 232 90 232 Q 96 232 96 226"/>
        <path d="M122 226 Q 126 232 112 232 Q 106 232 106 226"/>
      </g>
    </svg>
  );
}

/* Friendly dog (sitting) */
function IllusDog({ size = 200 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 220 200" fill="none">
      <g stroke={HBLUE} strokeWidth={STROKE_WEIGHT} strokeLinecap="round" strokeLinejoin="round" fill="none">
        {/* Ears */}
        <path d="M58 50 Q 50 38 60 30 Q 70 28 76 42 Q 78 52 76 60"/>
        <path d="M132 50 Q 140 38 130 30 Q 120 28 114 42 Q 112 52 114 60"/>
        {/* Head */}
        <path d="M70 56 Q 60 78 70 96 Q 80 114 100 116 Q 122 116 132 100 Q 142 80 130 58 Q 116 46 100 46 Q 84 46 70 56 Z"/>
        {/* Eyes */}
        <ellipse cx="86" cy="78" rx="1.8" ry="2.4" fill={HBLUE} stroke="none"/>
        <ellipse cx="118" cy="78" rx="1.8" ry="2.4" fill={HBLUE} stroke="none"/>
        {/* Snout / nose */}
        <path d="M92 96 Q 100 102 110 96"/>
        <ellipse cx="101" cy="92" rx="3.5" ry="2.5" fill={HBLUE} stroke="none"/>
        {/* Body sitting */}
        <path d="M76 116 Q 60 134 60 166 Q 60 184 76 184 L 144 184 Q 158 184 158 168 Q 158 134 138 116"/>
        {/* Front legs */}
        <path d="M88 154 L 86 184" />
        <path d="M120 154 L 122 184"/>
        {/* Paw indications */}
        <path d="M78 184 Q 76 190 88 190 Q 92 190 92 184" strokeWidth={STROKE_FINE}/>
        <path d="M114 184 Q 114 190 126 190 Q 130 190 130 184" strokeWidth={STROKE_FINE}/>
        {/* Tail */}
        <path d="M154 150 Q 174 140 178 156 Q 178 168 168 168" />
        {/* Chest fluff hint */}
        <path d="M92 122 Q 100 130 108 122" strokeWidth={STROKE_FINE}/>
      </g>
    </svg>
  );
}

/* Cat (sitting) */
function IllusCat({ size = 200 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 220" fill="none">
      <g stroke={HBLUE} strokeWidth={STROKE_WEIGHT} strokeLinecap="round" strokeLinejoin="round" fill="none">
        {/* Ears (triangular) */}
        <path d="M62 60 L 50 24 L 80 48 Z"/>
        <path d="M138 60 L 150 24 L 120 48 Z"/>
        {/* Head */}
        <path d="M70 60 Q 60 80 70 100 Q 84 116 100 116 Q 116 116 130 100 Q 140 80 130 60 Q 116 50 100 50 Q 84 50 70 60 Z"/>
        {/* Eyes */}
        <path d="M82 78 Q 84 74 88 78" strokeWidth={STROKE_FINE}/>
        <path d="M112 78 Q 114 74 118 78" strokeWidth={STROKE_FINE}/>
        <ellipse cx="85" cy="80" rx="1.4" ry="2.2" fill={HBLUE} stroke="none"/>
        <ellipse cx="115" cy="80" rx="1.4" ry="2.2" fill={HBLUE} stroke="none"/>
        {/* Nose / mouth */}
        <path d="M97 92 L 100 96 L 103 92" strokeWidth={STROKE_FINE}/>
        <path d="M100 96 Q 96 100 92 98 M 100 96 Q 104 100 108 98" strokeWidth={STROKE_FINE}/>
        {/* Whiskers */}
        <path d="M68 92 L 86 92 M 68 96 L 86 96 M 132 92 L 114 92 M 132 96 L 114 96" strokeWidth={STROKE_FINE * 0.7}/>
        {/* Body sitting */}
        <path d="M84 116 Q 70 140 70 178 Q 70 196 86 196 L 130 196 Q 140 196 140 184 Q 140 150 130 116"/>
        {/* Front leg */}
        <path d="M104 158 L 104 196"/>
        {/* Tail curling */}
        <path d="M68 178 Q 50 178 48 162 Q 48 150 60 150"/>
      </g>
    </svg>
  );
}

/* Hand holding phone — simplified */
function IllusHandPhone({ size = 200 }) {
  return (
    <svg width={size} height={size * 1.1} viewBox="0 0 200 220" fill="none">
      <g stroke={HBLUE} strokeWidth={STROKE_WEIGHT} strokeLinecap="round" strokeLinejoin="round" fill="none">
        {/* Hand */}
        <path d="M40 200 Q 30 180 32 160 Q 34 140 50 134 Q 64 130 76 132"/>
        <path d="M40 200 L 100 200 Q 110 200 110 192 L 110 124"/>
        {/* Thumb */}
        <path d="M70 132 Q 80 122 92 124 Q 96 126 96 134 L 96 152"/>
        {/* Phone */}
        <rect x="70" y="40" width="92" height="160" rx="12"/>
        <rect x="78" y="58" width="76" height="124" rx="4" strokeWidth={STROKE_FINE}/>
        {/* Speaker */}
        <line x1="106" y1="50" x2="126" y2="50" strokeWidth={STROKE_FINE}/>
        {/* Screen content suggestion: huddle wordmark + map dot */}
        <circle cx="116" cy="120" r="12" strokeWidth={STROKE_FINE}/>
        <path d="M116 116 L 116 124 M 112 120 L 120 120" strokeWidth={STROKE_FINE}/>
      </g>
    </svg>
  );
}

/* Lamppost */
function IllusLamppost({ size = 120 }) {
  return (
    <svg width={size * 0.55} height={size} viewBox="0 0 80 200" fill="none">
      <g stroke={HBLUE} strokeWidth={STROKE_WEIGHT} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M40 196 L 40 60"/>
        <path d="M40 60 Q 40 36 64 36"/>
        <path d="M64 36 L 64 50 Q 60 64 50 64 Q 40 64 36 50 L 36 36 Z"/>
        <line x1="50" y1="64" x2="50" y2="74" strokeWidth={STROKE_FINE}/>
        <path d="M30 196 L 50 196" />
        <path d="M26 198 L 54 198"/>
      </g>
    </svg>
  );
}

/* Awning / shop window */
function IllusAwning({ size = 180 }) {
  return (
    <svg width={size} height={size * 0.9} viewBox="0 0 200 180" fill="none">
      <g stroke={HBLUE} strokeWidth={STROKE_WEIGHT} strokeLinecap="round" strokeLinejoin="round" fill="none">
        {/* Awning */}
        <path d="M20 50 L 180 50 L 170 80 L 30 80 Z"/>
        <path d="M50 50 Q 56 80 62 80"/>
        <path d="M82 50 Q 88 80 94 80"/>
        <path d="M114 50 Q 120 80 126 80"/>
        <path d="M146 50 Q 152 80 158 80"/>
        {/* Window */}
        <rect x="36" y="80" width="128" height="90"/>
        {/* Plant */}
        <path d="M118 134 Q 124 124 126 116 Q 130 124 132 116 Q 130 130 126 134" strokeWidth={STROKE_FINE}/>
        <path d="M114 134 L 134 134 L 132 144 L 116 144 Z" strokeWidth={STROKE_FINE}/>
      </g>
    </svg>
  );
}

/* Map pin (single) */
function IllusMapPin({ size = 80, color = HBLUE }) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 80" fill="none">
      <g stroke={color} strokeWidth={STROKE_WEIGHT} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M30 70 Q 6 44 6 26 Q 6 6 30 6 Q 54 6 54 26 Q 54 44 30 70 Z"/>
        <circle cx="30" cy="26" r="9"/>
      </g>
    </svg>
  );
}

/* Heart (line only) */
function IllusHeart({ size = 100, color = CORAL }) {
  return (
    <svg width={size} height={size * 0.92} viewBox="0 0 100 92" fill="none">
      <path d="M50 84 Q 8 56 8 32 Q 8 12 26 12 Q 42 12 50 28 Q 58 12 74 12 Q 92 12 92 32 Q 92 56 50 84 Z"
            stroke={color} strokeWidth={STROKE_WEIGHT} strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

/* Paw print */
function IllusPaw({ size = 80, color = HBLUE }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      <g stroke={color} strokeWidth={STROKE_WEIGHT} fill="none">
        <ellipse cx="40" cy="56" rx="14" ry="11"/>
        <circle cx="22" cy="34" r="6"/>
        <circle cx="40" cy="26" r="6"/>
        <circle cx="58" cy="34" r="6"/>
        <circle cx="62" cy="50" r="4.5"/>
        <circle cx="18" cy="50" r="4.5"/>
      </g>
    </svg>
  );
}

/* Speech bubble */
function IllusBubble({ size = 120 }) {
  return (
    <svg width={size} height={size * 0.85} viewBox="0 0 120 100" fill="none">
      <g stroke={HBLUE} strokeWidth={STROKE_WEIGHT} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M16 16 Q 8 24 8 40 L 8 64 Q 8 80 24 80 L 36 80 L 36 96 L 56 80 L 96 80 Q 112 80 112 64 L 112 32 Q 112 16 96 16 Z"/>
      </g>
    </svg>
  );
}

/* Cityscape (background filler for posts) */
function IllusCity({ width = 400, height = 100 }) {
  return (
    <svg width={width} height={height} viewBox="0 0 400 100" fill="none" preserveAspectRatio="none">
      <g stroke={HBLUE} strokeWidth={STROKE_FINE} strokeLinejoin="round" fill="none">
        <path d="M0 100 L 0 56 L 24 56 L 24 38 L 50 38 L 50 56 L 70 56 L 70 70 L 90 70 L 90 48 L 116 48 L 116 30 L 142 30 L 142 56 L 168 56 L 168 42 L 196 42 L 196 70 L 220 70 L 220 50 L 246 50 L 246 32 L 270 32 L 270 50 L 296 50 L 296 70 L 320 70 L 320 44 L 348 44 L 348 60 L 374 60 L 374 38 L 400 38 L 400 100 Z"/>
        {/* windows */}
        <line x1="32" y1="44" x2="32" y2="48"/>
        <line x1="40" y1="44" x2="40" y2="48"/>
        <line x1="100" y1="56" x2="100" y2="60"/>
        <line x1="124" y1="36" x2="124" y2="40"/>
        <line x1="178" y1="48" x2="178" y2="52"/>
        <line x1="252" y1="38" x2="252" y2="42"/>
        <line x1="328" y1="50" x2="328" y2="54"/>
      </g>
    </svg>
  );
}

/* Sidewalk strip (line at bottom) */
function IllusSidewalk({ width = 400 }) {
  return (
    <svg width={width} height={28} viewBox="0 0 400 28" fill="none" preserveAspectRatio="none">
      <line x1="0" y1="2" x2="400" y2="2" stroke={HBLUE} strokeWidth={STROKE_WEIGHT}/>
      <line x1="0" y1="20" x2="400" y2="20" stroke={HBLUE} strokeWidth={STROKE_FINE}/>
      <line x1="40" y1="2" x2="40" y2="20" stroke={HBLUE} strokeWidth={STROKE_FINE}/>
      <line x1="120" y1="2" x2="120" y2="20" stroke={HBLUE} strokeWidth={STROKE_FINE}/>
      <line x1="200" y1="2" x2="200" y2="20" stroke={HBLUE} strokeWidth={STROKE_FINE}/>
      <line x1="280" y1="2" x2="280" y2="20" stroke={HBLUE} strokeWidth={STROKE_FINE}/>
      <line x1="360" y1="2" x2="360" y2="20" stroke={HBLUE} strokeWidth={STROKE_FINE}/>
    </svg>
  );
}

/* Polaroid frame for member spotlights */
function Polaroid({ children, caption, rotate = -2, width = 200 }) {
  return (
    <div style={{
      width, padding: 12, paddingBottom: 36, background: "white",
      transform: `rotate(${rotate}deg)`,
      boxShadow: "0 18px 36px -18px rgba(20,30,60,0.35)",
      border: "1px solid rgba(0,0,0,0.06)"
    }}>
      <div style={{ aspectRatio: "1/1", background: "#E9E6DE", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {children}
      </div>
      {caption && (
        <div style={{
          marginTop: 12, fontFamily: "Urbanist", fontWeight: 600, fontSize: 13,
          textAlign: "center", color: "#0E0E10", letterSpacing: "0.02em"
        }}>{caption}</div>
      )}
    </div>
  );
}

/* Small reference-style scene composer — uses cast pieces to assemble
   a generic huddle street scene. Use as filler in templates. */
function SceneStreet({ width = 600, height = 400, dog = true, person = true }) {
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} fill="none" style={{ display: "block" }}>
      {/* cityscape far back */}
      <g transform={`translate(0 ${height * 0.45})`}>
        <g stroke={HBLUE} strokeWidth={STROKE_FINE} fill="none">
          <path d={`M0 ${height*0.35} L 0 ${height*0.18} L 60 ${height*0.18} L 60 ${height*0.10} L 130 ${height*0.10} L 130 ${height*0.22} L 200 ${height*0.22} L 200 ${height*0.05} L 270 ${height*0.05} L 270 ${height*0.20} L 340 ${height*0.20} L 340 ${height*0.10} L ${width} ${height*0.10} L ${width} ${height*0.35} Z`}/>
        </g>
      </g>
      {/* lamppost */}
      <g transform={`translate(${width*0.1} ${height*0.30})`}>
        <g stroke={HBLUE} strokeWidth={STROKE_WEIGHT} strokeLinecap="round" fill="none">
          <path d={`M0 ${height*0.5} L 0 0`}/>
          <path d={`M0 0 Q 0 -20 30 -20`}/>
          <path d={`M30 -20 L 30 -8 Q 26 4 18 4 Q 10 4 6 -8 L 6 -20 Z`}/>
        </g>
      </g>
      {/* awning right */}
      <g transform={`translate(${width*0.7} ${height*0.45})`}>
        <g stroke={HBLUE} strokeWidth={STROKE_WEIGHT} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M0 0 L 160 0 L 144 30 L 16 30 Z"/>
          <path d="M28 0 Q 32 30 36 30"/>
          <path d="M56 0 Q 60 30 64 30"/>
          <path d="M84 0 Q 88 30 92 30"/>
          <path d="M112 0 Q 116 30 120 30"/>
          <rect x="20" y="30" width="120" height="100"/>
        </g>
      </g>
      {/* sidewalk */}
      <g transform={`translate(0 ${height*0.85})`}>
        <line x1="0" y1="0" x2={width} y2="0" stroke={HBLUE} strokeWidth={STROKE_WEIGHT}/>
        <line x1="0" y1="20" x2={width} y2="20" stroke={HBLUE} strokeWidth={STROKE_FINE}/>
        {[80, 200, 320, 440, 560].map(x => (
          <line key={x} x1={x} y1="0" x2={x} y2="20" stroke={HBLUE} strokeWidth={STROKE_FINE}/>
        ))}
      </g>
      {/* person */}
      {person && (
        <g transform={`translate(${width*0.25} ${height*0.45})`}>
          <IllusPersonInline/>
        </g>
      )}
      {/* dog */}
      {dog && (
        <g transform={`translate(${width*0.55} ${height*0.55})`}>
          <IllusDogInline/>
        </g>
      )}
    </svg>
  );
}

/* Inline body-only person (for SceneStreet) */
function IllusPersonInline() {
  return (
    <g stroke={HBLUE} strokeWidth={STROKE_WEIGHT} strokeLinecap="round" strokeLinejoin="round" fill="none">
      {/* Hair */}
      <path d="M-12 -110 Q -10 -130 10 -130 Q 30 -130 32 -110" />
      <path d="M-10 -132 Q 0 -140 14 -140 Q 28 -136 32 -126 Q 30 -134 22 -138 Q 14 -142 6 -140 Q -4 -140 -10 -132 Z" fill={HBLUE}/>
      {/* Head */}
      <path d="M-8 -110 Q -10 -90 -2 -82 Q 8 -76 14 -76 Q 24 -78 30 -86 Q 34 -100 30 -110"/>
      {/* Eyes */}
      <ellipse cx="0" cy="-96" rx="1.4" ry="2" fill={HBLUE} stroke="none"/>
      <ellipse cx="20" cy="-96" rx="1.4" ry="2" fill={HBLUE} stroke="none"/>
      {/* Mouth */}
      <path d="M6 -86 Q 10 -84 14 -86" strokeWidth={STROKE_FINE}/>
      {/* Body */}
      <path d="M-20 -60 Q -8 -76 12 -76 L 22 -76 Q 38 -74 44 -58 L 46 0 Q 44 14 36 12 L 36 -32"/>
      <path d="M-2 -76 Q 2 -64 12 -60"/>
      <path d="M28 -76 Q 24 -64 14 -60"/>
      {/* Arms */}
      <path d="M-20 -58 Q -32 -30 -28 -4 Q -24 8 -14 4"/>
      <path d="M44 -56 Q 54 -30 50 -2 Q 46 8 36 4"/>
      {/* Pants */}
      <path d="M-4 0 L -6 56 Q -6 62 4 62 L 8 4"/>
      <path d="M28 0 L 30 56 Q 30 62 20 62 L 18 4"/>
      {/* Shoes */}
      <path d="M-12 62 Q -16 70 0 70 Q 8 70 8 62"/>
      <path d="M34 62 Q 38 70 22 70 Q 14 70 14 62"/>
    </g>
  );
}

/* Inline dog body (for SceneStreet) */
function IllusDogInline() {
  return (
    <g stroke={HBLUE} strokeWidth={STROKE_WEIGHT} strokeLinecap="round" strokeLinejoin="round" fill="none">
      {/* Ears */}
      <path d="M-30 -68 Q -36 -82 -28 -88 Q -20 -90 -16 -78 Q -14 -68 -16 -62"/>
      <path d="M22 -68 Q 28 -82 20 -88 Q 12 -90 8 -78 Q 6 -68 8 -62"/>
      {/* Head */}
      <path d="M-22 -64 Q -32 -42 -22 -24 Q -10 -8 6 -8 Q 26 -8 36 -22 Q 46 -42 34 -62 Q 22 -72 6 -72 Q -10 -72 -22 -64 Z"/>
      <ellipse cx="-8" cy="-44" rx="1.6" ry="2.2" fill={HBLUE} stroke="none"/>
      <ellipse cx="20" cy="-44" rx="1.6" ry="2.2" fill={HBLUE} stroke="none"/>
      <path d="M-2 -24 Q 6 -18 14 -24" strokeWidth={STROKE_FINE}/>
      <ellipse cx="6" cy="-28" rx="3.4" ry="2.4" fill={HBLUE} stroke="none"/>
      {/* Body */}
      <path d="M-20 -8 Q -34 12 -34 44 Q -34 60 -20 60 L 36 60 Q 50 60 50 46 Q 50 14 32 -8"/>
      <path d="M-8 32 L -10 60"/>
      <path d="M22 32 L 24 60"/>
      <path d="M-20 60 Q -22 66 -8 66 Q -4 66 -4 60" strokeWidth={STROKE_FINE}/>
      <path d="M16 60 Q 16 66 28 66 Q 32 66 32 60" strokeWidth={STROKE_FINE}/>
      <path d="M48 26 Q 64 16 68 32 Q 68 44 58 44"/>
      <path d="M-4 -2 Q 4 6 12 -2" strokeWidth={STROKE_FINE}/>
    </g>
  );
}

/* Export */
Object.assign(window, {
  Asterisk, ClickCursor, BMark, Wordmark, WordmarkBear,
  SearchBarLockup, CarouselDots, SwipeArrow,
  MarkerHeadline, CoralAccent,
  IllusPerson, IllusDog, IllusCat, IllusHandPhone,
  IllusLamppost, IllusAwning, IllusMapPin, IllusHeart, IllusPaw, IllusBubble,
  IllusCity, IllusSidewalk, SceneStreet,
  Polaroid,
  HBLUE, CORAL, STROKE_WEIGHT, STROKE_FINE
});
