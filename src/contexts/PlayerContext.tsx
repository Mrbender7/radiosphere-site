import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from "react";
import { RadioStation } from "@/types/radio";
import { toast } from "@/hooks/use-toast";
import { reportStationClick } from "@/services/RadioService";
import { useTranslation } from "@/contexts/LanguageContext";
import { useCast } from "@/hooks/useCast";
import { SSLWarningDialog } from "@/components/SSLWarningDialog";
import { trackStationPlayed, umamiTrack } from "@/utils/umamiTracking";

/** Anti-zapping delay before sending the Umami "station-played" event (ms). */
const PLAY_TRACK_DELAY_MS = 30_000;

// Web Player only: lock screen / notification controls are handled by the browser MediaSession API.

// Global audio instance — survives React lifecycle, never destroyed by re-renders
// Exported so StreamBufferContext can swap src for seek-back
// Guarded for SSG and restrictive WebViews that throw on `new Audio()`.
const isBrowser = typeof window !== "undefined";

function safeNewAudio(): HTMLAudioElement {
  try {
    return new Audio();
  } catch (e) {
    console.warn("[RadioSphere] new Audio() failed (likely WebView restriction):", e);
    return ({} as HTMLAudioElement);
  }
}

export const globalAudio = isBrowser ? safeNewAudio() : ({} as HTMLAudioElement);
if (isBrowser) {
  try {
    (globalAudio as any).playsInline = true;
    globalAudio.preload = "auto";
  } catch { /* noop */ }
}

// Silent 1-second WAV as base64 data URI (~1KB) — keeps Android WebView process alive.
// Wrapped in try/catch because some in-app browser WebViews (Facebook/Instagram) reject
// data: audio URIs at construction time and would crash module import otherwise.
const SILENCE_DATA_URI = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
const silentAudio = isBrowser ? safeNewAudio() : ({} as HTMLAudioElement);
if (isBrowser) {
  try {
    silentAudio.loop = true;
    silentAudio.volume = 0.01;
    silentAudio.src = SILENCE_DATA_URI;
  } catch (e) {
    console.warn("[RadioSphere] silentAudio init failed (likely WebView restriction):", e);
  }
}

function startSilentLoop() {
  try { silentAudio.play?.().catch?.(() => {}); } catch { /* noop */ }
}

function stopSilentLoop() {
  try {
    silentAudio.pause?.();
    silentAudio.currentTime = 0;
  } catch { /* noop */ }
}

interface PlayerState {
  currentStation: RadioStation | null;
  isPlaying: boolean;
  isBuffering: boolean;
  volume: number;
  isFullScreen: boolean;
}

interface PlayerContextType extends PlayerState {
  play: (station: RadioStation) => void;
  togglePlay: () => void;
  setVolume: (v: number) => void;
  openFullScreen: () => void;
  closeFullScreen: () => void;
  isCastAvailable: boolean;
  isCasting: boolean;
  castDeviceName: string | null;
  castUiMode: import("@/hooks/useCast").CastUiMode;
  castInitState: import("@/hooks/useCast").CastInitState;
  startCast: () => void;
  stopCast: () => void;
}

const PlayerContext = createContext<PlayerContextType | null>(null);

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be inside PlayerProvider");
  return ctx;
}

