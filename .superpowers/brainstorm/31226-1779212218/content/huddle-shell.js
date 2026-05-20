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
    { href: "huddle-v5.html", id: "home", label: "Home" },
    { href: "live-map.html", id: "live-map", label: "Live Map" },
    { href: "care.html", id: "care", label: "Care" },
    { href: "community.html", id: "community", label: "Community" },
    { href: "pricing.html", id: "pricing", label: "Plans" },
    { href: "about.html", id: "about", label: "About" },
  ];

  // NAV ───────────────────────────────────────────────────────
  const brand = h("a", { href: "huddle-v5.html", "aria-label": "huddle home", class: "nav-brand" }, [
    h("img", { src: "wm-white.png", alt: "huddle", class: "nav-logo on-dark" }),
    h("img", { src: "wm-blue.png",  alt: "huddle", class: "nav-logo on-light" }),
  ]);
  const links = h("div", { class: "nav-links" }, NAV.map(n => {
    const a = h("a", { href: n.href, class: "nav-link", text: n.label });
    if (n.id === page) a.setAttribute("aria-current", "page");
    return a;
  }));
  const cta = h("a", { href: "huddle-v5.html#download", class: "nav-cta", text: "Get the app ↓" });
  const nav = h("nav", { class: "huddle-nav" + (forceSolid ? " solid" : ""), id: "huddle-nav" }, [brand, links, cta]);
  body.insertBefore(nav, body.firstChild);

  if (!forceSolid) {
    addEventListener("scroll", () => nav.classList.toggle("scrolled", scrollY > 60), { passive: true });
  }

  // FOOTER ────────────────────────────────────────────────────
  function col(title, items) {
    return h("div", { class: "footer-col" }, [
      h("h4", { text: title }),
      ...items.map(([href, label]) => h("a", { href: href, text: label })),
    ]);
  }
  const brandCol = h("div", { class: "footer-brand" }, [
    h("img", { src: "wm-coral-shadow.png", alt: "huddle", class: "footer-logo" }),
    h("p", { text: "Pet safety, local pet community, trusted pet care, and pet records — all in one app. Built in Hong Kong for pet people." }),
    h("div", { class: "footer-stores" }, [
      h("a", { href: "huddle-v5.html#download", class: "btn-store-sm", text: "⌘ iOS" }),
      h("a", { href: "huddle-v5.html#download", class: "btn-store-sm", text: "▸ Android" }),
    ]),
  ]);
  const top = h("div", { class: "footer-top" }, [
    brandCol,
    col("Product", [
      ["live-map.html", "Live Map"],
      ["live-map.html#broadcast", "Broadcast Alerts"],
      ["community.html", "Social Forum"],
      ["community.html#discover", "Discover & Community"],
      ["care.html", "Care"],
      ["pet-profiles.html", "Pet Profiles"],
      ["pricing.html", "Plans & Pricing"],
    ]),
    col("Company", [
      ["about.html", "About huddle"],
      ["about.html#mission", "Mission & Vision"],
      ["careers.html", "Careers"],
      ["faq.html", "FAQ"],
      ["contact.html", "Contact"],
    ]),
    col("Legal", [
      ["privacy.html", "Privacy policy"],
      ["terms.html", "Terms of service"],
      ["cookies.html", "Cookies notice"],
      ["community-guidelines.html", "Community guidelines"],
    ]),
  ]);
  const bottom = h("div", { class: "footer-bottom" }, [
    h("span", { text: "© 2026 huddle. Built in Hong Kong for pet people." }),
    h("span", {}, [h("a", { href: "mailto:support@huddle.pet", style: "color:inherit", text: "support@huddle.pet" })]),
  ]);
  const watermark = h("img", { src: "wm-blue.png", alt: "", class: "watermark" });
  const inner = h("div", { class: "container footer-inner" }, [top, bottom]);
  const strip = h("div", { class: "coral-strip" });
  const footer = h("footer", { class: "huddle-footer" }, [watermark, inner, strip]);
  body.appendChild(footer);

  // SCROLL REVEAL ─────────────────────────────────────────────
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("visible"); io.unobserve(e.target); } });
  }, { threshold: 0.12 });
  document.querySelectorAll(".reveal, .reveal-l, .reveal-r").forEach(el => io.observe(el));
})();
