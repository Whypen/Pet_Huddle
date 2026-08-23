export const withNativeMapAlertRouteContext = (
  path: string,
  context: {
    alertId?: string | null;
    alertLat?: number | null;
    alertLng?: number | null;
    alertType?: string | null;
    verifiedOnly?: boolean;
  },
) => {
  const [, rawQuery = ""] = path.split("?");
  const params = new URLSearchParams(rawQuery);
  if (!params.get("alert") && context.alertId) params.set("alert", context.alertId);
  if (!params.get("alertLat") && Number.isFinite(context.alertLat)) params.set("alertLat", String(context.alertLat));
  if (!params.get("alertLng") && Number.isFinite(context.alertLng)) params.set("alertLng", String(context.alertLng));
  if (!params.get("alertType") && context.alertType) params.set("alertType", context.alertType);
  if (!params.get("verifiedOnly") && context.verifiedOnly) params.set("verifiedOnly", "1");
  const query = params.toString();
  return query ? `/map?${query}` : "/map";
};
