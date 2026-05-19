// IMPORTANT: must be the very first import. Patches ReactDOM.hydrateRoot to
// inject onRecoverableError so we capture the React `componentStack` of any
// hydration mismatch (#418/#421/#423/#425) — the only way to know the exact
// component at fault in a production build. Must run BEFORE vite-react-ssg
// snapshots the react-dom namespace.
import "./utils/patchHydrateRoot";
import { ViteReactSSG } from "vite-react-ssg";
import { routes } from "./routes";
import { isInAppBrowser } from "./utils/inAppBrowser";
import { createRoot as reactDomCreateRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { setForceCsr, shouldForceCsr, FORCE_CSR_KEY } from "./utils/forceCsr";
import { cleanUrlPollutingParams } from "./lib/analytics-events";
import { trackHydrationMismatch } from "./lib/analytics-events";
import "./index.css";

// ─── Boot-time diagnostics (safe no-ops in SSR) ──────────────────────────────
// NOTE: trackWebViewDetected / trackUrlCleaned / setupPageviewPerf were
// disabled to stay under the Umami 100k events/month free tier. We still
// strip pollution params from the URL for hygiene, just without emitting.
if (typeof window !== "undefined") {
  try { cleanUrlPollutingParams(); } catch { /* noop */ }
}

// ─── CSR fallback (universal) ────────────────────────────────────────────────
// When a previous mount triggered a hydration mismatch (#418/#421/#423/#425)
// — Edge InPrivate, Facebook/Instagram/TikTok WebViews, browser extensions,
// auto-translation, etc. — we set the force-CSR flag and reload. On the next
// boot we ask vite-react-ssg to look for a non-existent container so its
// internal IIFE bails out, then we mount manually with `createRoot()` on a
// wiped #root. That bypasses every hydration quirk for the whole session.
const isClientEnv = typeof window !== "undefined";
const shouldForceCSR = isClientEnv && shouldForceCsr();
if (isClientEnv && shouldForceCSR) {
  const rootEl = document.getElementById("root");
  if (rootEl) {
    rootEl.innerHTML = "";
    rootEl.removeAttribute("data-server-rendered");
  }
}

export const createRoot = ViteReactSSG(
  { routes },
  undefined,
  shouldForceCSR ? { rootContainer: "#__rs_csr_noop__" } : undefined,
);

if (isClientEnv && shouldForceCSR) {
  void (async () => {
    try {
      const ctx = await createRoot(true);
      const container = document.getElementById("root");
      if (!container || !ctx.router) return;
      // Defensive: ensure no stale SSG markup remains.
      container.innerHTML = "";
      container.removeAttribute("data-server-rendered");
      const root = reactDomCreateRoot(container, {
        onRecoverableError: (error, errorInfo) => {
          try {
            const err = error as Error & { digest?: string };
            trackHydrationMismatch({
              digest: err?.digest,
              componentStack: errorInfo?.componentStack ?? "",
              message: err?.message ?? String(error),
            });
          } catch { /* noop */ }
        },
      });
      root.render(
        <HelmetProvider>
          <RouterProvider router={ctx.router} />
        </HelmetProvider>,
      );
      try { (window as unknown as { __rsAppMounted?: boolean }).__rsAppMounted = true; } catch { /* noop */ }
      // csr-fallback-duration disabled (Umami event-budget cleanup)
      console.log("[RadioSphere] CSR fallback active — hydration bypassed");
    } catch (e) {
      console.error("[RadioSphere] CSR fallback mount failed:", e);
      // Don't loop forever if CSR mount itself fails
      try { sessionStorage.removeItem(FORCE_CSR_KEY); } catch { /* noop */ }
      try { localStorage.removeItem(FORCE_CSR_KEY); } catch { /* noop */ }
    }
  })();
}

// Tell the emergency shell that React has taken over (works for both
// hydration and CSR-fallback paths). The shell polls this flag and removes
// itself once set.
if (isClientEnv) {
  // Mark as mounted on next tick — by then either hydration succeeded or
  // the CSR fallback handler above has run.
  const markMounted = () => {
    try { (window as unknown as { __rsAppMounted?: boolean }).__rsAppMounted = true; } catch { /* noop */ }
  };
  if (document.readyState === "complete") {
    setTimeout(markMounted, 0);
  } else {
    window.addEventListener("load", () => setTimeout(markMounted, 0));
  }
}

const CRASH_FLAG_KEY = "radiosphere_crash_purge_pending";

function isPreviewHost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host.endsWith(".lovableproject.com") || host.endsWith(".lovable.app") || host.includes("localhost");
}

