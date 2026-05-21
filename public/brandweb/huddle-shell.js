/* huddle shell — injects shared nav + footer.
   Page must declare <body data-page="home|about|care|live-map|community|pet-profiles|pricing|careers|faq|contact|legal">
   Optional: data-nav="solid" forces light nav at top (non-hero pages). */
(function () {
  const body = document.body;
  const page = body.getAttribute("data-page") || "";
  const forceSolid = body.getAttribute("data-nav") === "solid";

  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === "class") el.className = attrs[k];
      else if (k === "text") el.textContent = attrs[k];
      else el.setAttribute(k, attrs[k]);
    }
    if (children) children.forEach(c => { if (c) el.appendChild(c); });
    return el;
  }

  const NAV = [
    { href: "/", id: "home", label: "Home" },
    { href: "/live-map", id: "live-map", label: "Live Map" },
    { href: "/care", id: "care", label: "Care" },
    { href: "/community", id: "community", label: "Community" },
    { href: "/pricing", id: "pricing", label: "Plans" },
    { href: "/about", id: "about", label: "About" },
  ];

  // NAV ───────────────────────────────────────────────────────
  const brand = h("a", { href: "/", "aria-label": "huddle home", class: "nav-brand" }, [
    h("img", { src: "/brandweb/wm-white.png", alt: "huddle", class: "nav-logo on-dark" }),
    h("img", { src: "/brandweb/wm-blue.png",  alt: "huddle", class: "nav-logo on-light" }),
  ]);
  const links = h("div", { class: "nav-links" }, NAV.map(n => {
    const a = h("a", { href: n.href, class: "nav-link", text: n.label });
    if (n.id === page) a.setAttribute("aria-current", "page");
    return a;
  }));
  const cta = h("a", { href: "/#download", class: "nav-cta", text: "Get the app ↓" });
  const menuBtn = h("button", { type: "button", class: "nav-menu-btn", id: "nav-menu-btn", "aria-label": "Open menu", "aria-controls": "huddle-drawer", "aria-expanded": "false" }, [
    h("span"), h("span"), h("span"),
  ]);
  // Skip injecting the shared nav if the page already has its own inline nav (e.g. home page)
  const hasInlineNav = !!document.querySelector('nav#nav');
  let nav = null;
  if (!hasInlineNav) {
    nav = h("nav", { class: "huddle-nav" + (forceSolid ? " solid" : ""), id: "huddle-nav" }, [brand, links, cta, menuBtn]);
    body.insertBefore(nav, body.firstChild);
    if (!forceSolid) {
      addEventListener("scroll", () => nav.classList.toggle("scrolled", scrollY > 60), { passive: true });
    }
  }

  // SIDE DRAWER ───────────────────────────────────────────────
  const DRAWER_GROUPS = [
    { title: "Product", items: [
      ["/", "Home"],
      ["/live-map", "Live Map"],
      ["/community", "Community"],
      ["/care", "Care"],
      ["/pet-profiles", "Pet Profiles"],
      ["/pricing", "Plans & Pricing"],
    ]},
    { title: "Company", items: [
      ["/about", "About huddle"],
      ["/careers", "Careers"],
      ["/faq", "FAQ"],
      ["/knowledge-base", "Knowledge Base"],
      ["/contact", "Contact"],
      ["/press", "Press"],
    ]},
    { title: "Legal", items: [
      ["/legal/privacy", "Privacy policy"],
      ["/legal/terms", "Terms of service"],
      ["/legal/cookies", "Cookies notice"],
      ["/legal/community-guidelines", "Community guidelines"],
      ["/legal/privacy-choices", "Privacy choices"],
      ["/legal/service-provider-agreement", "Care Service Provider Agreement"],
      ["/legal/booking-terms", "Care Service Booking Terms"],
    ]},
  ];
  const drawerOverlay = h("div", { class: "drawer-overlay", id: "drawer-overlay" });
  const drawerClose = h("button", { type: "button", class: "drawer-close", id: "drawer-close", "aria-label": "Close menu" }, [
    h("span"), h("span"),
  ]);
  const drawerTagline = h("p", { class: "drawer-tagline", text: "Every pet deserves more. We leave no pet behind." });
  const drawerGroups = h("div", { class: "drawer-groups" }, DRAWER_GROUPS.map(g =>
    h("div", { class: "drawer-group" }, [
      h("h4", { text: g.title }),
      h("ul", {}, g.items.map(([href, label]) => h("li", {}, [h("a", { href: href, text: label })]))),
    ])
  ));
  const drawerCTA = h("a", { href: "/#download", class: "drawer-cta", text: "Get the app — free ↓" });
  const drawer = h("aside", { class: "huddle-drawer", id: "huddle-drawer", role: "dialog", "aria-modal": "true", "aria-label": "Site menu", "aria-hidden": "true" }, [
    drawerClose, drawerTagline, drawerGroups, drawerCTA,
  ]);
  body.appendChild(drawerOverlay);
  body.appendChild(drawer);

  function openDrawer() {
    drawer.classList.add("open");
    drawerOverlay.classList.add("show");
    document.documentElement.style.overflow = "hidden";
    if (nav) menuBtn.setAttribute("aria-expanded", "true");
    drawer.setAttribute("aria-hidden", "false");
    const inline = document.getElementById("nav-menu-btn-inline");
    if (inline) inline.setAttribute("aria-expanded", "true");
  }
  function closeDrawer() {
    drawer.classList.remove("open");
    drawerOverlay.classList.remove("show");
    document.documentElement.style.overflow = "";
    if (nav) menuBtn.setAttribute("aria-expanded", "false");
    drawer.setAttribute("aria-hidden", "true");
    const inline = document.getElementById("nav-menu-btn-inline");
    if (inline) inline.setAttribute("aria-expanded", "false");
  }
  if (nav) menuBtn.addEventListener("click", openDrawer);
  drawerClose.addEventListener("click", closeDrawer);
  drawerOverlay.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", e => { if (e.key === "Escape" && drawer.classList.contains("open")) closeDrawer(); });
  // Home page has its own inline nav with id="nav" — wire its menu button too
  const inlineMenuBtn = document.querySelector('#nav .nav-menu-btn');
  if (inlineMenuBtn) {
    inlineMenuBtn.id = "nav-menu-btn-inline";
    inlineMenuBtn.addEventListener("click", openDrawer);
  }

  // FOOTER ────────────────────────────────────────────────────
  function col(title, items) {
    return h("div", { class: "footer-col" }, [
      h("h4", { text: title }),
      ...items.map(([href, label]) => h("a", { href: href, text: label })),
    ]);
  }
  const brandCol = h("div", { class: "footer-brand" }, [
    h("img", { src: "/brandweb/wm-coral-shadow.png", alt: "huddle", class: "footer-logo" }),
    h("p", { text: "An app for every pet — even the ones on the streets. Every pet deserves more. We leave no pet behind." }),
    h("div", { class: "footer-stores" }, [
      h("a", { href: "/#download", class: "btn-store-sm", text: "⌘ iOS" }),
      h("a", { href: "/#download", class: "btn-store-sm", text: "▸ Android" }),
    ]),
  ]);
  const top = h("div", { class: "footer-top" }, [
    brandCol,
    col("Product", [
      ["/live-map", "Live Map"],
      ["/community#social", "Social Forum"],
      ["/community#discover", "Discover & Community"],
      ["/care", "Care"],
      ["/pet-profiles", "Pet Profiles"],
      ["/pricing", "Plans & Pricing"],
    ]),
    col("Company", [
      ["/about", "About huddle"],
      ["/careers", "Careers"],
      ["/faq", "FAQ"],
      ["/knowledge-base", "Knowledge Base"],
      ["/contact", "Contact"],
    ]),
    col("Legal", [
      ["/legal/privacy", "Privacy policy"],
      ["/legal/terms", "Terms of service"],
      ["/legal/cookies", "Cookies notice"],
      ["/legal/community-guidelines", "Community guidelines"],
      ["/legal/privacy-choices", "Privacy choices"],
      ["/legal/service-provider-agreement", "Care Service Provider Agreement"],
      ["/legal/booking-terms", "Care Service Booking Terms"],
    ]),
  ]);
  const bottom = h("div", { class: "footer-bottom" }, [
    h("span", { text: "© 2026 huddle. No pet left behind." }),
    h("span", {}, [h("a", { href: "mailto:support@huddle.pet", style: "color:inherit", text: "support@huddle.pet" })]),
  ]);
  const watermark = h("img", { src: "/brandweb/wm-blue.png", alt: "", class: "watermark" });
  const inner = h("div", { class: "container footer-inner" }, [top, bottom]);
  const strip = h("div", { class: "coral-strip" });
  // Skip footer if page already has an inline footer (e.g. home page)
  const hasInlineFooter = !!document.querySelector('footer.footer-wrap');
  if (!hasInlineFooter) {
    const footer = h("footer", { class: "huddle-footer" }, [watermark, inner, strip]);
    body.appendChild(footer);
  }

  // SCROLL REVEAL ─────────────────────────────────────────────
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("visible"); io.unobserve(e.target); } });
  }, { threshold: 0.12 });
  document.querySelectorAll(".reveal, .reveal-l, .reveal-r").forEach(el => io.observe(el));

  // COOKIE CONSENT (PDPO HK + GDPR EEA + ePrivacy) ─────────────
  // Compliance principles applied:
  //   • Non-essential cookies blocked until explicit opt-in (no pre-ticked boxes)
  //   • "Reject" must be as prominent as "Accept" (no dark patterns)
  //   • Granular per-category control (Essential locked, Analytics, Marketing)
  //   • Consent stored with timestamp + version for audit trail
  //   • Withdraw consent at any time via the floating cookie button
  //   • Links to Cookies Notice and Privacy Policy
  const CONSENT_KEY = "huddle_consent_v1";
  const stored = (function () {
    try { return JSON.parse(localStorage.getItem(CONSENT_KEY) || "null"); } catch (_) { return null; }
  })();

  function saveConsent(state) {
    const payload = { ...state, ts: Date.now(), v: 1 };
    try { localStorage.setItem(CONSENT_KEY, JSON.stringify(payload)); } catch (_) {}
    document.documentElement.setAttribute("data-consent-analytics", state.analytics ? "1" : "0");
    document.documentElement.setAttribute("data-consent-marketing", state.marketing ? "1" : "0");
    // Hooks for tag managers — gated firing:
    //   if (state.analytics) loadAnalytics();
    //   if (state.marketing) loadMarketingPixels();
  }
  if (stored) {
    document.documentElement.setAttribute("data-consent-analytics", stored.analytics ? "1" : "0");
    document.documentElement.setAttribute("data-consent-marketing", stored.marketing ? "1" : "0");
  }

  const consent = h("div", { id: "huddle-consent", class: "consent-banner", role: "dialog", "aria-label": "Cookie preferences", "aria-live": "polite" });
  const consentInner = h("div", { class: "consent-inner" }, [
    h("div", { class: "consent-text" }, [
      h("strong", { text: "Cookies on huddle." }),
      h("span", { text: " We use essential cookies to make huddle work. With your permission, we also use analytics and marketing cookies to improve the service. " }),
      h("a", { href: "/legal/cookies", text: "Cookies notice" }),
      h("span", { text: " · " }),
      h("a", { href: "/legal/privacy", text: "Privacy policy" }),
    ]),
    h("div", { class: "consent-actions" }, [
      h("button", { type: "button", class: "consent-btn ghost", id: "consent-reject", text: "Reject non-essential" }),
      h("button", { type: "button", class: "consent-btn ghost", id: "consent-customise", text: "Customise" }),
      h("button", { type: "button", class: "consent-btn primary", id: "consent-accept", text: "Accept all" }),
    ]),
  ]);
  consent.appendChild(consentInner);

  // Settings modal
  const modal = h("div", { id: "huddle-consent-modal", class: "consent-modal", role: "dialog", "aria-modal": "true", "aria-label": "Cookie settings" });
  const modalCard = h("div", { class: "consent-modal-card" });
  modalCard.appendChild(h("h3", { text: "Cookie settings" }));
  modalCard.appendChild(h("p", { class: "consent-modal-lead", text: "huddle uses cookies and similar technologies. You control which categories are active. Withdraw consent at any time from the cookie icon at the bottom of every page." }));
  function row(id, title, locked, desc) {
    const r = h("div", { class: "consent-row" });
    const labelWrap = h("label", { class: "consent-row-label", for: id });
    labelWrap.appendChild(h("strong", { text: title }));
    labelWrap.appendChild(h("p", { text: desc }));
    const toggle = h("input", { type: "checkbox", id: id, class: "consent-toggle" });
    if (locked) { toggle.checked = true; toggle.disabled = true; }
    else if (stored && stored[id.replace("consent-cat-","")]) { toggle.checked = true; }
    r.appendChild(labelWrap);
    r.appendChild(toggle);
    return r;
  }
  modalCard.appendChild(row("consent-cat-essential", "Essential", true, "Required for huddle to load, remember sign-in, and process payments. Always on. Cannot be disabled."));
  modalCard.appendChild(row("consent-cat-analytics", "Analytics", false, "Helps us understand how huddle is used so we can improve features and fix problems. Aggregated, never sold."));
  modalCard.appendChild(row("consent-cat-marketing", "Marketing", false, "Lets us measure campaigns and show relevant huddle content on partner channels. Off by default."));
  const modalActions = h("div", { class: "consent-modal-actions" }, [
    h("button", { type: "button", class: "consent-btn ghost", id: "consent-cancel", text: "Cancel" }),
    h("button", { type: "button", class: "consent-btn primary", id: "consent-save", text: "Save preferences" }),
  ]);
  modalCard.appendChild(modalActions);
  modal.appendChild(modalCard);

  // Floating re-open button (always visible — required for withdrawal)
  const reopener = h("button", { type: "button", id: "huddle-consent-reopen", class: "consent-reopen", "aria-label": "Cookie settings", title: "Cookie settings", text: "🍪" });

  body.appendChild(consent);
  body.appendChild(modal);
  body.appendChild(reopener);

  function showBanner() { consent.classList.add("show"); }
  function hideBanner() { consent.classList.remove("show"); }
  function showModal() { modal.classList.add("show"); }
  function hideModal() { modal.classList.remove("show"); }

  if (!stored) showBanner();

  document.getElementById("consent-accept").addEventListener("click", function () {
    saveConsent({ essential: true, analytics: true, marketing: true });
    hideBanner();
  });
  document.getElementById("consent-reject").addEventListener("click", function () {
    saveConsent({ essential: true, analytics: false, marketing: false });
    hideBanner();
  });
  document.getElementById("consent-customise").addEventListener("click", function () {
    hideBanner(); showModal();
  });
  document.getElementById("consent-cancel").addEventListener("click", function () { hideModal(); if (!stored) showBanner(); });
  document.getElementById("consent-save").addEventListener("click", function () {
    saveConsent({
      essential: true,
      analytics: document.getElementById("consent-cat-analytics").checked,
      marketing: document.getElementById("consent-cat-marketing").checked,
    });
    hideModal();
  });
  reopener.addEventListener("click", function () { showModal(); });
})();
