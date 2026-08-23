/**
 * Topic naming for the Social new-post invalidation bus.
 *
 * Must stay byte-identical to private.social_realtime_topic() in Postgres — the
 * trigger publishes to the topic this produces, so any drift silently stops delivery
 * rather than erroring.
 *
 * SINGLE GLOBAL TOPIC, deliberately.
 *
 * This was briefly country-scoped (`social:<post_country>`), built on the assumption
 * that Social had a geo boundary. It does not: scope is a ranking weight only, never
 * a visibility gate, so every reader can surface every post. Country-scoping the bus
 * was therefore both conceptually wrong and actively broken — alert cross-posts are
 * inserted with post_country NULL, so they published to `social:global` while readers
 * listened on `social:<their country>` and never received the ping.
 *
 * One topic for every post and every reader. Fan-out cost is unchanged: the payload
 * carries no row data, readers only refresh what is already on their screen.
 */
export const NATIVE_SOCIAL_GLOBAL_REALTIME_TOPIC = "social:global";

export const nativeSocialRealtimeTopic = () => NATIVE_SOCIAL_GLOBAL_REALTIME_TOPIC;
