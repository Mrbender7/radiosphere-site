import { useState, useEffect } from "react";
import { Home, Compass, Heart, Info, Mail, HelpCircle, ExternalLink, X, ChevronLeft, ChevronRight, Globe, ChevronDown, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/contexts/LanguageContext";
import { umamiTrack } from "@/utils/umamiTracking";
import { LANGUAGE_OPTIONS, type Language } from "@/i18n/translations";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import type { TabId } from "@/components/BottomNav";
import radioSphereLogo from "@/assets/new-radio-logo.png";
import tbmLogo from "@/assets/tbm-logo.png";
import podcastLogo from "@/assets/podcastsphere-logo.png";
import googlePlayIcon from "@/assets/google-play-icon.png";

const navItems = [
  { id: "home" as TabId, labelKey: "nav.home", icon: Home },
  { id: "search" as TabId, labelKey: "nav.explore", icon: Compass },
  { id: "library" as TabId, labelKey: "nav.favorites", icon: Heart },
  { id: "settings" as TabId, labelKey: "nav.settings", icon: Settings },
  { id: "about" as TabId, labelKey: "nav.about", icon: Info },
];

const SIDEBAR_COLLAPSED_KEY = "radiosphere_sidebar_collapsed";
const TBM_TEASER_DISMISSED_KEY = "radiosphere_tbm_teaser_dismissed";

function readBool(key: string, fallback: boolean): boolean {
  try { return localStorage.getItem(key) === "true" ? true : fallback; } catch { return fallback; }
}

interface DesktopSidebarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

export function DesktopSidebar({ activeTab, onTabChange }: DesktopSidebarProps) {
  const { t, language, setLanguage } = useTranslation();
  const currentLangOption = LANGUAGE_OPTIONS.find(o => o.value === language) ?? LANGUAGE_OPTIONS[0];
  const [tbmModalOpen, setTbmModalOpen] = useState(false);
  // Defaults must match SSG output (false) to avoid React hydration mismatch
  // (#418/#423) which freezes the app. Restore from localStorage post-mount.
  const [collapsed, setCollapsed] = useState(false);
  const [tbmDismissed, setTbmDismissed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setCollapsed(readBool(SIDEBAR_COLLAPSED_KEY, false));
    setTbmDismissed(readBool(TBM_TEASER_DISMISSED_KEY, false));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed)); } catch {}
  }, [collapsed, hydrated]);

  const handleDismissTbm = () => {
    setTbmDismissed(true);
    try { localStorage.setItem(TBM_TEASER_DISMISSED_KEY, "true"); } catch {}
  };

  const tbmSections = [
    { titleKey: "tbmModal.bufferTitle", descKey: "tbmModal.bufferDesc" },
    { titleKey: "tbmModal.rewindTitle", descKey: "tbmModal.rewindDesc" },
    { titleKey: "tbmModal.recordTitle", descKey: "tbmModal.recordDesc" },
    { titleKey: "tbmModal.iconTitle", descKey: "tbmModal.iconDesc" },
    { titleKey: "tbmModal.liveTitle", descKey: "tbmModal.liveDesc" },
  ];

  return (
    <>
    <aside
      role="navigation"
      aria-label={t("nav.home")}
      className={cn(
        "hidden lg:flex flex-col h-full bg-sidebar border-r border-sidebar-border flex-shrink-0 transition-all duration-300 relative",
        collapsed ? "w-16" : "w-72"
      )}
    >
      {/* Collapse/Expand toggle — centered on right edge */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="absolute top-1/2 -right-5 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-primary/25 border border-primary/50 shadow-lg shadow-primary/15 flex items-center justify-center text-primary hover:bg-primary/35 hover:border-primary/60 hover:shadow-primary/25 transition-all duration-200"
        title={collapsed ? "Expand" : "Collapse"}
      >
        {collapsed ? <ChevronRight className="w-3.5 h-3.5 rtl-flip" /> : <ChevronLeft className="w-3.5 h-3.5 rtl-flip" />}
      </button>

      {/* Logo */}
      <div className={cn("flex flex-col pt-8 pb-4", collapsed ? "px-3 items-center" : "px-6")}>
        <button
          type="button"
          onClick={() => onTabChange("home")}
          title={t("nav.home")}
          aria-label={t("nav.home")}
          className={cn(
            "flex items-center gap-3 rounded-xl hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
            collapsed ? "justify-center" : ""
          )}
        >
          <img
            src={radioSphereLogo}
            alt="RadioSphere.be"
            className={cn("rounded-xl mix-blend-screen animate-logo-glow flex-shrink-0 object-contain", collapsed ? "w-[60px] h-[60px]" : "w-16 h-16")}
          />
          {!collapsed && (
            <h1 className="text-xl font-heading font-bold bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(280,80%,60%)] bg-clip-text text-transparent">
              RadioSphere.be
            </h1>
          )}
        </button>
        {!collapsed && (
          <a
            href="https://play.google.com/store/apps/details?id=com.fhm.radiosphere"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => umamiTrack("play-store-click", { location: "sidebar-expanded" })}
            className="block hover:opacity-90 transition-opacity mt-3 -ml-1"
            title="Google Play"
          >
            <img
              src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png"
              alt="Get it on Google Play"
              className="h-[4.5rem]"
            />
          </a>
        )}
      </div>

      {/* Description + TBM teaser (expanded only) */}
      {!collapsed && (
        <div className="px-5 pb-4 space-y-2">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {t("sidebar.stationCount")}
          </p>
          {!tbmDismissed && (
            <div className="rounded-lg bg-accent/60 p-2.5 space-y-1.5 relative">
              <button
                onClick={handleDismissTbm}
                className="absolute top-1.5 right-1.5 p-0.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title="Fermer"
              >
                <X className="w-3 h-3" />
              </button>
              <div className="flex items-center gap-2">
                <img src={tbmLogo} alt="TimeBack Machine" className="w-5 h-5 rounded" />
                <span className="text-[11px] font-semibold text-foreground">TimeBack Machine</span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed pr-4">
                {t("sidebar.tbmTeaser")}
              </p>
              <button
                onClick={() => setTbmModalOpen(true)}
                className="inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
              >
                <HelpCircle className="w-3 h-3" />
                {t("sidebar.tbmHowItWorks")}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav className="px-3 space-y-1">
        {navItems.map(({ id, labelKey, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            title={collapsed ? t(labelKey) : undefined}
            className={cn(
              "w-full flex items-center gap-3 rounded-xl text-sm font-medium transition-all",
              collapsed ? "justify-center px-0 py-3" : "px-4 py-3",
              activeTab === id
                ? "bg-primary/15 text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.3)] shadow-[0_0_12px_-3px_hsl(var(--primary)/0.25)]"
                : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            )}
          >
            <Icon className="w-5 h-5 flex-shrink-0" />
            {!collapsed && t(labelKey)}
          </button>
        ))}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom section */}
      <div className={cn("pb-6 pt-4 space-y-3", collapsed ? "px-2" : "px-4")}>
        {/* PodcastSphere promo */}
        {!collapsed ? (
          <a
            href="https://podcast.radiosphere.be/"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => umamiTrack("podcastsphere-click", { location: "sidebar-expanded" })}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-accent/60 hover:bg-accent transition-colors group"
          >
            <img src={podcastLogo} alt="PodcastSphere" className="w-9 h-9 rounded-lg flex-shrink-0" loading="lazy" width={36} height={36} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-base font-heading font-bold bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(280,80%,60%)] bg-clip-text text-transparent">PodcastSphere</span>
                <ExternalLink className="w-3 h-3 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
              </div>
              <span className="text-[10px] text-muted-foreground leading-tight block">podcast.radiosphere.be</span>
              <span className="text-[10px] text-muted-foreground/70 italic leading-tight block">{t("sidebar.podcastTeaser")}</span>
            </div>
          </a>
        ) : (
          <a
            href="https://podcast.radiosphere.be/"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => umamiTrack("podcastsphere-click", { location: "sidebar-collapsed" })}
            className="flex justify-center"
            title="PodcastSphere"
          >
            <img src={podcastLogo} alt="PodcastSphere" className="w-10 h-10 rounded-lg" loading="lazy" width={40} height={40} />
          </a>
        )}

        {/* Google Play badge (collapsed only — expanded version is under logo) */}
        {collapsed && (
          <a
            href="https://play.google.com/store/apps/details?id=com.fhm.radiosphere"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => umamiTrack("play-store-click", { location: "sidebar-collapsed" })}
            className="flex justify-center"
            title="Google Play"
          >
            <img
              src={googlePlayIcon}
              alt="Google Play"
              className="w-8 h-8 object-contain"
              loading="lazy"
              width={32}
              height={32}
            />
          </a>
        )}

        {/* Language switcher */}
        <Popover open={languagePopoverOpen} onOpenChange={setLanguagePopoverOpen}>
          <PopoverTrigger asChild>
            {!collapsed ? (
              <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-accent/40 hover:bg-accent/70 transition-colors text-left">
                <img
                  src={currentLangOption?.flagUrl}
                  alt={currentLangOption?.label}
                  className="w-6 h-6 object-cover rounded-full flex-shrink-0 ring-1 ring-border/50"
                />
                <span className="text-xs font-medium text-foreground flex-1">{currentLangOption?.label}</span>
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              </button>
            ) : (
              <button className="flex justify-center w-full py-1" title={currentLangOption?.label}>
                <img
                  src={currentLangOption?.flagUrl}
                  alt={currentLangOption?.label}
                  className="w-7 h-7 object-cover rounded-full ring-2 ring-primary/50"
                />
              </button>
            )}
          </PopoverTrigger>
          <PopoverContent side="top" align="start" className="w-48 p-1.5 rounded-xl">
            <div className="space-y-0.5">
              {LANGUAGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setLanguage(opt.value);
                    setLanguagePopoverOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors",
                    language === opt.value
                      ? "bg-primary/15 text-primary font-medium"
                      : "text-foreground hover:bg-accent"
                  )}
                >
                  <img src={opt.flagUrl} alt={opt.label} className="w-5 h-5 object-cover rounded-full" />
                  {opt.label}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {!collapsed && (
          <>
            <a
              href="mailto:info@radiosphere.be"
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-primary hover:bg-sidebar-accent transition-colors"
            >
              <Mail className="w-4 h-4" />
              info@radiosphere.be
            </a>
            <a
              href="https://fr.tipeee.com/radiosphere/"
              target="_blank"
              rel="noopener noreferrer"
              className="mx-4 flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-[hsl(348,83%,52%)] to-[hsl(8,90%,58%)] hover:shadow-[0_0_14px_-2px_hsl(348,83%,52%,0.7)] transition-shadow"
              aria-label="Support us on Tipeee"
            >
              <Heart className="w-3.5 h-3.5 fill-current" />
              {t("sidebar.tipeee")}
            </a>
            <div className="flex items-center justify-center gap-3 px-4 pt-1">
              <a
                href="https://www.facebook.com/profile.php?id=61575475057830"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors"
                aria-label="Facebook"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              </a>
              <a
                href="https://www.instagram.com/radiosphere.be/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors"
                aria-label="Instagram"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
              </a>
              <a
                href="https://bsky.app/profile/radiospherebe.bsky.social"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors"
                aria-label="Bluesky"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.785 2.627 3.673 3.563 6.691 3.21-4.476.726-8.056 2.525-4.174 7.07C6.72 24.438 10.16 21.086 12 18c1.84 3.086 5.147 6.376 8.859 2.527 3.882-4.545.302-6.344-4.174-7.07 3.018.353 5.906-.583 6.691-3.21.246-.828.624-5.789.624-6.479 0-.688-.139-1.86-.902-2.203-.659-.3-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8z"/></svg>
              </a>
              <a
                href="https://www.tiktok.com/@radiosphere.be"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors"
                aria-label="TikTok"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.65a8.16 8.16 0 0 0 4.77 1.52V6.73a4.85 4.85 0 0 1-1.84-.04Z"/></svg>
              </a>
            </div>
          </>
        )}
      </div>
    </aside>

    {/* TBM Modal */}
    <Dialog open={tbmModalOpen} onOpenChange={setTbmModalOpen}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto rounded-2xl bg-background border-border">
        <DialogHeader>
          <DialogTitle className="text-lg font-heading font-bold bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(280,80%,60%)] bg-clip-text text-transparent flex items-center gap-2">
            <img src={tbmLogo} alt="TBM" className="w-6 h-6 rounded" />
            {t("tbmModal.title")}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t("tbmModal.intro")}
        </p>
        <div className="space-y-4 mt-2">
          {tbmSections.map(({ titleKey, descKey }) => (
            <div key={titleKey} className="rounded-xl bg-accent p-3.5">
              <h4 className="text-sm font-semibold text-foreground mb-1">{t(titleKey)}</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">{t(descKey)}</p>
            </div>
          ))}
        </div>
        <DialogClose asChild>
          <Button size="sm" className="w-full mt-2 text-xs">{t("tbmModal.close")}</Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
    </>
  );
}
