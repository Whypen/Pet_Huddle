/** Public web page identity shared by the build output and browser navigation. */
export const PUBLIC_PAGE_METADATA = {
  '/social': {
    title: 'Pet conversations and community | huddle Social',
    description: 'Meet people who care about pets on huddle. Read community posts and find a conversation you would like to join.',
  },
  '/map': {
    title: 'Pet alerts and sightings | huddle Map',
    description: 'Read public pet alerts on the huddle Map. Follow a missing pet report or find out what someone has seen nearby.',
  },
  '/groups': {
    title: 'Find pet groups and walking friends | huddle',
    description: 'Explore pet groups on huddle and find people who share your interests. Get to know a group before making plans to meet.',
  },
};

export function getPublicPageMetadata(pathname) {
  const path = pathname.replace(/\/+$/, '') || '/';
  const page = PUBLIC_PAGE_METADATA[path];
  return page
    ? { ...page, canonical: `https://huddle.pet${path}`, robots: 'index,follow' }
    : { title: 'huddle', description: 'Your huddle account.', canonical: null, robots: 'noindex,follow' };
}

const escapeAttribute = (value) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export function renderPublicPageMetadata(html, pathname) {
  const metadata = getPublicPageMetadata(pathname);
  let result = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeAttribute(metadata.title)}</title>`);
  // Replace owned tags, leaving asset references and the application entry intact.
  result = result.replace(/<meta\s+(?:name|property)="(?:description|robots|og:title|og:description|og:url|og:image|twitter:title|twitter:description|twitter:image)"[^>]*>\s*/gi, '');
  result = result.replace(/<link\s+rel="canonical"[^>]*>\s*/gi, '');
  const image = 'https://huddle.pet/brandweb/og-card.png';
  const tags = [
    ['name', 'description', metadata.description], ['name', 'robots', metadata.robots],
    ['property', 'og:title', metadata.title], ['property', 'og:description', metadata.description],
    ['property', 'og:image', image], ['name', 'twitter:title', metadata.title],
    ['name', 'twitter:description', metadata.description], ['name', 'twitter:image', image],
  ].map(([attribute, name, value]) => `<meta ${attribute}="${name}" content="${escapeAttribute(value)}">`);
  if (metadata.canonical) {
    tags.push(`<link rel="canonical" href="${metadata.canonical}">`, `<meta property="og:url" content="${metadata.canonical}">`);
  }
  return result.replace('</head>', `${tags.join('\n    ')}\n  </head>`);
}
