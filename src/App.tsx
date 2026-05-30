import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { FavoritesProvider, useFavoritesContext } from "@/contexts/FavoritesContext";
import { PlayerProvider } from "@/contexts/PlayerContext";
import { StreamBufferProvider } from "@/contexts/StreamBufferContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Index from "./pages/Index";
import { SEOLinks } from "@/components/SEOLinks";

const queryClient = new QueryClient();

function CoreProviders({ children }: { children: React.ReactNode }) {
  const { addRecent } = useFavoritesContext();

  return (
    <PlayerProvider onStationPlay={addRecent}>
      <StreamBufferProvider>
        {children}
      </StreamBufferProvider>
    </PlayerProvider>
  );
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <LanguageProvider>
          <SEOLinks />
          <FavoritesProvider>
            <CoreProviders>
              <Toaster />
              <Sonner />
              <Index />
              <Outlet />
            </CoreProviders>
          </FavoritesProvider>
        </LanguageProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
