import { useState, useRef } from "react";
import { useTranslation } from "@/contexts/LanguageContext";
import { useSleepTimer, SLEEP_TIMER_OPTIONS } from "@/contexts/SleepTimerContext";
import { useFavoritesContext } from "@/contexts/FavoritesContext";
import { cn } from "@/lib/utils";
import { Settings as SettingsIcon, Moon, ChevronDown, TimerOff, Heart, Download, Upload, RefreshCw, Wifi, Trash2, Zap } from "lucide-react";
import { LANGUAGE_OPTIONS } from "@/i18n/translations";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isNative } from "@/utils/nativeBridge";
import { UserGuideModal } from "@/components/UserGuideModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchStationByUrl } from "@/services/RadioService";
import { filterStationList } from "@/services/contentFilter";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { RadioStation } from "@/types/radio";
import { AboutFooter } from "@/components/AboutFooter";

function CollapsibleSection({ icon: Icon, title, badge, children }: { icon: React.ElementType; title: string; badge?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="w-full rounded-xl bg-accent p-4 mb-4 text-left transition-all">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2"
        type="button"
      >
        <Icon className="w-5 h-5 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {badge && <span className="ml-auto">{badge}</span>}
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform duration-300 ml-auto", open && "rotate-180")} />
      </button>
      <div
        className={cn(
          "overflow-hidden transition-all duration-300 ease-in-out",
          open ? "max-h-[800px] opacity-100 mt-3" : "max-h-0 opacity-0"
        )}
      >
        {children}
      </div>
    </div>
  );
}

interface SettingsPageProps {
  onReopenWelcome?: () => void;
  onResetApp?: () => void;
}

