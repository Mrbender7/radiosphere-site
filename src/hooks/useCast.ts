import { useState, useEffect, useCallback, useRef } from "react";
import { RadioStation } from "@/types/radio";
import { isInAppBrowser } from "@/utils/inAppBrowser";
import { isNative as isCapacitorNativeEnv, loadCapacitorPlugin } from "@/utils/nativeBridge";

const CAST_APP_ID = "CC1AD845";

declare global {
  interface Window {
    __onGCastApiAvailable?: (isAvailable: boolean) => void;
    __castSdkReady?: boolean;
    cast?: any;
    chrome?: any;
  }
  // eslint-disable-next-line no-var
  var chrome: any;
}

// ─── Native Capacitor Cast Plugin interface ─────────────────────────
interface CastPluginInterface {
  initialize(): Promise<{ initialized: boolean; available: boolean; permissionsGranted?: boolean; appId?: string }>;
  requestSession(): Promise<void>;
  endSession(): Promise<void>;
  loadMedia(options: {
    streamUrl: string;
    title: string;
    logo: string;
    tags: string;
    stationId: string;
  }): Promise<void>;
  togglePlayPause(): Promise<void>;
  checkDiscoveryPermissions(): Promise<{ granted: boolean; apiLevel: number }>;
  requestDiscoveryPermissions(): Promise<{ granted: boolean }>;
  addListener(event: string, callback: (data: any) => void): Promise<{ remove: () => void }>;
}

let CastPluginInstance: CastPluginInterface | null = null;
let CastPluginPromise: Promise<CastPluginInterface | null> | null = null;
async function getCastPlugin(): Promise<CastPluginInterface | null> {
  if (CastPluginInstance) return CastPluginInstance;
  if (!CastPluginPromise) {
    CastPluginPromise = loadCapacitorPlugin<CastPluginInterface>("CastPlugin").then((p) => {
      CastPluginInstance = p;
      return p;
    });
  }
  return CastPluginPromise;
}

// ─── Platform detection ─────────────────────────────────────────────
const isCapacitorNative = isCapacitorNativeEnv;

export type CastUiMode = "launcher" | "native" | "fallback";
export type CastInitState = "idle" | "initializing" | "ready" | "unavailable";

