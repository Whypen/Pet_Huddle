import * as Contacts from "expo-contacts";
import { publishNativePermissionDetail } from "./nativePermissionState";

const publishNativeContactPermission = (permission: Contacts.PermissionResponse) => {
  publishNativePermissionDetail("contacts", {
    canAskAgain: permission.canAskAgain,
    state: permission.status === "granted" ? "granted" : "denied",
  });
  return permission;
};

export const getNativeContactPermissionDetail = async () => (
  publishNativeContactPermission(await Contacts.getPermissionsAsync())
);

export async function requestNativeContactPermissionDetail() {
  const current = await getNativeContactPermissionDetail();
  if (current.status === "granted" || !current.canAskAgain) return current;
  return publishNativeContactPermission(await Contacts.requestPermissionsAsync());
}
