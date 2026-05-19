import { useState, useRef, useEffect } from "react";
import { usePlayer } from "@/contexts/PlayerContext";
import { useFavoritesContext } from "@/contexts/FavoritesContext";
import { useTranslation } from "@/contexts/LanguageContext";
import { umamiTrack } from "@/utils/umamiTracking";

import { useStreamBuffer } from "@/contexts/StreamBufferContext";
import { Play, Pause, ChevronDown, Volume2, Heart, Loader2, Share2, Cast, Radio, Download } from "lucide-react";
import { CastButton } from "@/components/CastButton";
import { AudioVisualizer } from "@/components/AudioVisualizer";
import { TimebackMachine } from "@/components/TimebackMachine";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import stationPlaceholder from "@/assets/station-placeholder.png";
import tbmLogo from "@/assets/tbm-logo.png";

const MARQUEE_SPEED = 40;

export function FullScreenPlayer({ onTagClick }: { onTagClick?: (tag: string) => void }) {
  const { currentStation, isPlaying, isBuffering, togglePlay, volume, setVolume, isFullScreen, closeFullScreen, isCasting, castDeviceName } = usePlayer();
  const { isFavorite, toggleFavorite } = useFavoritesContext();
  const { t } = useTranslation();
  
  const { isRecording, isLive, bufferAvailable, recordingAvailable } = useStreamBuffer();

  const [showTimeback, setShowTimeback] = useState(false);
  const [showSaveSheet, setShowSaveSheet] = useState(false);
  const [lastRecording, setLastRecording] = useState<{ blob: Blob; fileName: string } | null>(null);

  // Marquee
  const textContainerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [needsMarquee, setNeedsMarquee] = useState(false);
  const [marqueeDuration, setMarqueeDuration] = useState(10);

  useEffect(() => {
    if (!isFullScreen) return;

    const container = textContainerRef.current;
    if (!container) return;

    let rafId = 0;

    const check = () => {
      if (measureRef.current) {
        const textWidth = measureRef.current.scrollWidth;
        const containerWidth = container.clientWidth;
        const overflow = textWidth > containerWidth;
        setNeedsMarquee(overflow);
        if (overflow) {
          setMarqueeDuration(textWidth / MARQUEE_SPEED);
        }
      }
    };

    const scheduleCheck = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(check);
    };

    const observer = new ResizeObserver(scheduleCheck);
    observer.observe(container);
    scheduleCheck();

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [currentStation?.name, isFullScreen, isPlaying]);

  if (!isFullScreen || !currentStation) return null;

  const fav = isFavorite(currentStation.id);

  const handleShare = async () => {
    const text = currentStation.homepage
      ? `${t("player.nowPlaying")}: ${currentStation.name} — ${currentStation.homepage}`
      : `${t("player.nowPlaying")}: ${currentStation.name}`;
    const shareData = {
      title: currentStation.name,
      text,
      ...(currentStation.homepage ? { url: currentStation.homepage } : {}),
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(text);
        toast.success("Lien copié !");
      }
    } catch {
      try {
        await navigator.clipboard.writeText(text);
        toast.success("Lien copié !");
      } catch { /* silent */ }
    }
  };

  const handleOpenWebsite = async () => {
    if (!currentStation.homepage) return;
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url: currentStation.homepage });
    } catch {
      window.open(currentStation.homepage, "_blank");
    }
  };

  const handleRecordingResult = (result: { blob: Blob; fileName: string }) => {
    setLastRecording(result);
    setShowSaveSheet(true);
  };

  const handleExportRecording = async () => {
    if (!lastRecording) return;
    try {
      const { Share } = await import("@capacitor/share");
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = (reader.result as string).split(",")[1];
          const saved = await Filesystem.writeFile({
            path: lastRecording.fileName,
            data: base64,
            directory: Directory.Cache,
          });
          await Share.share({
            title: lastRecording.fileName,
            url: saved.uri,
          });
          setShowSaveSheet(false);
          setLastRecording(null);
        } catch (e) {
          console.error("[Export] failed:", e);
          toast.error(t("player.unexpectedError"));
        }
      };
      reader.onerror = () => {
        toast.error(t("player.unexpectedError"));
      };
      reader.readAsDataURL(lastRecording.blob);
    } catch {
      const url = URL.createObjectURL(lastRecording.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = lastRecording.fileName;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("player.fileSaved"));
      setShowSaveSheet(false);
      setLastRecording(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-y-auto animate-in slide-in-from-bottom duration-300">
      {/* Header */}
      <div className="relative flex items-start justify-between px-4 pb-2" style={{ paddingTop: "max(env(safe-area-inset-top, 24px), 1.5rem)" }}>
        <button
          onClick={closeFullScreen}
          aria-label={t("aria.close") || "Close"}
          className="w-10 h-10 rounded-full bg-gradient-to-br from-[hsl(220,90%,60%)] to-[hsl(280,80%,60%)] flex items-center justify-center text-white shadow-lg shadow-primary/40 hover:scale-105 hover:shadow-xl hover:shadow-primary/60 transition-all"
          style={{ boxShadow: '0 0 16px hsla(250, 80%, 50%, 0.45), 0 4px 14px -2px hsla(220, 90%, 60%, 0.35)' }}
        >
          <ChevronDown className="w-5 h-5" />
        </button>
        <span className="absolute left-1/2 top-[calc(max(env(safe-area-inset-top,24px),1.5rem)+0.75rem)] -translate-x-1/2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("player.nowPlaying")}
        </span>
        <div className="flex items-start gap-1 -mr-2">
          <CastButton />
          <div className="flex flex-col items-center gap-1">
            <button onClick={handleShare} className="p-2">
              <Share2 className="w-5 h-5 text-muted-foreground" />
            </button>
            {currentStation.homepage && (
              <button onClick={handleOpenWebsite} className="w-9 h-9 rounded-full bg-gradient-to-r from-[hsl(220,90%,60%)] to-[hsl(280,80%,60%)] flex items-center justify-center text-[10px] font-extrabold text-white shadow-md shadow-primary/30 hover:opacity-90 transition-opacity">
                www
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Artwork */}
      <div className="flex-1 flex items-center justify-center px-14">
        <div
          className="aspect-square rounded-2xl bg-accent shadow-2xl flex items-center justify-center overflow-hidden w-full max-w-[225px]"
          style={{ boxShadow: '0 20px 60px -10px hsla(250, 80%, 50%, 0.5), 0 10px 30px -5px hsla(220, 90%, 60%, 0.3)' }}
        >
          {currentStation.logo ? (
            <img src={currentStation.logo.replace('http://', 'https://')} alt={currentStation.name} loading="lazy" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).src = stationPlaceholder; }} />
          ) : (
            <img src={stationPlaceholder} alt={currentStation.name} className="w-full h-full object-cover" />
          )}
        </div>
      </div>

      {/* Cast indicator */}
      {isCasting && castDeviceName && (
        <div className="flex items-center justify-center gap-2 py-2">
          <Cast className="w-4 h-4 text-primary" />
          <span className="text-sm text-primary font-medium">{castDeviceName}</span>
        </div>
      )}

      {/* LIVE badge — centered */}
      <div className="flex items-center justify-center py-1">
        <div className={`flex items-center gap-1.5 px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${
          isPlaying
            ? "text-green-400 live-pulse"
            : "text-red-400"
        }`}
        style={{
          boxShadow: isPlaying
            ? '0 0 12px hsla(142, 71%, 45%, 0.4), 0 0 24px hsla(142, 71%, 45%, 0.2)'
            : '0 0 12px hsla(0, 71%, 45%, 0.4), 0 0 24px hsla(0, 71%, 45%, 0.2)'
        }}
        >
          <Radio className="w-3.5 h-3.5" />
          {t("player.live")}
        </div>
      </div>

      {/* Info & Controls */}
      <div className="px-6 pb-[calc(max(env(safe-area-inset-bottom,16px),1rem)+6rem)] space-y-4">
        {/* Title + Volume right layout */}
        <div className="flex items-start gap-3">
          {/* Left: title + tags + controls */}
          <div className="flex-1 min-w-0 space-y-4">
            <div className="relative">
              <div className="min-w-0 text-center px-12">
                {/* Station name with visualizer + marquee */}
                <div className="flex flex-col items-center gap-2 min-w-0">
                  {/* Hidden measurer */}
                  <span ref={measureRef} className="text-3xl sm:text-4xl font-heading font-bold whitespace-nowrap absolute invisible pointer-events-none">{currentStation.name}</span>
                  <div ref={textContainerRef} className="overflow-hidden w-full min-w-0">
                    <p
                      className={`text-3xl sm:text-4xl font-heading font-bold bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent whitespace-nowrap mx-auto ${needsMarquee ? "w-fit animate-marquee" : ""}`}
                      style={needsMarquee ? { animationDuration: `${marqueeDuration}s` } : undefined}
                    >
                      {needsMarquee
                        ? <>{currentStation.name}&nbsp;&nbsp;&nbsp;•&nbsp;&nbsp;&nbsp;{currentStation.name}&nbsp;&nbsp;&nbsp;•&nbsp;&nbsp;&nbsp;</>
                        : currentStation.name
                      }
                    </p>
                  </div>
                  {isPlaying && (
                    <div className="w-full overflow-hidden h-12 relative">
                      <img
                        src="/shiba-cursor.gif"
                        alt=""
                        aria-hidden="true"
                        className="absolute top-1/2 -translate-y-1/2 w-12 h-12 animate-shiba-run"
                        style={{ imageRendering: "pixelated" }}
                      />
                    </div>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {currentStation.tags.length > 0 ? currentStation.tags.slice(0, 2).join(' • ') : currentStation.country}
                </p>
              </div>
              <button
                onClick={() => toggleFavorite(currentStation)}
                className="absolute right-0 top-0 p-2 rounded-full hover:bg-accent transition-colors"
              >
                <Heart className={`w-6 h-6 ${fav ? "fill-[hsl(280,80%,60%)] text-[hsl(280,80%,60%)]" : "text-muted-foreground"}`} />
              </button>
            </div>

            {/* Tags */}
            {currentStation.tags.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2">
                {currentStation.tags.slice(0, 4).map((tag, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      if (onTagClick) {
                        closeFullScreen();
                        onTagClick(tag);
                      }
                    }}
                    className="px-3 py-1 rounded-full bg-accent text-xs text-foreground font-medium hover:bg-primary/20 active:bg-primary/30 transition-colors"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}

            {/* Controls: TBM + Play/Pause centered */}
            <div className="flex items-center justify-center gap-5">
              {/* TBM Button — w-32 h-32 (doubled from w-16) */}
              <button
                onClick={() => setShowTimeback(true)}
                className={`w-32 h-32 rounded-full flex items-center justify-center transition-all active:scale-95 overflow-hidden ${
                  bufferAvailable
                    ? "animate-tbm-glow"
                    : "animate-tbm-glow-idle"
                }`}
                style={{
                  background: 'hsl(0,0%,2%)',
                  border: '2px solid hsla(0,0%,10%,0.5)',
                  boxShadow: bufferAvailable
                    ? undefined
                    : '0 0 6px hsla(0,0%,45%,0.1), 0 0 14px hsla(0,0%,40%,0.06), 0 2px 8px rgba(0,0,0,0.5)',
                }}
              >
                <img src={tbmLogo} alt="Timeback Machine" className="w-[92%] h-[92%] object-cover rounded-full" />
              </button>

              {/* Play/Pause */}
              <button
                onClick={togglePlay}
                className={`w-16 h-16 rounded-full bg-gradient-to-b from-primary to-primary/80 border-t border-white/20 flex items-center justify-center text-primary-foreground active:shadow-sm active:translate-y-0.5 transition-all ${isPlaying ? "animate-play-breathe" : "shadow-lg shadow-primary/50"}`}
              >
                {isBuffering ? <Loader2 className="w-7 h-7 animate-spin" /> : isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-1" />}
              </button>
            </div>
          </div>

          {/* Right: vertical volume slider */}
          <div className="flex flex-col items-center gap-2 pt-2 flex-shrink-0" style={{ height: '160px' }}>
            <Volume2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <Slider
              value={[volume * 100]}
              onValueChange={([v]) => setVolume(v / 100)}
              max={100}
              step={1}
              orientation="vertical"
              className="h-full [&_[role=slider]]:bg-gradient-to-b [&_[role=slider]]:from-[hsl(220,90%,60%)] [&_[role=slider]]:to-[hsl(280,80%,60%)] [&_[role=slider]]:border-0 [&_.absolute]:bg-gradient-to-b [&_.absolute]:from-[hsl(220,90%,60%)] [&_.absolute]:to-[hsl(280,80%,60%)]"
            />
          </div>
        </div>

        {/* Codec / Bitrate / Language info */}
        <div className="grid grid-cols-3 gap-3 py-4 px-4 rounded-xl bg-accent/50">
          {(!currentStation.codec && !(currentStation.bitrate > 0) && !currentStation.language) ? (
            <p className="col-span-3 text-xs text-muted-foreground text-center">
              {t("player.noStreamInfo")}
            </p>
          ) : (
            <>
              {currentStation.codec && (
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">{t("player.codec")}</p>
                  <p className="text-sm font-semibold text-foreground">{currentStation.codec}</p>
                </div>
              )}
              {currentStation.bitrate > 0 && (
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">{t("player.bitrate")}</p>
                  <p className="text-sm font-semibold text-foreground">{currentStation.bitrate} kbps</p>
                </div>
              )}
              {currentStation.language && (
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">{t("player.language")}</p>
                  <p className="text-sm font-semibold text-foreground">{currentStation.language}</p>
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex justify-center">
          <a
            href="https://play.google.com/store/apps/details?id=com.fhm.radiosphere"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => umamiTrack("play-store-click", { location: "fullscreen-player" })}
            className="inline-flex items-center justify-center rounded-lg transition-all hover:scale-105 hover:shadow-lg hover:shadow-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label="Télécharger RadioSphere.be sur Google Play"
          >
            <img
              src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png"
              alt="Get it on Google Play"
              className="h-24 w-auto"
              loading="lazy"
            />
          </a>
        </div>
      </div>

      {/* Timeback Machine overlay */}
      {showTimeback && (
        <TimebackMachine
          onClose={() => setShowTimeback(false)}
          onRecordingResult={handleRecordingResult}
        />
      )}

      {/* Export Sheet */}
      {showSaveSheet && lastRecording && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-start justify-center" style={{ paddingTop: "max(env(safe-area-inset-top, 24px), 2rem)" }} onClick={() => { setShowSaveSheet(false); setLastRecording(null); }}>
          <div className="w-full max-w-md mx-4 bg-card rounded-2xl p-6 space-y-4 animate-in slide-in-from-top" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-foreground text-center">{t("player.recordingStopped")}</h3>
            <p className="text-sm text-muted-foreground text-center">{lastRecording.fileName}</p>
            <div className="flex flex-col gap-3">
              <button
                onClick={handleExportRecording}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-[hsl(220,90%,60%)] to-[hsl(280,80%,60%)] text-white font-semibold flex items-center justify-center gap-2"
              >
                <Download className="w-5 h-5" />
                {t("player.saveRecording")}
              </button>
              <button
                onClick={() => { setShowSaveSheet(false); setLastRecording(null); }}
                className="w-full py-3 text-muted-foreground text-sm"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