export function useCast() {
  const [isCastAvailable, setIsCastAvailable] = useState(false);
  const [isCasting, setIsCasting] = useState(false);
  const [castDeviceName, setCastDeviceName] = useState<string | null>(null);
  const [castUiMode, setCastUiMode] = useState<CastUiMode>("fallback");
  const [castInitState, setCastInitState] = useState<CastInitState>("idle");
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const initDoneRef = useRef(false);
  const remotePlayerRef = useRef<any>(null);
  const remotePlayerControllerRef = useRef<any>(null);
  const isNative = useRef(isCapacitorNative()).current;

  useEffect(() => {
    if (initDoneRef.current) return;
    initDoneRef.current = true;
    setCastInitState("initializing");

    // In-app browsers (Facebook, Instagram, …) cannot Cast and the SDK
    // adds noise/errors there. Skip immediately so the rest of the app stays snappy.
    if (!isNative && isInAppBrowser()) {
      console.log("[RadioSphere][Cast] In-app WebView detected → skipping Cast init");
      setCastUiMode("fallback");
      setCastInitState("unavailable");
      setIsCastAvailable(false);
      return;
    }

    if (isNative) {
      // ─── NATIVE PATH ─────────────────────────────────────────
      console.log("[RadioSphere][Cast] Native platform, initializing CastPlugin...");
      setCastUiMode("native");

      const initNativeCast = async () => {
        try {
          const plugin = await getCastPlugin();
          if (!plugin) {
            console.warn("[RadioSphere][Cast] CastPlugin unavailable on this platform");
            setCastInitState("unavailable");
            setIsCastAvailable(false);
            return;
          }

          const permStatus = await plugin.checkDiscoveryPermissions();
          console.log("[RadioSphere][Cast] checkDiscoveryPermissions:", JSON.stringify(permStatus));

          let granted = permStatus.granted;
          if (!granted) {
            console.log("[RadioSphere][Cast] Permissions manquantes, demande en cours...");
            const permResult = await plugin.requestDiscoveryPermissions();
            console.log("[RadioSphere][Cast] requestDiscoveryPermissions:", JSON.stringify(permResult));
            granted = permResult.granted;
          }

          setPermissionsGranted(granted);
          if (!granted) {
            console.warn("[RadioSphere][Cast] Permissions Cast refusées: découverte indisponible");
            setIsCastAvailable(false);
            setCastInitState("unavailable");
            return;
          }

          const result = await plugin.initialize();
          console.log("[RadioSphere][Cast] CastPlugin initialized:", JSON.stringify(result));
          console.log("[RadioSphere][Cast] initialized=" + result.initialized + ", available=" + result.available + ", appId=" + (result.appId || "N/A"));

          const initialized = !!result.initialized;
          const available = !!result.available;
          setIsCastAvailable(available);
          setPermissionsGranted(result.permissionsGranted ?? granted);
          setCastInitState(initialized ? "ready" : "unavailable");

          if (!initialized) {
            console.warn("[RadioSphere][Cast] initialize() n'a pas retourné initialized=true");
          }

          plugin.addListener("castDevicesAvailable", (data: any) => {
            console.log("[RadioSphere][Cast] castDevicesAvailable event:", JSON.stringify(data));
            setIsCastAvailable(data.available);
          });

          plugin.addListener("castStateChanged", (data: any) => {
            console.log("[RadioSphere][Cast] castStateChanged event:", JSON.stringify(data));
            if (!data.connected && data.errorCode !== undefined) {
              console.error(`[RadioSphere][Cast] ❌ Session failed — errorCode=${data.errorCode}, reason=${data.reason || "unknown"}`);
            }
            setIsCasting(data.connected);
            setCastDeviceName(data.connected ? data.deviceName : null);
          });

          plugin.addListener("localAudioControl", (data: any) => {
            console.log("[RadioSphere][Cast] localAudioControl event:", JSON.stringify(data));
          });
        } catch (err) {
          console.warn("[RadioSphere][Cast] CastPlugin init error:", err);
          setCastInitState("unavailable");
          setIsCastAvailable(false);
        }
      };

      void initNativeCast();

      return;
    }

    // ─── WEB PATH ────────────────────────────────────────────────
    console.log("[RadioSphere][Cast] Web platform, initializing Cast SDK...");

    let webInitDone = false;
    const initWebCastContext = () => {
      if (webInitDone) return;
      const cast = window.cast;
      if (!cast?.framework) {
        console.warn("[RadioSphere][Cast] cast.framework not available at init time");
        setCastUiMode("fallback");
        setCastInitState("unavailable");
        return;
      }

      webInitDone = true;
      console.log("[RadioSphere][Cast] Initializing CastContext with App ID:", CAST_APP_ID);

      try {
        cast.framework.CastContext.getInstance().setOptions({
          receiverApplicationId: CAST_APP_ID,
          autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
        });

        const ctx = cast.framework.CastContext.getInstance();

        ctx.addEventListener(
          cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
          (event: any) => {
            const session = ctx.getCurrentSession();
            if (
              event.sessionState === cast.framework.SessionState.SESSION_STARTED ||
              event.sessionState === cast.framework.SessionState.SESSION_RESUMED
            ) {
              setIsCasting(true);
              setCastDeviceName(session?.getCastDevice()?.friendlyName || null);
              remotePlayerRef.current = new cast.framework.RemotePlayer();
              remotePlayerControllerRef.current = new cast.framework.RemotePlayerController(remotePlayerRef.current);
            } else if (
              event.sessionState === cast.framework.SessionState.SESSION_ENDED
            ) {
              setIsCasting(false);
              setCastDeviceName(null);
              remotePlayerRef.current = null;
              remotePlayerControllerRef.current = null;
            }
          }
        );

        ctx.addEventListener(
          cast.framework.CastContextEventType.CAST_STATE_CHANGED,
          (event: any) => {
            const available = event.castState !== cast.framework.CastState.NO_DEVICES_AVAILABLE;
            console.log("[RadioSphere][Cast] Cast state:", event.castState, "available:", available);
            setIsCastAvailable(available);
          }
        );

        setCastUiMode("launcher");
        setCastInitState("ready");
        setIsCastAvailable(true);
        setPermissionsGranted(true);
        console.log("[RadioSphere][Cast] CastContext initialized ✓");
      } catch (e) {
        console.warn("[RadioSphere][Cast] SDK init error:", e);
        setCastUiMode("fallback");
        setCastInitState("unavailable");
      }
    };

    if (window.cast?.framework || window.__castSdkReady) {
      console.log("[RadioSphere][Cast] SDK already available, init immediately");
      initWebCastContext();
    }

    const prevCallback = window.__onGCastApiAvailable;
    window.__onGCastApiAvailable = (isAvailable: boolean) => {
      console.log("[RadioSphere][Cast] __onGCastApiAvailable:", isAvailable);
      if (isAvailable) {
        initWebCastContext();
      } else {
        setCastUiMode("fallback");
        setCastInitState("unavailable");
      }
    };

    const handleBridgeEvent = () => {
      console.log("[RadioSphere][Cast] castSdkReady event received");
      initWebCastContext();
    };
    window.addEventListener("castSdkReady", handleBridgeEvent);

    const safetyTimeout = setTimeout(() => {
      if (!webInitDone) {
        console.log("[RadioSphere][Cast] Safety timeout: SDK never loaded → fallback");
        setCastUiMode("fallback");
        setCastInitState("unavailable");
      }
    }, 10000);

    return () => {
      clearTimeout(safetyTimeout);
      window.removeEventListener("castSdkReady", handleBridgeEvent);
    };
  }, [isNative]);

  const startCast = useCallback(async () => {
    if (isNative) {
      const plugin = await getCastPlugin();
      if (!plugin) return;
      try {
        await plugin.requestSession();
      } catch (e) {
        console.warn("[RadioSphere][Cast] requestSession error:", e);
      }
    } else {
      try {
        window.cast?.framework?.CastContext?.getInstance()?.requestSession();
      } catch (e) {
        console.warn("[RadioSphere][Cast] Cast request error:", e);
      }
    }
  }, [isNative]);

  const stopCast = useCallback(() => {
    if (isNative) {
      void (async () => {
        const plugin = await getCastPlugin();
        if (!plugin) return;
        plugin.endSession().catch((e) =>
          console.warn("[RadioSphere][Cast] endSession error:", e)
        );
      })();
    } else {
      try {
        window.cast?.framework?.CastContext?.getInstance()?.getCurrentSession()?.endSession(true);
      } catch (e) {
        console.warn("[RadioSphere][Cast] Cast stop error:", e);
      }
    }
  }, [isNative]);

  const loadMedia = useCallback(
    (station: RadioStation) => {
      if (isNative) {
        console.log("[RadioSphere][Cast] loadMedia (native):", station.name, "URL:", station.streamUrl);
        void (async () => {
          const plugin = await getCastPlugin();
          if (!plugin) return;
          plugin.loadMedia({
            streamUrl: station.streamUrl,
            title: station.name,
            logo: station.logo || "",
            tags: (station.tags || []).join(","),
            stationId: station.id,
          }).catch((e) =>
            console.warn("[RadioSphere][Cast] loadMedia error:", e)
          );
        })();
      } else {
        try {
          const session = window.cast?.framework?.CastContext?.getInstance()?.getCurrentSession();
          if (!session) return;

          const chr = window.chrome;
          const contentType = detectCastContentType(station);
          // Send stream URL as-is (no HTTPS forcing — was breaking HTTP-only streams)
          const mediaInfo = new chr.cast.media.MediaInfo(station.streamUrl, contentType);
          mediaInfo.streamType = chr.cast.media.StreamType.LIVE;
          mediaInfo.metadata = new chr.cast.media.MusicTrackMediaMetadata();
          mediaInfo.metadata.title = station.name;
          mediaInfo.metadata.artist = "RadioSphere.be";

          const logoUrl = station.logo
            ? station.logo.replace("http://", "https://")
            : `${window.location.origin}/favicon.png`;
          mediaInfo.metadata.images = [new chr.cast.Image(logoUrl)];

          mediaInfo.customData = {
            tags: station.tags || [],
            stationId: station.id,
          };

          const request = new chr.cast.media.LoadRequest(mediaInfo);
          session.loadMedia(request).then(
            () => console.log("[RadioSphere][Cast] Media loaded", { contentType, url: station.streamUrl }),
            (err: any) => console.warn("[RadioSphere][Cast] Load error:", err)
          );
        } catch (e) {
          console.warn("[RadioSphere][Cast] loadMedia error:", e);
        }
      }
    },
    [isNative]
  );

  const toggleCastPlayPause = useCallback(() => {
    if (isNative) {
      void (async () => {
        const plugin = await getCastPlugin();
        if (!plugin) return;
        plugin.togglePlayPause().catch((e) =>
          console.warn("[RadioSphere][Cast] togglePlayPause error:", e)
        );
      })();
    } else {
      if (remotePlayerControllerRef.current) {
        remotePlayerControllerRef.current.playOrPause();
      }
    }
  }, [isNative]);

  return {
    isCastAvailable,
    isCasting,
    castDeviceName,
    castUiMode,
    castInitState,
    permissionsGranted,
    startCast,
    stopCast,
    loadMedia,
    toggleCastPlayPause,
  };
}