export function PlayerProvider({ children, onStationPlay }: { children: React.ReactNode; onStationPlay?: (station: RadioStation) => void }) {
  const { t } = useTranslation();
  const { isCastAvailable, isCasting, castDeviceName, castUiMode, castInitState, startCast, stopCast, loadMedia: castLoadMedia, toggleCastPlayPause } = useCast();
  const audioRef = useRef<HTMLAudioElement>(globalAudio);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const isPlayingRef = useRef(false);
  const notifPermissionAsked = useRef(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingCanplayRef = useRef<(() => void) | null>(null);
  const pendingClearCanplayRef = useRef<(() => void) | null>(null);
  const pendingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedAtRef = useRef<number>(0);
  const currentStationRef = useRef<RadioStation | null>(null);
  const streamDeadRef = useRef(false);
  const reloadStreamRef = useRef<() => void>(() => {});
  // Umami "station-played" anti-zapping timer (only fires after PLAY_TRACK_DELAY_MS continuous playback)
  const playTrackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playTrackStationRef = useRef<RadioStation | null>(null);
  const [state, setState] = useState<PlayerState>({
    currentStation: null,
    isPlaying: false,
    isBuffering: false,
    volume: 0.8,
    isFullScreen: false,
  });

  // SSL warning state
  const [sslWarning, setSslWarning] = useState<{ station: RadioStation } | null>(null);
  const sslAcceptedUrls = useRef<Set<string>>(new Set());

  // isPlayingRef is now updated synchronously in play/pause handlers — no useEffect needed

  useEffect(() => {
    currentStationRef.current = state.currentStation;
  }, [state.currentStation]);

  // ---- Umami "station-played" anti-zapping helpers ----
  const cancelPlayTracking = useCallback(() => {
    if (playTrackTimerRef.current) {
      clearTimeout(playTrackTimerRef.current);
      playTrackTimerRef.current = null;
    }
    playTrackStationRef.current = null;
  }, []);

  const armPlayTracking = useCallback((station: RadioStation) => {
    // Always cancel any previous timer (station change, restart, etc.)
    if (playTrackTimerRef.current) {
      clearTimeout(playTrackTimerRef.current);
      playTrackTimerRef.current = null;
    }
    playTrackStationRef.current = station;
    playTrackTimerRef.current = setTimeout(() => {
      playTrackTimerRef.current = null;
      // Only track if the user is still on the same station and still playing
      if (
        isPlayingRef.current &&
        currentStationRef.current?.id === station.id
      ) {
        trackStationPlayed(station);
      }
      playTrackStationRef.current = null;
    }, PLAY_TRACK_DELAY_MS);
  }, []);

  const requestWakeLock = useCallback(async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      } catch {
        // WakeLock request failed
      }
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
  }, []);

  const startHeartbeat = useCallback(() => {
    if (heartbeatRef.current) return;
    heartbeatRef.current = setInterval(() => {
      const audio = audioRef.current;
      if (!isPlayingRef.current) return;

      // Skip heartbeat reload when playing a time-shift blob
      if (audio.src && audio.src.startsWith('blob:')) return;

      const isDead = (audio.paused && isPlayingRef.current) ||
        audio.networkState === 3 /* NETWORK_NO_SOURCE */ ||
        (audio.readyState < 2 && !audio.paused);

      if (isDead) {
        console.log("[RadioSphere] Heartbeat: stream appears dead (paused:", audio.paused,
          "networkState:", audio.networkState, "readyState:", audio.readyState, ")");
        reloadStreamRef.current();
      }
    }, 10000);
  }, [requestWakeLock]);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  // Reload stream completely (for dead stream recovery)
  const reloadStream = useCallback(() => {
    const audio = audioRef.current;
    const station = currentStationRef.current;
    if (!station || !station.streamUrl) return;
    if (retryCountRef.current >= 3) {
      console.warn("[RadioSphere] Max retries reached, giving up auto-reload");
      return;
    }
    retryCountRef.current += 1;
    console.log("[RadioSphere] Reloading stream (attempt", retryCountRef.current, "/ 3)");

    // Clean up pending listeners
    if (pendingCanplayRef.current) {
      audio.removeEventListener('canplay', pendingCanplayRef.current);
      pendingCanplayRef.current = null;
    }
    if (pendingClearCanplayRef.current) {
      audio.removeEventListener('canplay', pendingClearCanplayRef.current);
      pendingClearCanplayRef.current = null;
    }
    if (pendingTimeoutRef.current) {
      clearTimeout(pendingTimeoutRef.current);
      pendingTimeoutRef.current = null;
    }

    audio.pause();
    audio.removeAttribute('src');
    audio.load();

    setState(s => ({ ...s, isBuffering: true }));

    audio.src = station.streamUrl;
    audio.load();

    const onCanplay = () => {
      audio.play().then(() => {
        retryCountRef.current = 0;
        setState(s => ({ ...s, isPlaying: true, isBuffering: false }));
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
        startSilentLoop();
        startHeartbeat();
        requestWakeLock();
        console.log("[RadioSphere] Stream reloaded successfully");
      }).catch(() => {
        setState(s => ({ ...s, isPlaying: false, isBuffering: false }));
      });
      audio.removeEventListener('canplay', onCanplay);
      pendingCanplayRef.current = null;
    };
    audio.addEventListener('canplay', onCanplay);
    pendingCanplayRef.current = onCanplay;

    const timeout = setTimeout(() => {
      audio.removeEventListener('canplay', onCanplay);
      pendingCanplayRef.current = null;
      if (audio.readyState < 3) {
        console.warn("[RadioSphere] Stream reload timeout");
        setState(s => ({ ...s, isBuffering: false }));
      }
    }, 15000);
    pendingTimeoutRef.current = timeout;

    const clearTimeoutOnCanplay = () => {
      clearTimeout(timeout);
      pendingTimeoutRef.current = null;
      audio.removeEventListener('canplay', clearTimeoutOnCanplay);
      pendingClearCanplayRef.current = null;
    };
    audio.addEventListener('canplay', clearTimeoutOnCanplay);
    pendingClearCanplayRef.current = clearTimeoutOnCanplay;
  }, [requestWakeLock, startHeartbeat]);

  // Keep ref in sync
  useEffect(() => {
    reloadStreamRef.current = reloadStream;
  }, [reloadStream]);

  const updateMediaSession = useCallback((station: RadioStation, playing: boolean) => {
    if (!('mediaSession' in navigator)) return;
    // Use the app's own station placeholder when no logo — ensures the notification always shows a consistent image
    const artworkUrl = station.logo ? station.logo.replace('http://', 'https://') : new URL('/android-chrome-512x512.png', window.location.origin).href;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: station.name,
      artist: "RadioSphere.be",
      album: station.country || "Live",
      artwork: [{ src: artworkUrl, sizes: '512x512', type: 'image/png' }],
    });
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  }, []);

  // Shared play/pause handlers used by MediaSession controls
  const handlePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;
    isPlayingRef.current = true;
    audio.play().catch(() => { isPlayingRef.current = false; });
    startSilentLoop();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    setState(s => {
      if (s.currentStation) {
        updateMediaSession(s.currentStation, true);
      }
      return { ...s, isPlaying: true };
    });
    requestWakeLock();
    startHeartbeat();
  }, [requestWakeLock, startHeartbeat, updateMediaSession]);

  const handlePause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    isPlayingRef.current = false;
    pausedAtRef.current = Date.now();
    audio.pause();
    stopSilentLoop();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    setState(s => {
      if (s.currentStation) {
        updateMediaSession(s.currentStation, false);
      }
      return { ...s, isPlaying: false };
    });
    releaseWakeLock();
    stopHeartbeat();
    // Cancel any scheduled retry timers (stalled/ended) to prevent auto-restart after intentional pause
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    // Cancel "station-played" timer: pause within 30s = no Umami event sent
    cancelPlayTracking();
  }, [releaseWakeLock, stopHeartbeat, updateMediaSession, cancelPlayTracking]);

  // Register Media Session action handlers
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.setActionHandler('play', handlePlay);
    navigator.mediaSession.setActionHandler('pause', handlePause);
    navigator.mediaSession.setActionHandler('stop', handlePause);
    navigator.mediaSession.setActionHandler('seekbackward', null);
    navigator.mediaSession.setActionHandler('seekforward', null);
    navigator.mediaSession.setActionHandler('previoustrack', null);
    navigator.mediaSession.setActionHandler('nexttrack', null);

    return () => {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('stop', null);
      navigator.mediaSession.setActionHandler('seekbackward', null);
      navigator.mediaSession.setActionHandler('seekforward', null);
      navigator.mediaSession.setActionHandler('previoustrack', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
    };
  }, [handlePlay, handlePause]);

  useEffect(() => {
    const audio = audioRef.current;
    audio.volume = state.volume;

    const handleError = () => {
      if (audio.src && audio.src.startsWith('blob:')) {
        console.warn("[RadioSphere] Blob playback error ignored (time-shift), StreamBuffer will handle recovery");
        return;
      }

      // Detect mixed content / SSL errors: if the original stream URL was HTTP on an HTTPS page
      const station = currentStationRef.current;
      const isPageSecure = window.location.protocol === 'https:';
      const isStreamInsecure = station?.streamUrl?.startsWith('http://');
      if (isPageSecure && isStreamInsecure && station && !sslAcceptedUrls.current.has(station.streamUrl)) {
        console.warn("[RadioSphere] SSL/mixed-content error detected for:", station.streamUrl);
        setState(s => ({ ...s, isPlaying: false, isBuffering: false }));
        stopSilentLoop();
        stopHeartbeat();
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
        setSslWarning({ station });
        return;
      }

      streamDeadRef.current = true;
      console.error("[RadioSphere] Stream marked as dead (error event)");
      // Umami: track playback error with station name (no PII) to help DB cleanup
      if (station) {
        const mediaErr = audio.error;
        umamiTrack("stream-playback-error", {
          name: String(station.name ?? "unknown").slice(0, 80),
          country: station.country ?? "unknown",
          code: mediaErr?.code ?? 0,
          insecure: !!isStreamInsecure,
        });
      }
      isPlayingRef.current = false;
      setState(s => ({ ...s, isPlaying: false, isBuffering: false }));
      stopSilentLoop();
      stopHeartbeat();
      cancelPlayTracking();
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
      toast({ title: t("player.streamError"), description: t("player.streamErrorDesc"), variant: "destructive" });
    };
    audio.addEventListener("error", handleError);

    // Fires when audio actually starts playing (after canplay + play() resolves).
    // Deduped per station so heartbeat reloads don't spam events.
    let lastPlayTrackedId: string | null = null;
    const handlePlaying = () => {
      if (audio.src && audio.src.startsWith('blob:')) return; // time-shift, not a fresh stream start
      const station = currentStationRef.current;
      if (!station || station.id === lastPlayTrackedId) return;
      lastPlayTrackedId = station.id;
      umamiTrack("stream-play", {
        name: String(station.name ?? "unknown").slice(0, 80),
        country: station.country ?? "unknown",
      });
    };
    audio.addEventListener("playing", handlePlaying);

    const handleStalled = () => {
      if (!isPlayingRef.current) return;
      if (audio.src && audio.src.startsWith('blob:')) return;
      if (Date.now() - pausedAtRef.current < 3000) return; // recent intentional pause, ignore
      console.log("[RadioSphere] Stream stalled, scheduling reload in 2s");
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = setTimeout(() => {
        if (isPlayingRef.current && Date.now() - pausedAtRef.current >= 3000 && (audio.readyState < 2 || audio.networkState === 3)) {
          reloadStreamRef.current();
        }
      }, 2000);
    };
    const handleEnded = () => {
      if (!isPlayingRef.current) return;
      if (audio.src && audio.src.startsWith('blob:')) return;
      if (Date.now() - pausedAtRef.current < 3000) return; // recent intentional pause, ignore
      console.log("[RadioSphere] Stream ended, reloading in 2s");
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = setTimeout(() => {
        if (Date.now() - pausedAtRef.current >= 3000) {
          reloadStreamRef.current();
        }
      }, 2000);
    };
    audio.addEventListener("stalled", handleStalled);
    audio.addEventListener("ended", handleEnded);

    const keepAlive = () => {
      if (document.visibilityState === 'visible') {
        setTimeout(() => {
          const recentPause = Date.now() - pausedAtRef.current < 2000;
          if (isPlayingRef.current && !recentPause) {
            audio.play().catch(() => {});
            startSilentLoop();
            startHeartbeat();
            requestWakeLock();
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
          }
        }, 500);
      }
    };
    document.addEventListener('visibilitychange', keepAlive);

    return () => {
      audio.removeEventListener("error", handleError);
      audio.removeEventListener("playing", handlePlaying);
      audio.removeEventListener("stalled", handleStalled);
      audio.removeEventListener("ended", handleEnded);
      document.removeEventListener('visibilitychange', keepAlive);
      stopHeartbeat();
      releaseWakeLock();
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (playTrackTimerRef.current) clearTimeout(playTrackTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const playInternal = useCallback(async (station: RadioStation, bypassSSL = false) => {
    try {
      if (!station.streamUrl) {
        console.error('[RadioSphere] Cannot play station with no stream URL.');
        toast({ title: t("player.error"), description: t("player.streamUnavailable"), variant: "destructive" });
        return;
      }

      // Content firewall — never play a blocked station.
      if (!isStationSafe(station)) {
        console.warn('[RadioSphere] Playback blocked by content filter.');
        toast({ title: t("player.error"), description: t("player.streamUnavailable"), variant: "destructive" });
        return;
      }


      // Detect mixed content (HTTP stream on HTTPS page)
      const isPageSecure = window.location.protocol === 'https:';
      const isStreamInsecure = station.streamUrl.startsWith('http://');
      if (isPageSecure && isStreamInsecure && !bypassSSL && !sslAcceptedUrls.current.has(station.streamUrl)) {
        console.warn("[RadioSphere] Insecure stream detected:", station.streamUrl);
        setSslWarning({ station });
        return;
      }

      // --- CASTING MODE: Bypass local audio completely ---
      if (isCasting) {
        console.log("[RadioSphere] Cast is active, playing only on TV");
        const audio = audioRef.current;
        audio.pause();
        stopSilentLoop();
        stopHeartbeat();

        retryCountRef.current = 0;
        isPlayingRef.current = true;
        setState(s => ({ ...s, currentStation: station, isBuffering: false, isPlaying: true }));

        const secureLogo = station.logo?.replace('http://', 'https://');
        updateMediaSession({ ...station, logo: secureLogo }, true);

        onStationPlay?.(station);
        reportStationClick(station.id);
        requestWakeLock();
        // Arm 30s anti-zapping Umami tracker (cast playback also counts)
        armPlayTracking(station);

        castLoadMedia(station);
        return; // CRUCIAL: Stop execution here to prevent local streaming
      }

      // --- LOCAL PLAYBACK MODE ---
      const audio = audioRef.current;

      // --- Cleanup previous pending listeners/timeouts ---
      if (pendingCanplayRef.current) {
        audio.removeEventListener('canplay', pendingCanplayRef.current);
        pendingCanplayRef.current = null;
      }
      if (pendingClearCanplayRef.current) {
        audio.removeEventListener('canplay', pendingClearCanplayRef.current);
        pendingClearCanplayRef.current = null;
      }
      if (pendingTimeoutRef.current) {
        clearTimeout(pendingTimeoutRef.current);
        pendingTimeoutRef.current = null;
      }

      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      stopSilentLoop();
      stopHeartbeat();
      releaseWakeLock();
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';

      retryCountRef.current = 0;
      streamDeadRef.current = false;
      isPlayingRef.current = false;
      setState(s => ({ ...s, currentStation: station, isBuffering: true, isPlaying: false }));
      const secureLogo = station.logo?.replace('http://', 'https://');
      updateMediaSession({ ...station, logo: secureLogo }, true);

      if ('vibrate' in navigator) navigator.vibrate(10);
      audio.src = station.streamUrl;
      audio.load();

      const startPlayback = () => {
        audio.play()
          .then(() => {
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
            isPlayingRef.current = true;
            setState(s => ({ ...s, isPlaying: true, isBuffering: false }));
                startSilentLoop();
            startHeartbeat();
                // Arm 30s anti-zapping Umami tracker — only fires if still playing this station after 30s
            armPlayTracking(station);
          })
          .catch((e) => {
            console.error("[RadioSphere] Playback failed", e);
                stopSilentLoop();
            stopHeartbeat();
            releaseWakeLock();
            cancelPlayTracking();
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
            isPlayingRef.current = false;
            setState(s => ({ ...s, isPlaying: false, isBuffering: false }));
            toast({ title: t("player.streamError"), description: t("player.streamErrorDesc"), variant: "destructive" });
          });
        audio.removeEventListener('canplay', startPlayback);
        pendingCanplayRef.current = null;
      };
      audio.addEventListener('canplay', startPlayback);
      pendingCanplayRef.current = startPlayback;

      const timeout = setTimeout(() => {
        audio.removeEventListener('canplay', startPlayback);
        pendingCanplayRef.current = null;
        pendingTimeoutRef.current = null;
        if (audio.readyState < 3) {
          console.warn("[RadioSphere] Stream timeout — no canplay after 15s");
          audio.pause();
          audio.removeAttribute('src');
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
          setState(s => ({ ...s, isPlaying: false, isBuffering: false }));
          toast({ title: t("player.timeout"), description: t("player.timeoutDesc"), variant: "destructive" });
        }
      }, 15000);
      pendingTimeoutRef.current = timeout;

      const clearTimeoutOnCanplay = () => {
        clearTimeout(timeout);
        pendingTimeoutRef.current = null;
        audio.removeEventListener('canplay', clearTimeoutOnCanplay);
        pendingClearCanplayRef.current = null;
      };
      audio.addEventListener('canplay', clearTimeoutOnCanplay);
      pendingClearCanplayRef.current = clearTimeoutOnCanplay;

      onStationPlay?.(station);
      reportStationClick(station.id);
      requestWakeLock();

    } catch (e) {
      console.error("[RadioSphere] Unexpected error in play()", e);
      setState(s => ({ ...s, isPlaying: false, isBuffering: false }));
      toast({ title: t("player.unexpectedError"), description: t("player.unexpectedErrorDesc"), variant: "destructive" });
    }
  }, [onStationPlay, requestWakeLock, releaseWakeLock, updateMediaSession, startHeartbeat, stopHeartbeat, isCasting, castLoadMedia, armPlayTracking, cancelPlayTracking]);

  const play = useCallback((station: RadioStation) => {
    playInternal(station, false);
  }, [playInternal]);

  const handleSSLAccept = useCallback(() => {
    if (sslWarning) {
      sslAcceptedUrls.current.add(sslWarning.station.streamUrl);
      setSslWarning(null);
      playInternal(sslWarning.station, true);
    }
  }, [sslWarning, playInternal]);

  const handleSSLCancel = useCallback(() => {
    setSslWarning(null);
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!state.currentStation) return;

    if (isCasting) {
      // When casting: only control Chromecast, don't touch local audio
      toggleCastPlayPause();
      if (state.isPlaying) {
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
        setState(s => ({ ...s, isPlaying: false }));
        updateMediaSession(state.currentStation, false);
      } else {
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
        setState(s => ({ ...s, isPlaying: true }));
        updateMediaSession(state.currentStation, true);
      }
      return;
    }

    if (state.isPlaying) {
      isPlayingRef.current = false;
      pausedAtRef.current = Date.now();
      audio.pause();
      stopSilentLoop();
      stopHeartbeat();
      releaseWakeLock();
      cancelPlayTracking();
      retryCountRef.current = 0;
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
      setState(s => ({ ...s, isPlaying: false }));
      updateMediaSession(state.currentStation, false);
    } else {
      retryCountRef.current = 0;
      streamDeadRef.current = false;
      audio.play().then(() => {
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
        isPlayingRef.current = true;
        setState(s => ({ ...s, isPlaying: true }));
        startSilentLoop();
        startHeartbeat();
        requestWakeLock();
        updateMediaSession(state.currentStation!, true);
        // Resuming after pause = new listening session, re-arm 30s tracker
        if (state.currentStation) armPlayTracking(state.currentStation);
      }).catch(() => {
        console.log("[RadioSphere] togglePlay: play() failed, reloading stream");
        retryCountRef.current = 0;
        streamDeadRef.current = false;
        reloadStream();
      });
    }
  }, [state.isPlaying, state.currentStation, releaseWakeLock, requestWakeLock, updateMediaSession, startHeartbeat, stopHeartbeat, reloadStream, isCasting, toggleCastPlayPause, armPlayTracking, cancelPlayTracking]);

  const setVolume = useCallback((v: number) => {
    if (audioRef.current) audioRef.current.volume = v;
    setState(s => ({ ...s, volume: v }));
  }, []);

  // Auto-push media to Chromecast when session starts or station changes
  // Also pause/resume local audio on Cast connect/disconnect
  const lastCastStationIdRef = useRef<string | null>(null);
  const wasCastingRef = useRef(false);
  useEffect(() => {
    const audio = audioRef.current;

    if (isCasting && !wasCastingRef.current) {
      // Cast just connected → pause local audio
      console.log("[RadioSphere] Cast connected — pausing local audio");
      audio.pause();
      stopSilentLoop();
      stopHeartbeat();
    } else if (!isCasting && wasCastingRef.current) {
      // Cast just disconnected → resume local audio if we were playing
      console.log("[RadioSphere] Cast disconnected — resuming local audio");
      if (state.isPlaying && state.currentStation) {
        // Use reloadStreamRef to completely re-init the local HTMLAudioElement 
        // since we bypassed its loading while casting!
        reloadStreamRef.current();
      }
    }
    wasCastingRef.current = isCasting;

    if (isCasting && state.currentStation) {
      // Guard: don't re-push the same station
      if (lastCastStationIdRef.current !== state.currentStation.id) {
        lastCastStationIdRef.current = state.currentStation.id;
        castLoadMedia(state.currentStation);
      }
    }
    if (!isCasting) {
      lastCastStationIdRef.current = null;
    }
  }, [isCasting, state.currentStation, state.isPlaying, castLoadMedia]);

  const openFullScreen = useCallback(() => setState(s => ({ ...s, isFullScreen: true })), []);
  const closeFullScreen = useCallback(() => setState(s => ({ ...s, isFullScreen: false })), []);

  return (
    <PlayerContext.Provider value={{ ...state, play, togglePlay, setVolume, openFullScreen, closeFullScreen, isCastAvailable, isCasting, castDeviceName, castUiMode, castInitState, startCast, stopCast }}>
      {children}
      <SSLWarningDialog
        open={!!sslWarning}
        stationName={sslWarning?.station.name || ""}
        onAcceptRisk={handleSSLAccept}
        onCancel={handleSSLCancel}
      />
    </PlayerContext.Provider>
  );
}