export function SettingsPage({ onReopenWelcome, onResetApp }: SettingsPageProps) {
  const { language, setLanguage, t } = useTranslation();
  const { isActive, formattedTime, startTimer, cancelTimer } = useSleepTimer();
  const { favorites, importFavorites } = useFavoritesContext();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [customMinutes, setCustomMinutes] = useState("");
  const [unavailableStations, setUnavailableStations] = useState<RadioStation[]>([]);
  const [showUnavailableDialog, setShowUnavailableDialog] = useState(false);

  return (
    <div className="flex-1 overflow-y-auto px-4 lg:px-8 pb-4">
      <div className="max-w-2xl mx-auto min-h-full flex flex-col">
        <div className="flex items-center gap-3 mt-6 mb-6">
          <SettingsIcon className="w-9 h-9 text-primary" />
          <h1 className="text-2xl lg:text-3xl font-heading font-bold bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(280,80%,60%)] bg-clip-text text-transparent drop-shadow-[0_0_12px_hsla(250,80%,60%,0.4)]">
            {t("nav.settings")}
          </h1>
        </div>

        {/* Language */}
        <div className="rounded-xl bg-accent p-4 mb-4">
          <h3 className="text-sm font-semibold text-foreground mb-1">{t("settings.language")}</h3>
          <p className="text-xs text-muted-foreground mb-3">{t("settings.languageDesc")}</p>
          <Select value={language} onValueChange={(v) => setLanguage(v as any)}>
            <SelectTrigger className="w-full rounded-lg bg-secondary text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <span className="inline-flex items-center gap-2"><img src={opt.flagUrl} alt={opt.label} className="w-5 h-4 object-cover rounded-sm" /> {opt.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Sleep Timer */}
        <CollapsibleSection
          icon={Moon}
          title={t("sleepTimer.title")}
          badge={
            isActive ? (
              <span className="inline-flex items-center gap-1 bg-primary/20 text-primary rounded-full px-2.5 py-0.5 text-[10px] font-semibold font-mono">
                ⏱ {formattedTime}
              </span>
            ) : null
          }
        >
          <div>
            <p className="text-xs text-muted-foreground mb-3">{t("sleepTimer.desc")}</p>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {SLEEP_TIMER_OPTIONS.map(opt => (
                <button
                  key={opt.minutes}
                  onClick={(e) => { e.stopPropagation(); startTimer(opt.minutes); }}
                  className={cn(
                    "py-2.5 rounded-lg text-xs font-semibold transition-all",
                    "bg-secondary text-muted-foreground hover:bg-primary hover:text-primary-foreground"
                  )}
                >
                  {t(`sleepTimer.${opt.minutes}`)}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mb-3">
              <Input
                type="number"
                min="1"
                max="999"
                placeholder={t("sleepTimer.customPlaceholder")}
                value={customMinutes}
                onChange={(e) => setCustomMinutes(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 h-9 text-xs bg-secondary border-border"
              />
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  const mins = parseInt(customMinutes);
                  if (mins > 0) {
                    startTimer(mins);
                    setCustomMinutes("");
                  }
                }}
                size="sm"
                className="h-9 px-4 text-xs font-semibold"
                disabled={!customMinutes || parseInt(customMinutes) <= 0}
              >
                {t("sleepTimer.customGo")}
              </Button>
            </div>
            {isActive && (
              <Button
                onClick={(e) => { e.stopPropagation(); cancelTimer(); }}
                variant="outline"
                size="sm"
                className="w-full rounded-lg border-destructive/30 text-destructive text-xs gap-1.5"
              >
                <TimerOff className="w-3.5 h-3.5" />
                {t("sleepTimer.cancel")}
              </Button>
            )}
          </div>
        </CollapsibleSection>

        {/* Favorites management */}
        <CollapsibleSection icon={Heart} title={t("favorites.manage")}>
          <div className="space-y-2">
            <Button
              onClick={async () => {
                const exportable = filterStationList(favorites);
                if (exportable.length === 0) {
                  toast({ title: t("favorites.noFavoritesToExport") });
                  return;
                }
                const header = "name,streamUrl,country,tags,homepage";
                const rows = exportable.map(s =>
                  [s.name, s.streamUrl, s.country, s.tags.join(";"), s.homepage]
                    .map(v => `"${(v || "").replace(/"/g, '""')}"`)
                    .join(",")
                );

                const csv = [header, ...rows].join("\n");
                if (isNative()) {
                  try {
                    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
                      import("@capacitor/filesystem"),
                      import("@capacitor/share"),
                    ]);
                    const result = await Filesystem.writeFile({
                      path: "radiosphere_favorites.csv",
                      data: btoa(unescape(encodeURIComponent(csv))),
                      directory: Directory.Cache,
                    });
                    await Share.share({ title: "RadioSphere.be Favorites", url: result.uri });
                  } catch {
                    toast({ title: `❌ ${t("favorites.importError")}`, variant: "destructive" });
                  }
                } else {
                  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "radiosphere_favorites.csv";
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                  toast({ title: `✅ ${t("favorites.exported")}` });
                }
              }}
              variant="outline"
              size="sm"
              className="w-full rounded-lg text-xs gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              {t("favorites.export")}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                  try {
                    const text = ev.target?.result as string;
                    const lines = text.split("\n").filter(l => l.trim());
                    const dataLines = lines.slice(1);
                    const stations: RadioStation[] = dataLines.map((line, i) => {
                      const cols: string[] = [];
                      let current = "";
                      let inQuotes = false;
                      for (let j = 0; j < line.length; j++) {
                        const ch = line[j];
                        if (inQuotes) {
                          if (ch === '"' && line[j + 1] === '"') { current += '"'; j++; }
                          else if (ch === '"') { inQuotes = false; }
                          else { current += ch; }
                        } else {
                          if (ch === '"') { inQuotes = true; }
                          else if (ch === ',') { cols.push(current); current = ""; }
                          else { current += ch; }
                        }
                      }
                      cols.push(current);
                      return {
                        id: `import-${Date.now()}-${i}`,
                        name: cols[0] || "Unknown",
                        streamUrl: cols[1] || "",
                        country: cols[2] || "",
                        countryCode: "",
                        tags: cols[3] ? cols[3].split(";").filter(Boolean) : [],
                        language: "",
                        codec: "",
                        bitrate: 0,
                        votes: 0,
                        clickcount: 0,
                        logo: "",
                        homepage: cols[4] || "",
                      };
                    }).filter(s => s.streamUrl);
                    const count = importFavorites(stations);
                    toast({ title: `✅ ${count} ${t("favorites.imported")}` });
                    if (count > 0) {
                      toast({ title: `🔄 ${t("favorites.refreshingMetadata")}` });
                      (async () => {
                        const notFound: RadioStation[] = [];
                        for (const station of stations) {
                          try {
                            const found = await searchStationByUrl(station.streamUrl);
                            if (found) {
                              importFavorites([{ ...found, id: found.id }]);
                            } else {
                              notFound.push(station);
                            }
                          } catch {
                            notFound.push(station);
                          }
                        }
                        toast({ title: `✅ ${t("favorites.metadataRefreshed")}` });
                        if (notFound.length > 0) {
                          setUnavailableStations(notFound);
                          setShowUnavailableDialog(true);
                        }
                      })();
                    }
                  } catch {
                    toast({ title: `❌ ${t("favorites.importError")}`, variant: "destructive" });
                  }
                };
                reader.readAsText(file);
                e.target.value = "";
              }}
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              size="sm"
              className="w-full rounded-lg text-xs gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              {t("favorites.import")}
            </Button>
            <Button
              onClick={async () => {
                if (favorites.length === 0) {
                  toast({ title: t("favorites.noFavoritesToExport") });
                  return;
                }
                toast({ title: `🔄 ${t("favorites.refreshingMetadata")}` });
                const notFound: RadioStation[] = [];
                for (const station of favorites) {
                  try {
                    const found = await searchStationByUrl(station.streamUrl);
                    if (found) {
                      importFavorites([{ ...found, id: found.id }]);
                    } else {
                      notFound.push(station);
                    }
                  } catch {
                    notFound.push(station);
                  }
                }
                toast({ title: `✅ ${t("favorites.metadataRefreshed")}` });
                if (notFound.length > 0) {
                  setUnavailableStations(notFound);
                  setShowUnavailableDialog(true);
                }
              }}
              variant="outline"
              size="sm"
              className="w-full rounded-lg text-xs gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {t("favorites.refreshMetadata")}
            </Button>
          </div>
        </CollapsibleSection>

        {/* User Guide */}
        <UserGuideModal onReopenWelcome={onReopenWelcome} />


        <div className="mt-auto pt-8">
          {/* Reset app */}
          {onResetApp && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="flex items-center justify-center gap-1.5 text-xs text-destructive hover:underline mb-4 mt-2 w-full">
                  <Trash2 className="w-3.5 h-3.5" />
                  {t("settings.resetApp")}
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("settings.resetApp")}</AlertDialogTitle>
                  <AlertDialogDescription>{t("settings.resetConfirm")}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                  <AlertDialogAction onClick={onResetApp} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    {t("settings.resetButton")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* Shared footer */}
          <AboutFooter />
        </div>

        {/* Unavailable stations dialog */}
        <Dialog open={showUnavailableDialog} onOpenChange={setShowUnavailableDialog}>
          <DialogContent className="max-w-sm rounded-xl">
            <DialogHeader>
              <DialogTitle className="text-sm">{t("favorites.unavailableStations")}</DialogTitle>
              <DialogDescription className="text-xs">{t("favorites.unavailableDesc")}</DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-60">
              <div className="space-y-2">
                {unavailableStations.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/50">
                    <Wifi className="w-3.5 h-3.5 text-destructive shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{s.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{s.streamUrl}</p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <DialogFooter>
              <DialogClose asChild>
                <Button size="sm" className="w-full text-xs">{t("favorites.understood")}</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