async function purgeServiceWorkersAndCaches(reason: string): Promise<void> {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
    }
  } catch {
    /* noop */
  }
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
    }
  } catch {
    /* noop */
  }
  console.log(`[RadioSphere] ${reason} — service workers and caches cleared`);
}

/** Detect JSON-parse style crash messages so we can purge the SW cache on next boot. */
function isJsonParseCrash(message: string | undefined | null): boolean {
  if (!message) return false;
  const m = String(message);
  return (
    m.includes("JSON.parse") ||
    m.includes("Unexpected token") ||
    m.includes("Unexpected end of JSON") ||
    m.includes("is not valid JSON")
  );
}

/** Known React hydration / render error codes we want to surface. */
const HYDRATION_REACT_CODES = new Set(["418", "421", "422", "423", "425", "426", "428"]);

/** Extract a React minified error code from a message (e.g. "#418"). */
function extractReactErrorCode(message: string | undefined | null): string | null {
  if (!message) return null;
  const m = /Minified React error #(\d+)/.exec(String(message));
  return m ? m[1] : null;
}

/** Extract the full react.dev/errors URL embedded by React in minified messages. */
function extractReactErrorUrl(message: string | undefined | null): string | null {
  if (!message) return null;
  const m = /https?:\/\/react\.dev\/errors\/[^\s"')]+/.exec(String(message));
  return m ? m[0] : null;
}

/** Parse `args[]=foo&args[]=bar` query into an array. */
function extractReactErrorArgs(message: string | undefined | null): string[] {
  if (!message) return [];
  const out: string[] = [];
  const re = /[?&]args(?:\[\])?=([^&\s"')]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(message))) !== null) {
    try { out.push(decodeURIComponent(m[1])); } catch { out.push(m[1]); }
  }
  return out;
}

/**
 * Aggregate every string-ish chunk of a console.error/error-event so we can
 * fish out the React URL even when it's not in the primary message.
 * Walks: message itself + Error.stack + Error.cause.
 */
function collectErrorTextChunks(...args: unknown[]): string {
  const parts: string[] = [];
  for (const a of args) {
    if (a == null) continue;
    if (typeof a === "string") parts.push(a);
    else if (a instanceof Error) {
      parts.push(a.message ?? "");
      if (a.stack) parts.push(a.stack);
      const cause = (a as { cause?: unknown }).cause;
      if (cause instanceof Error) {
        parts.push(cause.message ?? "");
        if (cause.stack) parts.push(cause.stack);
      } else if (typeof cause === "string") parts.push(cause);
    } else {
      try { parts.push(String(a)); } catch { /* noop */ }
    }
  }
  return parts.join(" \n ");
}

/** Detect React hydration mismatch errors (#418, #423, #425, etc.) */
function isHydrationError(message: string | undefined | null): boolean {
  if (!message) return false;
  const m = String(message);
  if (
    m.includes("Hydration failed") ||
    m.includes("hydrating") ||
    m.includes("did not match") ||
    m.includes("Text content does not match")
  ) return true;
  const code = extractReactErrorCode(m);
  return !!code && HYDRATION_REACT_CODES.has(code);
}

/** Truncate while preserving usefulness. */
function trunc(s: string | undefined | null, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) : s;
}

/** Lightweight environment fingerprint (non-personal). */
function envInfo(): Record<string, unknown> {
  try {
    const nav = navigator as Navigator & { connection?: { effectiveType?: string }; deviceMemory?: number };
    return {
      ua: trunc(nav.userAgent, 160),
      lang: nav.language,
      online: nav.onLine,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      dpr: window.devicePixelRatio,
      net: nav.connection?.effectiveType ?? "unknown",
      mem: nav.deviceMemory ?? "unknown",
      visibility: document.visibilityState,
    };
  } catch {
    return {};
  }
}

type UmamiWin = { umami?: { track: (name: string, data?: Record<string, unknown>) => void } };
function umamiTrack(event: string, data?: Record<string, unknown>) {
  try {
    (window as unknown as UmamiWin).umami?.track(event, data);
  } catch { /* noop */ }
}

/** Track crash and report to Umami if available */
function reportCrash(kind: "unhandledrejection" | "error", message: string, extra?: Record<string, unknown>) {
  try {
    sessionStorage.setItem(CRASH_FLAG_KEY, "1");
  } catch { /* noop */ }
  umamiTrack("js-crash", {
    kind,
    message: trunc(message, 300),
    route: window.location.pathname,
    ...envInfo(),
    ...(extra ?? {}),
  });
}

/** De-duplicate identical events fired in the same session (React often emits twice). */
const _seenEvents = new Set<string>();
function reportOnce(event: string, dedupeKey: string, payload: Record<string, unknown>) {
  if (_seenEvents.has(dedupeKey)) return;
  _seenEvents.add(dedupeKey);
  umamiTrack(event, payload);
}

function reportHydrationError(rawMessage: string, source: "error-event" | "console-error", extra?: Record<string, unknown>) {
  const code = extractReactErrorCode(rawMessage);
  // Try the original message first; fall back to extra.stack which often
  // contains the full minified message with the react.dev URL.
  let url = extractReactErrorUrl(rawMessage);
  const stackText = typeof extra?.stack === "string" ? extra.stack : "";
  if (!url && stackText) url = extractReactErrorUrl(stackText);
  // Last resort: if we have the code, build the canonical URL ourselves so
  // the dashboard always has a clickable link.
  if (!url && code) url = `https://react.dev/errors/${code}`;

  const args = extractReactErrorArgs(rawMessage) || extractReactErrorArgs(stackText);
  const eventName = code ? `hydration-error-${code}` : "hydration-error";
  const dedupeKey = `${eventName}|${url ?? trunc(rawMessage, 120)}|${window.location.pathname}`;
  const payload: Record<string, unknown> = {
    code: code ?? "unknown",
    url: url ?? "",
    args: args.length ? args.join("|") : "",
    message: trunc(rawMessage, 300),
    route: window.location.pathname,
    source,
    ...envInfo(),
    ...(extra ?? {}),
  };
  reportOnce(eventName, dedupeKey, payload);
  // (duplicate generic "hydration-error" emission removed — Umami budget cleanup)
  // ─── Targeted CSR rescue ────────────────────────────────────────────────
  // We only auto-trigger force-CSR + reload when:
  //   (a) we're inside a known in-app WebView (FB/IG/TikTok/etc.) — that's where
  //       hydration genuinely never recovers; OR
  //   (b) the React error code is a hard-block hydration failure (#418/#423).
  // #421/#425/#422/#426/#428 are typically transient and React recovers from
  // them — reloading on every occurrence was the main cause of the
  // error-boundary flood on Umami.
  // We also enforce a 24h cap (max 2 auto force-CSR per browser) to break any
  // remaining loop risk. Manual UI from ErrorBoundary remains available.
  const HARD_HYDRATION_CODES = new Set(["418", "423"]);
  const inWebView = isInAppBrowser();
  const isHardHydration = !!code && HARD_HYDRATION_CODES.has(code);
  if (!inWebView && !isHardHydration) return;

  const FORCE_CSR_24H_KEY = "__rsForceCsrLog24h";
  try {
    const raw = localStorage.getItem(FORCE_CSR_24H_KEY);
    const now = Date.now();
    const recent: number[] = raw ? (JSON.parse(raw) as number[]).filter((t) => now - t < 24 * 60 * 60 * 1000) : [];
    if (recent.length >= 2) {
      // Cap reached — don't auto-rescue, let the manual UI take over.
      return;
    }
    if (!shouldForceCSR && sessionStorage.getItem(FORCE_CSR_KEY) !== "1") {
      reportOnce("csr-fallback-triggered", `csr|${window.location.pathname}`, {
        code: code ?? "unknown",
        route: window.location.pathname,
        webview: inWebView,
        reason: inWebView ? "webview" : "hard-hydration",
        ...envInfo(),
      });
      recent.push(now);
      try { localStorage.setItem(FORCE_CSR_24H_KEY, JSON.stringify(recent)); } catch { /* noop */ }
      setForceCsr();
      setTimeout(() => { try { window.location.reload(); } catch { /* noop */ } }, 250);
    }
  } catch { /* storage may throw inside partitioned WebViews */ }
}

if (typeof window !== "undefined") {
  // Catch unhandled promise rejections (e.g. background fetch failures inside
  // in-app browsers like Facebook/Instagram WebViews) to avoid white-screen crashes.
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error ? reason.message : typeof reason === "string" ? reason : String(reason);
    const stack = reason instanceof Error ? trunc(reason.stack, 600) : "";
    console.warn("[RadioSphere] Unhandled promise rejection:", reason);
    if (isHydrationError(message)) {
      reportHydrationError(message, "error-event", { stack, async: true });
    } else if (isJsonParseCrash(message)) {
      reportCrash("unhandledrejection", message, { stack });
    } else {
      // Catch-all so we can detect previously-invisible async crashes.
      umamiTrack("unhandled-rejection", {
        message: trunc(message, 300),
        name: reason instanceof Error ? reason.name : typeof reason,
        stack,
        route: window.location.pathname,
        ...envInfo(),
      });
    }
    event.preventDefault();
  });

  // Synchronous errors (timers, event handlers) — flag JSON parse crashes,
  // forward React hydration mismatches with their precise code, and surface
  // any other uncaught error so we have a real signal in production.
  window.addEventListener("error", (event) => {
    const err = event.error;
    // Use the full Error.message when available — browsers often truncate
    // event.message for cross-origin scripts, hiding the react.dev URL.
    const errMessage = err instanceof Error ? err.message : "";
    const message = errMessage || event.message || "";
    const stack = err instanceof Error ? trunc(err.stack, 600) : "";
    const location = `${event.filename || ""}:${event.lineno || 0}:${event.colno || 0}`;
    // Aggregate message + stack so the URL extractor can find the link even
    // when only the stack contains it.
    const fullText = `${message}\n${stack}`;
    if (isHydrationError(fullText)) {
      console.warn("[RadioSphere] Hydration error detected:", message);
      reportHydrationError(fullText, "error-event", { stack, location });
      return;
    }
    if (isJsonParseCrash(message)) {
      console.warn("[RadioSphere] Sync error (JSON parse):", message);
      reportCrash("error", message, { stack, location });
      return;
    }
    // js-error emission disabled (Umami budget cleanup — js-crash + hydration-error-* cover the actionable cases)
    void message; void err; void location; void stack;
  });

  // React 18 reports hydration mismatches via console.error. Wrap it once to
  // forward those to Umami without changing console behaviour. We aggregate
  // every chunk (string args + Error stacks + cause chains) so the URL/code
  // can be fished out of secondary args even when the primary message is just
  // "Uncaught Error: Minified React error #418".
  const origConsoleError = console.error;
  console.error = function patchedConsoleError(...args: unknown[]) {
    try {
      const msg = collectErrorTextChunks(...args);
      // Only forward to Umami when the message clearly comes from React's
      // minified error pipeline. The previous heuristic ("did not match",
      // "hydrating", …) caught third-party Cast/Umami/console messages and
      // triggered cascading rescues — the main cause of the error-boundary
      // flood on Umami.
      if (/Minified React error #\d+/.test(msg)) {
        const errArg = args.find((a) => a instanceof Error) as Error | undefined;
        reportHydrationError(msg, "console-error", { stack: trunc(errArg?.stack ?? msg, 600) });
      }
    } catch { /* noop */ }
    return origConsoleError.apply(console, args as []);
  };

  // Detect chunk-load failures (stale SW serving an outdated bundle) — a known
  // cause of mysterious white screens after a deploy.
  window.addEventListener("error", (event) => {
    const target = event.target as HTMLElement | null;
    if (!target || target === window as unknown as HTMLElement) return;
    const tag = (target.tagName || "").toLowerCase();
    if (tag === "script" || tag === "link") {
      const src = (target as HTMLScriptElement).src || (target as HTMLLinkElement).href || "";
      // Ignore third-party scripts injected by in-app browser shells
      // (Facebook pcm.js / fbevents, Instagram, Google tag, TikTok pixel, etc.).
      // These are not OUR assets — they fail constantly inside WebViews and
      // would otherwise drown the real chunk-load failures we want to detect.
      const THIRD_PARTY_NOISE = /(?:connect\.facebook\.net|facebook\.com\/tr|fbcdn\.net|instagram\.com|googletagmanager\.com|google-analytics\.com|googlesyndication|doubleclick|tiktok\.com|bytedance|snapchat|pinterest|linkedin\.com|hotjar|clarity\.ms)/i;
      if (src && THIRD_PARTY_NOISE.test(src)) return;
      umamiTrack("asset-load-error", {
        tag,
        src: trunc(src, 300),
        route: window.location.pathname,
        ...envInfo(),
      });
    }
  }, true);

  // Visibility into total session loss (long task on first paint, etc.)
  // We only emit once per session, on first hidden after load.
  let firstHiddenReported = false;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden" || firstHiddenReported) return;
    firstHiddenReported = true;
    const t = performance.now();
    if (t < 10_000) {
      umamiTrack("early-bounce", {
        ms: Math.round(t),
        route: window.location.pathname,
        ...envInfo(),
      });
    }
  });

  // PWA install lifecycle — capture the native browser prompt outcome.
  window.addEventListener("beforeinstallprompt", (e) => {
    umamiTrack("pwa-install-available");
    const promptEvt = e as Event & { userChoice?: Promise<{ outcome: "accepted" | "dismissed" }> };
    promptEvt.userChoice?.then((choice) => {
      umamiTrack(choice.outcome === "accepted" ? "pwa-install-accepted" : "pwa-install-rejected");
    }).catch(() => { /* noop */ });
  });
  window.addEventListener("appinstalled", () => {
    umamiTrack("pwa-installed");
  });
}

