import { ReactNode, useEffect, useRef } from "react";
import { TokenIcon } from "@/components/token-icon";
import { Sidebar } from "./sidebar";
import { useGetTradeRequests, useAcceptTradeRequest, useDeclineTradeRequest, getCurrentTrade, getGetCurrentTradeQueryKey, getGetTradeRequestsQueryKey, useGetMe, useGetCurrentTrade } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useLocation, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { nameEffectClass, nameEffectStyle } from "@/lib/utils";
import { ProgressionUpdateDialog } from "@/components/progression-update-dialog";

import { Check, X } from "lucide-react";

const RAINBOW_OFFSET = `-${Math.floor(Math.random() * 4000)}ms`;


function TradeRequestPopup() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: requests } = useGetTradeRequests({
    query: { refetchInterval: 4000, queryKey: getGetTradeRequestsQueryKey() }
  });
  const acceptMutation = useAcceptTradeRequest();
  const declineMutation = useDeclineTradeRequest();

  // When my outgoing request disappears from the pending list, it was either
  // accepted, declined, or cancelled. If a live trade now exists, the partner
  // accepted — take me straight to the trade screen.
  const [location] = useLocation();
  const locationRef = useRef(location);
  locationRef.current = location;
  const outgoingId = requests?.outgoing?.[0]?.id ?? null;
  const prevOutgoingIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (requests === undefined) return;
    const prev = prevOutgoingIdRef.current;
    prevOutgoingIdRef.current = outgoingId;
    if (prev === null || outgoingId !== null) return;
    // Had an outgoing request; it's gone now — check for an active trade.
    let cancelled = false;
    getCurrentTrade()
      .then((trade) => {
        if (cancelled || trade.status !== "active") return;
        queryClient.setQueryData(getGetCurrentTradeQueryKey(), trade);
        if (locationRef.current !== "/trade") {
          toast({ title: "Trade Started!", description: "Your trade request was accepted." });
          setLocation("/trade");
        }
      })
      .catch(() => { /* no active trade — declined or cancelled */ });
    return () => { cancelled = true; };
  }, [outgoingId, requests === undefined]);

  if (!requests || requests.incoming.length === 0) return null;

  const req = requests.incoming[0];

  const handleAccept = () => {
    acceptMutation.mutate({ id: req.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTradeRequestsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetCurrentTradeQueryKey() });
        setLocation("/trade");
      },
      onError: (err) => {
        toast({ title: "Failed", description: (err.data as any)?.message || "Error", variant: "destructive" });
      }
    });
  };

  const handleDecline = () => {
    declineMutation.mutate({ id: req.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTradeRequestsQueryKey() });
      }
    });
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-8 fade-in-0 duration-300">
      <div className="bg-card border-2 border-primary shadow-2xl shadow-primary/20 rounded-2xl p-4 flex flex-col gap-3 w-72">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-secondary border border-card-border overflow-hidden flex items-center justify-center shrink-0">
            {req.fromAvatarImage ? (
              <img src={req.fromAvatarImage} alt="Avatar" className="w-full h-full object-contain" />
            ) : (
              <span className="font-display text-xl">{req.fromUsername[0].toUpperCase()}</span>
            )}
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-white text-sm">Trade Request</span>
            <span className="font-black font-display text-lg text-primary truncate leading-tight">{req.fromUsername}</span>
          </div>
        </div>
        <div className="flex gap-2 w-full">
          <Button 
            size="sm" 
            className="flex-1 bg-green-500 hover:bg-green-400 text-green-950 font-black"
            onClick={handleAccept}
            disabled={acceptMutation.isPending}
          >
            <Check className="w-4 h-4 mr-1" /> Accept
          </Button>
          <Button 
            size="sm" 
            variant="destructive" 
            className="flex-1 font-black"
            onClick={handleDecline}
            disabled={declineMutation.isPending}
          >
            <X className="w-4 h-4 mr-1" /> Decline
          </Button>
        </div>
      </div>
    </div>
  );
}

