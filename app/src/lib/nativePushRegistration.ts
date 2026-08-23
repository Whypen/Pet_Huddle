import { Platform } from "react-native";
import { nativeExactTokenRpc } from "./nativeExactTokenRequest";

export type NativePushRegistrationResult = {
  ok?: boolean;
  user_id?: string;
  deactivated_other_sessions?: number;
};

export async function registerNativePushTokenForSession(options: {
  accessToken?: string | null;
  deviceId: string;
  token: string;
}): Promise<NativePushRegistrationResult> {
  const platform = Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "web";
  const { data, error } = await nativeExactTokenRpc<NativePushRegistrationResult>(
    "register_native_push_token",
    {
      p_device_id: options.deviceId,
      p_platform: platform,
      p_token: options.token,
    },
    options.accessToken,
  );
  if (error) throw new Error(error.message || "push_token_registration_failed");
  return data || { ok: true };
}
