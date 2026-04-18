import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { openExternalUrl } from "@/lib/nativeShell";

export type DiscoverLocationPermissionStatus = "granted" | "prompt" | "denied" | "unsupported";
export type DiscoverLocationServicesStatus = "enabled" | "disabled" | "unknown";

export type DiscoverLocationAnchor = {
  lat: number;
  lng: number;
  source: "device";
};

type DiscoverLocationGateState = {
  permissionStatus: DiscoverLocationPermissionStatus;
  locationServicesStatus: DiscoverLocationServicesStatus;
  canShowDiscover: boolean;
  anchor: DiscoverLocationAnchor | null;
  checking: boolean;
};

type DiscoverLocationRefreshResult = {
  permissionStatus: DiscoverLocationPermissionStatus;
  locationServicesStatus: DiscoverLocationServicesStatus;
  canShowDiscover: boolean;
  anchor: DiscoverLocationAnchor | null;
};

const GEO_TIMEOUT_MS = 6_000;
const GEO_MAX_AGE_MS = 60_000;

const detectPlatform = () => {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  return {
    isIOS: /iPhone|iPad|iPod/i.test(ua),
    isAndroid: /Android/i.test(ua),
  };
};

const getCurrentPosition = () =>
  new Promise<GeolocationPosition>((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("geolocation_unavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: GEO_TIMEOUT_MS,
      maximumAge: GEO_MAX_AGE_MS,
    });
  });

const openLocationSettings = (target: "app" | "services") => {
  const { isIOS, isAndroid } = detectPlatform();
  if (isIOS) {
    openExternalUrl(
      target === "services" ? "App-Prefs:root=Privacy&path=LOCATION" : "app-settings:",
      target === "services" ? "discover-location-services" : "discover-app-settings",
    );
    return;
  }
  if (isAndroid) {
    openExternalUrl(
      target === "services"
        ? "intent:#Intent;action=android.settings.LOCATION_SOURCE_SETTINGS;end"
        : "intent:#Intent;action=android.settings.APPLICATION_DETAILS_SETTINGS;end",
      target === "services" ? "discover-location-services" : "discover-app-settings",
    );
    return;
  }
  toast.info("Open your browser or device settings and allow Location for Huddle.");
};

export const useDiscoverLocationGate = (active: boolean) => {
  const [state, setState] = useState<DiscoverLocationGateState>({
    permissionStatus: "prompt",
    locationServicesStatus: "unknown",
    canShowDiscover: false,
    anchor: null,
    checking: false,
  });
  const refreshNonceRef = useRef(0);

  const setBlockedState = useCallback(
    (
      permissionStatus: DiscoverLocationPermissionStatus,
      locationServicesStatus: DiscoverLocationServicesStatus,
      checking = false,
    ) => {
      setState({
        permissionStatus,
        locationServicesStatus,
        canShowDiscover: false,
        anchor: null,
        checking,
      });
    },
    [],
  );

  const refreshLocationState = useCallback(
    async (options?: { requestPermission?: boolean }) => {
      const requestPermission = options?.requestPermission === true;
      const refreshId = Date.now();
      refreshNonceRef.current = refreshId;

      if (typeof navigator === "undefined" || !navigator.geolocation) {
        setBlockedState("unsupported", "disabled");
        return {
          permissionStatus: "unsupported",
          locationServicesStatus: "disabled",
          canShowDiscover: false,
          anchor: null,
        } satisfies DiscoverLocationRefreshResult;
      }

      setState((prev) => ({ ...prev, checking: true }));

      let permissionStatus: DiscoverLocationPermissionStatus = "prompt";
      if (navigator.permissions?.query) {
        try {
          const permission = await navigator.permissions.query({
            name: "geolocation" as PermissionName,
          });
          permissionStatus =
            permission.state === "granted" || permission.state === "prompt" || permission.state === "denied"
              ? permission.state
              : "prompt";
        } catch {
          permissionStatus = "unsupported";
        }
      } else {
        permissionStatus = "unsupported";
      }

      if (!requestPermission && permissionStatus !== "granted") {
        if (refreshNonceRef.current !== refreshId) return null;
        setBlockedState(permissionStatus, "unknown");
        return {
          permissionStatus,
          locationServicesStatus: "unknown",
          canShowDiscover: false,
          anchor: null,
        } satisfies DiscoverLocationRefreshResult;
      }

      try {
        const position = await getCurrentPosition();
        if (refreshNonceRef.current !== refreshId) return null;
        const nextAnchor = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          source: "device" as const,
        };
        setState({
          permissionStatus: "granted",
          locationServicesStatus: "enabled",
          canShowDiscover: true,
          anchor: nextAnchor,
          checking: false,
        });
        return {
          permissionStatus: "granted",
          locationServicesStatus: "enabled",
          canShowDiscover: true,
          anchor: nextAnchor,
        } satisfies DiscoverLocationRefreshResult;
      } catch (error) {
        const geoError = error as GeolocationPositionError | Error | null;
        const code = typeof geoError === "object" && geoError && "code" in geoError ? Number(geoError.code) : 0;
        if (refreshNonceRef.current !== refreshId) return null;
        if (code === 1) {
          setBlockedState("denied", "unknown");
          return {
            permissionStatus: "denied",
            locationServicesStatus: "unknown",
            canShowDiscover: false,
            anchor: null,
          } satisfies DiscoverLocationRefreshResult;
        }
        setBlockedState(permissionStatus === "granted" ? "granted" : permissionStatus, "disabled");
        return {
          permissionStatus: permissionStatus === "granted" ? "granted" : permissionStatus,
          locationServicesStatus: "disabled",
          canShowDiscover: false,
          anchor: null,
        } satisfies DiscoverLocationRefreshResult;
      }
    },
    [setBlockedState],
  );

  const handleEnableLocation = useCallback(async () => {
    if (state.permissionStatus === "denied") {
      openLocationSettings("app");
      return;
    }
    if (state.locationServicesStatus === "disabled") {
      openLocationSettings("services");
      return;
    }

    const result = await refreshLocationState({ requestPermission: true });
    if (result?.canShowDiscover) return;
    if (result?.permissionStatus === "denied") {
      openLocationSettings("app");
      return;
    }
    if (result?.locationServicesStatus === "disabled") {
      openLocationSettings("services");
      return;
    }
  }, [refreshLocationState, state.locationServicesStatus, state.permissionStatus]);

  useEffect(() => {
    if (!active) return;
    void refreshLocationState();

    const recheck = () => {
      void refreshLocationState();
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      recheck();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", recheck);
    window.addEventListener("huddle:native-resume", recheck as EventListener);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", recheck);
      window.removeEventListener("huddle:native-resume", recheck as EventListener);
    };
  }, [active, refreshLocationState]);

  return useMemo(
    () => ({
      ...state,
      handleEnableLocation,
      refreshLocationState,
    }),
    [handleEnableLocation, refreshLocationState, state],
  );
};
