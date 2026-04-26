type CopyVars = Record<string, string | number>;

const ENGLISH_COPY: Record<string, string> = {
  "settings.privacy_policy": "Privacy Policy",
  "settings.terms": "Terms of Service",
  "settings.title": "Settings",
  "settings.account_settings": "Account Settings",
  "settings.profile": "Profile",
  "settings.account_security": "Account & Security",
  "settings.pending": "Identity pending",
  "settings.verified_badge": "Verified huddler",
  "social.verified": "Verified",
  "social.wave": "Wave",
  "social.support": "Support",
  "social.match": "Double Wave!",
  "social.user.marcus.name": "Marcus",
  "social.user.emma.name": "Emma",
  "social.user.james.name": "James",
  "map.distance_km": "{count} km",
  "map.distance_km_max": "{count}+ km",
  "nav.home": "Home",
  "nav.social": "Social",
  "nav.chats": "Chats",
  "nav.ai_vet": "AI Vet",
  "nav.map": "Map",
  "app.name": "huddle",
  "home.wisdom.dog.1": "Keep daily walks predictable; dogs relax faster when exercise, meals, and rest follow a familiar rhythm.",
  "home.wisdom.dog.2": "Check paws after outdoor walks, especially after hot pavement, rain, or rough ground.",
  "home.wisdom.dog.3": "Short training moments work best when they end before your dog loses focus.",
  "home.wisdom.dog.4": "Fresh water and a quiet cool-down spot help dogs recover after play.",
  "home.wisdom.cat.1": "Cats feel safer when food, litter, scratching, and rest zones are separated.",
  "home.wisdom.cat.2": "A few minutes of hunting-style play before meals can reduce restless evening energy.",
  "home.wisdom.cat.3": "Slow blinks, soft voices, and side approaches are easier for many cats to trust.",
  "home.wisdom.cat.4": "Clean litter boxes daily; sudden litter changes are often a health or stress signal.",
  "home.wisdom.bird.1": "Birds need steady sleep routines and a calm, covered rest period at night.",
  "home.wisdom.bird.2": "Rotate safe toys regularly so enrichment stays interesting without overcrowding the cage.",
  "home.wisdom.bird.3": "Avoid non-stick fumes, aerosols, and smoke around birds; their lungs are extremely sensitive.",
  "home.wisdom.bird.4": "Daily observation matters: appetite, droppings, and posture changes can be early warning signs.",
  "home.wisdom.rabbit.1": "Rabbits need unlimited hay; it supports digestion and keeps teeth wearing down naturally.",
  "home.wisdom.rabbit.2": "Give rabbits hiding spaces and gentle floor-level interaction so they feel secure.",
  "home.wisdom.rabbit.3": "Sudden appetite loss in rabbits is urgent and should be checked quickly.",
  "home.wisdom.rabbit.4": "Rabbit spaces stay healthier when litter, hay, and water areas are refreshed daily.",
  "home.wisdom.reptile.1": "Stable temperature gradients are essential; check warm and cool zones with a reliable thermometer.",
  "home.wisdom.reptile.2": "Humidity needs vary by species, so match enclosure care to the animal, not the tank size.",
  "home.wisdom.reptile.3": "UVB bulbs weaken before they visibly burn out; replace them on schedule.",
  "home.wisdom.reptile.4": "Clean water bowls and hides often to prevent bacteria building up in warm enclosures.",
  "home.wisdom.hamster.1": "Hamsters need deep bedding for burrowing and a quiet place to sleep during the day.",
  "home.wisdom.hamster.2": "A solid running wheel protects tiny feet better than wire wheels.",
  "home.wisdom.hamster.3": "Scatter feeding adds enrichment and lets hamsters forage naturally.",
  "home.wisdom.hamster.4": "Handle hamsters close to a soft surface; sudden jumps can cause injuries.",
  "home.wisdom.other.1": "Small routine checks often catch pet issues early: appetite, water, energy, and bathroom habits.",
  "home.wisdom.other.2": "A predictable care rhythm helps most pets feel safer and easier to understand.",
  "home.wisdom.other.3": "Keep a simple note of unusual behaviour so patterns are easier to spot.",
  "home.wisdom.other.4": "When care advice conflicts, follow species-specific veterinary guidance first.",
};

const humanizeKey = (key: string) => {
  if (!key.includes(".")) return key;

  const leaf = key.split(".").at(-1) || key;
  return leaf
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const interpolate = (template: string, vars?: CopyVars) => {
  if (!vars) return template;
  return Object.entries(vars).reduce(
    (value, [name, replacement]) => value.replaceAll(`{${name}}`, String(replacement)),
    template,
  );
};

export const resolveCopy = (key: string, vars?: CopyVars) => {
  const template = ENGLISH_COPY[key] ?? humanizeKey(key);
  return interpolate(template, vars);
};