// If the player has an active trade but isn't on the trade page (new tab,
// typed URL, refresh), pull them back — no escaping a live trade by navigating.
function ActiveTradeRedirect() {
  const [location, setLocation] = useLocation();
  const onTradePage = location === "/trade";
  const { data: trade } = useGetCurrentTrade({
    query: {
      queryKey: getGetCurrentTradeQueryKey(),
      refetchInterval: 4000,
      enabled: !onTradePage, // trade page already polls this itself
      retry: false,
    },
  });
  const queryClient = useQueryClient();
  useEffect(() => {
    if (onTradePage || trade?.status !== "active") return;
    // The cached trade can be a couple seconds stale (e.g. the partner just
    // declined while we were leaving the trade page). Confirm with the server
    // before yanking the player back.
    let cancelled = false;
    getCurrentTrade()
      .then((fresh) => {
        queryClient.setQueryData(getGetCurrentTradeQueryKey(), fresh);
        if (cancelled || fresh.status !== "active") return;
        toast({ title: "Trade in progress", description: "You have an active trade — finish or decline it first." });
        setLocation("/trade");
      })
      .catch(() => { /* 404 = no trade — nothing to enforce */ });
    return () => { cancelled = true; };
  }, [onTradePage, trade?.status]);
  return null;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { data: me } = useGetMe();
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // Block leaving the trade page via the header profile pill mid-trade.
  const guardStatsNav = (e: React.MouseEvent) => {
    if (location !== "/trade") return;
    const trade = queryClient.getQueryData<{ status?: string }>(getGetCurrentTradeQueryKey());
    if (trade?.status === "active") {
      e.preventDefault();
      // Cache may lag a partner's decline by a couple seconds — verify first.
      getCurrentTrade()
        .then((fresh) => {
          queryClient.setQueryData(getGetCurrentTradeQueryKey(), fresh);
          if (fresh.status === "active") {
            toast({
              title: "Trade in progress",
              description: "Finish or decline the trade before leaving this page.",
              variant: "destructive",
            });
          } else {
            setLocation("/stats");
          }
        })
        .catch(() => setLocation("/stats"));
    }
  };

  return (
    <div className="flex max-md:flex-col h-[100dvh] bg-background overflow-hidden text-foreground">
      <Sidebar />
      <div className="flex-1 h-full overflow-hidden relative flex flex-col min-w-0">
        <div className="fixed inset-0 bg-checkerboard opacity-20 pointer-events-none" />
        
        {/* Top Right Header Pills */}
        <div className="fixed top-6 right-8 max-md:top-3 max-md:right-3 max-md:left-3 max-md:scale-100 z-50 flex flex-wrap max-md:flex-nowrap items-center gap-3 max-md:gap-2 justify-end pointer-events-none">
          {me && (
            <>
              <div className="flex items-center gap-2 bg-card border-2 border-card-border px-4 py-2 max-md:px-3 max-md:py-1.5 rounded-full shadow-lg pointer-events-auto max-md:order-2 shrink-0">
                <TokenIcon className="w-5 h-5 max-md:w-4 max-md:h-4 text-yellow-400" />
                <span className="font-display font-black text-white max-md:text-sm">{me.tokens.toLocaleString()}</span>
              </div>
              <Link href="/stats" onClick={guardStatsNav} className="flex items-center gap-3 max-md:gap-2 bg-card border-2 border-card-border px-4 py-2 max-md:px-3 max-md:py-1.5 rounded-full shadow-lg pointer-events-auto max-md:order-1 min-w-0 cursor-pointer hover:border-primary transition-colors">
                <span className={`font-display font-black text-white max-md:text-sm truncate ${nameEffectClass(me.nameEffect)}`} style={nameEffectStyle(me.nameEffect)}>{me.username}</span>
                <div className="w-6 h-6 rounded-full overflow-hidden bg-secondary">
                  {me.avatarImage ? (
                    <img src={me.avatarImage ?? undefined} alt="Avatar" className="w-full h-full object-contain" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs font-bold">?</div>
                  )}
                </div>
              </Link>
            </>
          )}
        </div>
        
        {children}
      </div>
      <TradeRequestPopup />
      {me && <ActiveTradeRedirect />}
      {me && <ProgressionUpdateDialog />}
    </div>
  );
}

export function Layout({ children, title, titleBadge, pageHeader, fixedHeight, fullWidth }: { children: ReactNode, title?: string, titleBadge?: ReactNode, pageHeader?: ReactNode, fixedHeight?: boolean | "desktop", fullWidth?: boolean }) {
  // fixedHeight=true: page fills the viewport, inner areas scroll (all breakpoints).
  // fixedHeight="desktop": same on md+, but on mobile the whole tab scrolls naturally.
  const fh = fixedHeight === true;
  const fhDesk = fixedHeight === "desktop";
  return (
    <main className={`flex-1 h-full relative flex flex-col custom-scrollbar min-w-0 ${fh ? 'overflow-hidden pb-2 max-md:pb-1' : fhDesk ? 'md:overflow-hidden md:pb-2 max-md:overflow-y-auto max-md:overflow-x-hidden max-md:pb-4' : 'overflow-y-auto overflow-x-hidden pb-10 max-md:pb-4'}`}>
      <div className={`p-4 sm:p-6 max-md:p-2 relative z-10 w-full ${fullWidth ? '' : 'max-w-7xl'} mx-auto flex flex-col min-w-0 ${fh ? 'h-full pt-20 max-md:pt-14 md:p-6 md:pb-3 pb-2' : fhDesk ? 'md:h-full pt-20 max-md:pt-14 md:p-6 md:pb-3 pb-2' : 'min-h-full pt-24 max-md:pt-16 md:p-8'}`}>
        {pageHeader}
        
        <div className={`flex flex-col flex-1 mt-4 max-md:mt-2 min-w-0 ${fh ? 'min-h-0' : fhDesk ? 'md:min-h-0' : ''}`}>
          {title && (
            <div className="self-start bg-card border-t-2 border-x-2 border-card-border px-6 py-2 max-md:px-4 max-md:py-1 rounded-t-2xl relative z-20 ml-6 max-md:ml-4 -mb-[2px] pb-[6px]">
              <span className="font-display font-black text-lg max-md:text-base text-white uppercase tracking-wider">{title}</span>
              {titleBadge}
            </div>
          )}
          <div className={`w-full min-w-0 flex-1 flex flex-col bg-card border-2 border-card-border rounded-3xl shadow-2xl z-10 max-md:p-3 max-md:rounded-2xl ${fh ? 'min-h-0 overflow-hidden p-4 sm:p-5' : fhDesk ? 'md:min-h-0 md:overflow-hidden p-4 sm:p-5' : 'p-4 sm:p-6 md:p-8'}`}>
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}