// Register PWA service worker with auto-update (client-side only).
// IMPORTANT: Skip SW registration entirely inside in-app browser WebViews
// (Facebook, Instagram, TikTok…). On those platforms the SW often caches
// corrupted chunks that then break navigation/JSON parsing on next load.
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  if (isPreviewHost()) {
    void purgeServiceWorkersAndCaches("Preview environment detected");
  } else if (isInAppBrowser()) {
    console.log("[RadioSphere] In-app WebView detected — skipping SW registration and purging caches");
    // Proactively unregister any previously installed SW and wipe its caches.
    void purgeServiceWorkersAndCaches("In-app WebView detected");
  } else {
    // If the previous session crashed on JSON.parse, purge the api-cache before
    // anything tries to read from it again.
    try {
      if (sessionStorage.getItem(CRASH_FLAG_KEY) === "1" && "caches" in window) {
        sessionStorage.removeItem(CRASH_FLAG_KEY);
        caches
          .delete("api-cache")
          .then((deleted) => {
            console.log(`[RadioSphere] api-cache purge after crash: ${deleted ? "ok" : "no entry"}`);
          })
          .catch(() => {
            /* noop */
          });
      }
    } catch {
      /* sessionStorage may be unavailable in private mode */
    }

    import("virtual:pwa-register").then(({ registerSW }) => {
      registerSW({
        immediate: true,
        onNeedRefresh() {
          if (confirm("Une nouvelle version de RadioSphere.be est disponible. Recharger ?")) {
            window.location.reload();
          }
        },
        onOfflineReady() {
          console.log("[RadioSphere] App prête pour le mode hors ligne");
        },
      });
    }).catch((e) => {
      console.warn("[RadioSphere] PWA register failed:", e);
    });
  }
}
