import { inject, type BeforeSendEvent } from '@vercel/analytics';

const PUBLIC_PATHS = new Set(['/', '/community', '/care', '/live-map', '/knowledge-base', '/faq', '/pricing', '/pet-profiles', '/contact', '/about', '/get']);
const SOURCES = new Set(['instagram', 'tiktok', 'facebook', 'newsletter', 'petplace', 'adoptapet', 'partner', 'qr']);
const MEDIUMS = new Set(['social', 'email', 'referral', 'offline']);

/** Only approved public-page identities and launch tags reach analytics. */
export function cleanBrandEvent(event: BeforeSendEvent, consent: boolean): BeforeSendEvent | null {
  if (!consent || event.type !== 'pageview') return null;
  try {
    const url = new URL(event.url);
    if (url.origin !== 'https://huddle.pet' || !PUBLIC_PATHS.has(url.pathname)) return null;
    const clean = new URL(url.pathname, url.origin);
    if (SOURCES.has(url.searchParams.get('utm_source') || '')) clean.searchParams.set('utm_source', url.searchParams.get('utm_source')!);
    if (MEDIUMS.has(url.searchParams.get('utm_medium') || '')) clean.searchParams.set('utm_medium', url.searchParams.get('utm_medium')!);
    if (url.searchParams.get('utm_campaign') === 'launch_20260912') clean.searchParams.set('utm_campaign', 'launch_20260912');
    return { ...event, url: clean.href };
  } catch { return null; }
}

export function startBrandAnalytics() {
  let started = false;
  const consent = () => document.documentElement.getAttribute('data-consent-analytics') === '1';
  const sync = () => {
    if (started || !consent() || window.location.origin !== 'https://huddle.pet' || !PUBLIC_PATHS.has(window.location.pathname)) return;
    started = true;
    try { inject({ mode: 'production', beforeSend: event => cleanBrandEvent(event, consent()) }); }
    catch { started = false; } // Measurement must never interrupt a visitor.
  };
  window.addEventListener('huddle:consent-change', sync);
  sync();
}
