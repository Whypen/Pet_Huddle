/* huddle shell — injects shared nav + footer.
   Page must declare <body data-page="home|about|care|live-map|community|pet-profiles|pricing|faq|contact|legal">
   Optional: data-nav="solid" forces light nav at top (non-hero pages). */
(function () {
  const body = document.body;
  const page = body.getAttribute("data-page") || "";
  const forceSolid = body.getAttribute("data-nav") === "solid";
  const isFile = window.location.protocol === "file:";
  const asset = name => (isFile ? name : "/brandweb/" + name);

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

  const SVG_NS = "http://www.w3.org/2000/svg";
  function svgIcon(pathD) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "20");
    svg.setAttribute("height", "20");
    svg.setAttribute("fill", "currentColor");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", pathD);
    svg.appendChild(path);
    return svg;
  }

  const SOCIAL_LINKS = [
    {
      href: "https://www.instagram.com/huddle.pet",
      label: "huddle on Instagram",
      d: "M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077",
    },
    {
      href: "https://www.threads.net/@huddle.pet",
      label: "huddle on Threads",
      d: "M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.308-.883-2.359-.89h-.029c-.844 0-1.992.232-2.721 1.32L7.734 7.847c.98-1.454 2.568-2.256 4.478-2.256h.044c3.194.02 5.097 1.975 5.287 5.388.108.046.216.094.321.142 1.49.7 2.58 1.761 3.154 3.07.797 1.82.871 4.79-1.548 7.158-1.85 1.81-4.094 2.628-7.277 2.65Zm1.003-11.69c-.242 0-.487.007-.739.021-1.836.103-2.98.946-2.916 2.143.067 1.256 1.452 1.839 2.784 1.767 1.224-.065 2.818-.543 3.086-3.71a10.5 10.5 0 0 0-2.215-.221z",
    },
    {
      href: "https://twitter.com/huddlepet",
      label: "huddle on X",
      d: "M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z",
    },
    {
      href: "https://www.tiktok.com/@huddlepet",
      label: "huddle on TikTok",
      d: "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z",
    },
  ];

  function socialRow() {
    return h("div", { class: "footer-social" }, SOCIAL_LINKS.map(s =>
      h("a", { href: s.href, class: "footer-social-link", target: "_blank", rel: "noopener noreferrer", "aria-label": s.label }, [svgIcon(s.d)])
    ));
  }

  const NAV = [
    { href: "/", id: "home", label: "Home" },
    { href: "/#how", id: "how", label: "How it works" },
    { href: "/live-map", id: "live-map", label: "Live Map" },
    { href: "/care", id: "care", label: "Care" },
    { href: "/community", id: "community", label: "Community" },
    { href: "/pricing", id: "pricing", label: "Plans" },
    { href: "/about", id: "about", label: "About" },
  ];

  // NAV ───────────────────────────────────────────────────────
  const brand = h("a", { href: "/", "aria-label": "huddle home", class: "nav-brand" }, [
    h("img", { src: asset("wm-white.png"), alt: "huddle", class: "nav-logo on-dark" }),
    h("img", { src: asset("wm-blue.png"),  alt: "huddle", class: "nav-logo on-light" }),
  ]);
  const links = h("div", { class: "nav-links" }, NAV.map(n => {
    const a = h("a", { href: n.href, class: "nav-link", text: n.label });
    if (n.id === page) a.setAttribute("aria-current", "page");
    return a;
  }));
  // The web door. Ghost against the solid CTA beside it — both doors open, the
  // app the recommendation. Targets /social, the live product.
  const webDoor = h("a", { href: "/social", class: "nav-web", "aria-label": "Open huddle on the web" }, [
    h("img", { src: asset("wm-white.png"), alt: "huddle", class: "nav-web-mark on-dark" }),
    h("img", { src: asset("wm-blue.png"), alt: "huddle", class: "nav-web-mark on-light" }),
    h("span", { text: "web" }),
    h("span", { class: "nav-web-arrow", text: "↗", "aria-hidden": "true" }),
  ]);
  const cta = h("a", { href: "/get", class: "nav-cta", text: "Get the app" });
  const menuBtn = h("button", { type: "button", class: "nav-menu-btn", id: "nav-menu-btn", "aria-label": "Open menu", "aria-controls": "huddle-drawer", "aria-expanded": "false" }, [
    h("span"), h("span"), h("span"),
  ]);
  // Skip injecting the shared nav if the page already has its own inline nav (e.g. home page)
  const hasInlineNav = !!document.querySelector('nav#nav');
  let nav = null;
  if (!hasInlineNav) {
    nav = h("nav", { class: "huddle-nav" + (forceSolid ? " solid" : ""), id: "huddle-nav" }, [brand, links, webDoor, cta, menuBtn]);
    body.insertBefore(nav, body.firstChild);
    if (!forceSolid) {
      addEventListener("scroll", () => nav.classList.toggle("scrolled", scrollY > 60), { passive: true });
    }
  }

  // SIDE DRAWER ───────────────────────────────────────────────
  const DRAWER_GROUPS = [
    { title: "Product", items: [
      ["/", "Home"],
      ["/social", "Open huddle on the web"],
      ["/live-map", "Live Map"],
      ["/community", "Community"],
      ["/care", "Care"],
      ["/pet-profiles", "Pet Profiles"],
      ["/pricing", "Plans & Pricing"],
    ]},
    { title: "Company", items: [
      ["/about", "About huddle"],
      ["/faq", "FAQ"],
      ["/contact", "Contact"],
      ["/waitlist", "Join the waitlist"],
    ]},
    { title: "Legal", items: [
      ["/legal/privacy", "Privacy policy"],
      ["/legal/terms", "Terms of service"],
      ["/legal/cookies", "Cookies notice"],
      ["/legal/community-guidelines", "Community guidelines"],
      ["/legal/privacy-choices", "Privacy choices"],
      ["/legal/service-provider-agreement", "Care Service Carer Agreement"],
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
      h("button", { type: "button", class: "drawer-group-toggle", "aria-expanded": "false", text: g.title }),
      h("ul", {}, g.items.map(([href, label]) => h("li", {}, [h("a", { href: href, text: label })]))),
    ])
  ));
  const drawerCTA = h("a", { href: "/get", class: "drawer-cta", text: "Get the app — free" });
  const drawerWeb = h("a", { href: "/social", class: "drawer-web" }, [
    h("img", { src: asset("wm-blue.png"), alt: "huddle", class: "nav-web-mark" }),
    h("span", { text: "web ↗" }),
  ]);
  const drawer = h("aside", { class: "huddle-drawer", id: "huddle-drawer", role: "dialog", "aria-modal": "true", "aria-label": "Site menu", "aria-hidden": "true" }, [
    drawerClose, drawerTagline, drawerGroups, drawerCTA, drawerWeb,
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
  drawerGroups.querySelectorAll(".drawer-group-toggle").forEach(button => {
    button.addEventListener("click", () => {
      const group = button.closest(".drawer-group");
      const isOpen = group.classList.toggle("open");
      button.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
  });
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
    h("img", { src: asset("wm-coral-shadow-alt.png"), alt: "huddle", class: "footer-logo" }),
    h("p", { text: "An app for every pet — even the ones on the streets. Every pet deserves more. We leave no pet behind." }),
    h("a", { href: "/waitlist", class: "footer-waitlist-link", text: "Join the waitlist →" }),
    h("div", { class: "footer-stores" }, [
      h("a", { href: "/get", class: "btn-store-sm", "aria-label": "Download on the App Store" }, [
        h("img", { src: asset("badge-appstore.svg"), alt: "Download on the App Store", class: "store-badge-img" }),
      ]),
      h("a", { href: "/get", class: "btn-store-sm", "aria-label": "Get it on Google Play" }, [
        h("img", { src: asset("badge-googleplay.png"), alt: "Get it on Google Play", class: "store-badge-img" }),
      ]),
    ]),
    socialRow(),
  ]);
  const top = h("div", { class: "footer-top" }, [
    brandCol,
    col("Product", [
      ["/social", "huddle on the web"],
      ["/live-map", "Live Map"],
      ["/community", "Community"],
      ["/care", "Care"],
      ["/pet-profiles", "Pet Profiles"],
      ["/pricing", "Plans & Pricing"],
    ]),
    col("Company", [
      ["/about", "About huddle"],
      ["/faq", "FAQ"],
      ["/contact", "Contact"],
    ]),
    col("Legal", [
      ["/legal/privacy", "Privacy policy"],
      ["/legal/terms", "Terms of service"],
      ["/legal/cookies", "Cookies notice"],
      ["/legal/community-guidelines", "Community guidelines"],
      ["/legal/privacy-choices", "Privacy choices"],
      ["/legal/service-provider-agreement", "Care Service Carer Agreement"],
      ["/legal/booking-terms", "Care Service Booking Terms"],
    ]),
  ]);
  const bottom = h("div", { class: "footer-bottom" }, [
    h("span", { text: "© 2026 huddle. No pet left behind." }),
    h("span", {}, [h("a", { href: "mailto:support@huddle.pet", style: "color:inherit", text: "support@huddle.pet" })]),
  ]);
  const watermark = h("img", { src: asset("wm-blue.png"), alt: "", class: "watermark" });
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

  // COOKIE CONSENT (regional privacy rules + GDPR EEA + ePrivacy) ─────────────
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
