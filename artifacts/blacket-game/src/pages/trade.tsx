import { Layout } from "@/components/layout/layout";
import { TokenIcon } from "@/components/token-icon";
import { 
  useGetCurrentTrade, getGetCurrentTradeQueryKey, 
  useUpdateTradeOffer, 
  useAcceptTrade, 
  useDeclineTrade, 
  useGetTradeMessages, getGetTradeMessagesQueryKey, 
  useSendTradeMessage,
  useGetMyBlooks,
  useGetRarities,
  useGetMe,
  useSendTradeRequest,
  useGetTradeRequests,
  useDeclineTradeRequest,
  getGetTradeRequestsQueryKey,
  getGetMeQueryKey,
  getGetMyBlooksQueryKey
} from "@workspace/api-client-react";
import type { Trade, TradeOfferBlook, OwnedBlook, TradeRequest } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { useState, useRef, useEffect, useMemo } from "react";
import { isHighTierRarity } from "@/lib/rarity";
import { Loader2, Send, Plus, X, Search, CheckCircle2, ArrowRightLeft } from "lucide-react";
import { keepPreviousData, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { formatNumber } from "@/lib/utils";
import { ChatMessageRow } from "@/components/chat-message";
import { useIsMobile } from "@/hooks/use-mobile";
import logoImg from "@/assets/logo.png";

const RAINBOW_OFFSET = `-${Math.floor(Math.random() * 4000)}ms`;

function TradeEmptyState() {
  const sendRequestMutation = useSendTradeRequest();
  const cancelRequestMutation = useDeclineTradeRequest();
  const queryClient = useQueryClient();
  // Persist across remounts — the page can remount during trade polling,
  // which must not wipe what the user is typing.
  const [targetUsername, setTargetUsernameState] = useState<string>(
    () => sessionStorage.getItem("trade-target-username") ?? "",
  );
  const setTargetUsername = (v: string) => {
    sessionStorage.setItem("trade-target-username", v);
    setTargetUsernameState(v);
  };

  const { data: requests } = useGetTradeRequests({
    query: { refetchInterval: 3000, queryKey: getGetTradeRequestsQueryKey(), placeholderData: keepPreviousData }
  });

  const outgoingRequest = requests?.outgoing?.[0];

  const handleSendRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUsername.trim()) return;
    sendRequestMutation.mutate({ data: { username: targetUsername.trim() } }, {
      onSuccess: (request) => {
        if (request.status === "accepted") {
          toast({ title: "Trade Started!", description: `${targetUsername} accepted your trade.` });
        } else {
          toast({ title: "Request Sent!", description: `Waiting for ${targetUsername} to accept.` });
        }
        setTargetUsername("");
        queryClient.invalidateQueries({ queryKey: getGetTradeRequestsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetCurrentTradeQueryKey() });
      },
      onError: (err) => {
        toast({ title: "Failed", description: (err.data as any)?.message, variant: "destructive" });
      }
    });
  };

  const handleCancelRequest = () => {
    if (!outgoingRequest) return;
    cancelRequestMutation.mutate({ id: outgoingRequest.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTradeRequestsQueryKey() });
      }
    });
  };

  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 text-center max-w-lg mx-auto">
      <div className="w-24 h-24 bg-primary/20 rounded-full flex items-center justify-center text-primary">
        <ArrowRightLeft className="w-12 h-12" />
      </div>
      <div>
        <h2 className="text-4xl font-black font-display text-white mb-2">Live Trading</h2>
        <p className="text-lg text-muted-foreground font-bold">
          Trade blooks and tokens with other players.
        </p>
      </div>

      <div className="w-full flex flex-col gap-6">
        {outgoingRequest ? (
          <div className="bg-card border-2 border-primary/50 rounded-2xl p-6 flex flex-col items-center gap-4 animate-in zoom-in">
            <span className="font-bold text-muted-foreground">Waiting for {outgoingRequest.toUsername} to accept...</span>
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <Button 
              variant="destructive" 
              onClick={handleCancelRequest}
              disabled={cancelRequestMutation.isPending}
              className="mt-2 font-black"
            >
              Cancel Request
            </Button>
          </div>
        ) : (
          <div className="bg-card border border-card-border rounded-2xl p-6 flex flex-col gap-4">
            <form onSubmit={handleSendRequest} className="flex gap-2">
              <Input 
                value={targetUsername}
                onChange={e => setTargetUsername(e.target.value)}
                placeholder="Enter a username..."
                className="h-12 font-bold"
              />
              <Button 
                type="submit" 
                className="h-12 px-6 font-black"
                disabled={!targetUsername.trim() || sendRequestMutation.isPending}
              >
                {sendRequestMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Send Request"}
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

function TradeResult({ trade, onDismiss }: { trade: Trade, onDismiss: () => void }) {
  const { data: rarities } = useGetRarities();
  const getRarityColor = (name: string) => rarities?.find(r => r.name === name)?.color || '#fff';
  const isCompleted = trade.status === 'completed';
  const queryClient = useQueryClient();
  
  useEffect(() => {
    if (isCompleted) {
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetMyBlooksQueryKey() });
    }
  }, [isCompleted, queryClient]);

  return (
    <div className="flex flex-col items-center justify-center h-full text-center animate-in zoom-in duration-500">
      <h1 className={`text-6xl font-black mb-6 text-glow ${isCompleted ? 'text-green-400' : 'text-red-400'}`}>
        {isCompleted ? 'Trade Completed!' : 'Trade Declined.'}
      </h1>
      
      {isCompleted && (
        <div className="flex flex-col md:flex-row gap-8 items-start mb-10">
          <div className="flex flex-col items-center bg-card p-6 rounded-2xl border border-card-border shadow-xl">
            <span className="text-muted-foreground font-bold mb-4 uppercase tracking-wider">You Received</span>
            <div className="flex items-center gap-2 text-3xl font-black text-yellow-400 mb-6">
              <TokenIcon className="w-8 h-8" /> {formatNumber(trade.partnerOffer.tokens)}
            </div>
            {trade.partnerOffer.blooks.length > 0 ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
                {trade.partnerOffer.blooks.map(b => (
                  <div key={b.name} className="relative w-20 h-20 group bg-secondary rounded-xl p-2 border border-card-border">
                    <img src={b.image} alt={b.name} title={`${b.name} x${b.quantity}`} className="w-full h-full object-contain drop-shadow-md" style={{ filter: isHighTierRarity(b.rarity) ? `drop-shadow(0 0 12px ${getRarityColor(b.rarity)})` : undefined }} />
                    <div className="absolute -top-2 -right-2 text-white text-xs font-black px-2 py-0.5 rounded-full" style={{ backgroundColor: getRarityColor(b.rarity) }}>{b.quantity}</div>
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-muted-foreground font-medium">No blooks received</span>
            )}
          </div>
        </div>
      )}

      <Button size="lg" onClick={onDismiss} className="text-xl h-14 px-8 bg-primary hover:bg-primary/90 text-white font-black">
        Return to Trading
      </Button>
    </div>
  );
}

function TradeActive({ trade }: { trade: Trade }) {
  const { data: me } = useGetMe();
  const { data: rarities } = useGetRarities();
  const { data: myBlooks } = useGetMyBlooks();
  const updateOfferMutation = useUpdateTradeOffer();
  const acceptMutation = useAcceptTrade();
  const declineMutation = useDeclineTrade();
  const queryClient = useQueryClient();
  
  const [tokensInput, setTokensInput] = useState(trade.myOffer.tokens.toString());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  
  const [isTokensFocused, setIsTokensFocused] = useState(false);
  
  // Only sync external changes when not actively typing to avoid cursor jumps
  const externalTokens = trade.myOffer.tokens;
  useEffect(() => {
    if (!isTokensFocused) {
      setTokensInput(externalTokens.toString());
    }
  }, [externalTokens, isTokensFocused]);

  // Keep track of previous acceptance state purely to show a toast if the partner modifies their offer
  const partnerOfferFingerprint = JSON.stringify(trade.partnerOffer);
  const prevPartnerOfferFingerprint = useRef(partnerOfferFingerprint);
  const wasAcceptedRef = useRef(trade.myAccepted);
  
  useEffect(() => {
    // If I had accepted, but the server now says I haven't AND the partner's offer actually changed, alert me.
    if (wasAcceptedRef.current && !trade.myAccepted && prevPartnerOfferFingerprint.current !== partnerOfferFingerprint) {
      toast({
        title: "Offer Changed",
        description: "The partner modified their offer. Please review and accept again.",
        variant: "destructive"
      });
    }
    wasAcceptedRef.current = trade.myAccepted;
    prevPartnerOfferFingerprint.current = partnerOfferFingerprint;
  }, [trade.myAccepted, partnerOfferFingerprint]);


    const getRarityColor = (name: string) => rarities?.find(r => r.name === name)?.color || '#fff';

// Commit token changes as you type (debounced) — no need to tap away.
  const tokensDebounceRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (tokensDebounceRef.current !== null) window.clearTimeout(tokensDebounceRef.current);
  }, []);

  // Always read the LATEST offer when a debounced commit fires — a blook may
  // have been added/removed during the 500ms window, and committing a stale
  // blook list would silently undo that edit.
  const myOfferRef = useRef(trade.myOffer);
  myOfferRef.current = trade.myOffer;

  const commitTokens = (num: number) => {
    const offer = myOfferRef.current;
    if (num !== offer.tokens) {
      sendOfferUpdate(num, offer.blooks.map(b => ({ name: b.name, quantity: b.quantity })));
    }
  };

  const handleTokensChange = (raw: string) => {
    // Digits only — no decimals, negatives, or exponent notation.
    let next = raw.replace(/[^0-9]/g, "");
    // Never let the field hold more tokens than you own.
    const maxTokens = me?.tokens ?? 0;
    const parsed = parseInt(next);
    if (!Number.isNaN(parsed) && parsed > maxTokens) next = maxTokens.toString();
    setTokensInput(next);
    if (tokensDebounceRef.current !== null) window.clearTimeout(tokensDebounceRef.current);
    const num = Math.max(0, Math.min(parseInt(next) || 0, maxTokens));
    tokensDebounceRef.current = window.setTimeout(() => {
      tokensDebounceRef.current = null;
      commitTokens(num);
    }, 500);
  };

  const handleTokensBlur = () => {
    setIsTokensFocused(false);
    if (tokensDebounceRef.current !== null) {
      window.clearTimeout(tokensDebounceRef.current);
      tokensDebounceRef.current = null;
    }
    // Clamp to the tokens you actually have
    const maxTokens = me?.tokens ?? 0;
    const num = Math.max(0, Math.min(parseInt(tokensInput) || 0, maxTokens));
    setTokensInput(num.toString());
    commitTokens(num);
  };

  // Send an offer update with an instant optimistic UI update, so taps feel
  // immediate instead of waiting for the next 2.5s poll. Cancels in-flight
  // polls (they could overwrite the cache with stale data) and writes the
  // server's authoritative response back into the cache on success.
  // Monotonic sequence so out-of-order mutation responses (rapid taps) can't
  // overwrite newer state: only the latest update's result touches the cache.
  const offerSeqRef = useRef(0);
  const sendOfferUpdate = (tokens: number, blooks: { name: string; quantity: number }[]) => {
    const key = getGetCurrentTradeQueryKey();
    const seq = ++offerSeqRef.current;
    queryClient.cancelQueries({ queryKey: key });
    const previous = queryClient.getQueryData<Trade>(key);
    if (previous) {
      // Enrich the bare {name, quantity} entries with display metadata from
      // the existing offer or the player's collection for the optimistic view.
      const optimisticBlooks: TradeOfferBlook[] = blooks.map((b) => {
        const fromOffer = previous.myOffer.blooks.find((ob) => ob.name === b.name);
        const fromCollection = myBlooks?.find((mb) => mb.name === b.name);
        const meta = fromOffer ?? fromCollection;
        return {
          name: b.name,
          quantity: b.quantity,
          rarity: meta?.rarity ?? "",
          image: meta?.image ?? "",
          price: meta?.price ?? 0,
        };
      });
      queryClient.setQueryData<Trade>(key, {
        ...previous,
        myOffer: { ...previous.myOffer, tokens, blooks: optimisticBlooks },
        myAccepted: false,
        partnerAccepted: false,
      });
    }
    updateOfferMutation.mutate({ data: { tokens, blooks } }, {
      onSuccess: (data) => {
        // Ignore stale responses: a newer tap has already updated the cache.
        if (seq !== offerSeqRef.current) return;
        queryClient.setQueryData(key, data);
      },
      onError: () => {
        if (seq !== offerSeqRef.current) return;
        // Latest update failed — resync with the server's authoritative state.
        queryClient.invalidateQueries({ queryKey: key });
      },
    });
  };

  const handleAddBlook = (name: string) => {
    if (trade.myAccepted) return;
    const currentOffer = queryClient.getQueryData<Trade>(getGetCurrentTradeQueryKey())?.myOffer ?? myOfferRef.current;
    const blooks = currentOffer.blooks.map((b: TradeOfferBlook) => ({ name: b.name, quantity: b.quantity }));
    const existing = blooks.find((b: { name: string; quantity: number }) => b.name === name);
    if (existing) {
      existing.quantity += 1;
    } else {
      blooks.push({ name, quantity: 1 });
    }
    sendOfferUpdate(currentOffer.tokens, blooks);
  };

  const handleRemoveBlook = (name: string) => {
    if (trade.myAccepted) return;
    const currentOffer = queryClient.getQueryData<Trade>(getGetCurrentTradeQueryKey())?.myOffer ?? myOfferRef.current;
    let blooks = currentOffer.blooks.map((b: TradeOfferBlook) => ({ name: b.name, quantity: b.quantity }));
    const existing = blooks.find((b: { name: string; quantity: number }) => b.name === name);
    if (existing) {
      existing.quantity -= 1;
      if (existing.quantity <= 0) {
        blooks = blooks.filter((b: { name: string; quantity: number }) => b.name !== name);
      }
      sendOfferUpdate(currentOffer.tokens, blooks);
    }
  };

  const handleAccept = () => {
    acceptMutation.mutate(undefined, {
      onSuccess: (data) => {
        // Persist the response (may be a terminal "completed" state) into the
        // cache so the result screen survives subsequent 404 polls.
        queryClient.setQueryData(getGetCurrentTradeQueryKey(), data);
        if (data.status !== 'active') {
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetMyBlooksQueryKey() });
        }
      }
    });
  };

  const handleDecline = () => {
    declineMutation.mutate(undefined, {
      onSuccess: (data) => {
        queryClient.setQueryData(getGetCurrentTradeQueryKey(), data);
      }
    });
  };

  const availableBlooks = useMemo(() => {
    if (!myBlooks) return [];
    return myBlooks.map((b: OwnedBlook) => {
      const inOffer = trade.myOffer.blooks.find((ob: TradeOfferBlook) => ob.name === b.name)?.quantity || 0;
      return { ...b, available: b.quantity - inOffer };
    }).filter((b: OwnedBlook & { available: number }) => b.available > 0 && b.name.toLowerCase().includes(pickerSearch.toLowerCase()));
  }, [myBlooks, trade.myOffer.blooks, pickerSearch]);

  const { data: messages } = useGetTradeMessages(undefined, {
    query: { refetchInterval: 2500, queryKey: getGetTradeMessagesQueryKey(), placeholderData: keepPreviousData }
  });
  const sendMutation = useSendTradeMessage();
  const [chatInput, setChatInput] = useState("");
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Track whether the user is near the bottom of the chat, so new messages
  // only auto-scroll when they haven't scrolled up to read old ones.
  const isNearBottomRef = useRef(true);
  useEffect(() => {
    const viewport = chatScrollRef.current?.querySelector<HTMLDivElement>(
      "[data-radix-scroll-area-viewport]",
    );
    if (!viewport) return;
    const onScroll = () => {
      isNearBottomRef.current =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 40;
    };
    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", onScroll);
  }, []);

  const messageCount = messages?.length || 0;
  useEffect(() => {
    if (!isNearBottomRef.current) return;
    // The ref sits on the Radix ScrollArea root; the actual scrollable
    // element is its viewport child, so scroll that instead.
    const viewport = chatScrollRef.current?.querySelector<HTMLDivElement>(
      "[data-radix-scroll-area-viewport]",
    );
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messageCount]);

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || sendMutation.isPending) return;
    sendMutation.mutate({ data: { content: chatInput.trim() } }, {
      onSuccess: () => {
        setChatInput("");
        // Always jump to the bottom for your own messages.
        isNearBottomRef.current = true;
        queryClient.invalidateQueries({ queryKey: getGetTradeMessagesQueryKey() });
      }
    });
  };

  return (
    <div className="flex flex-col md:h-full md:min-h-0 max-md:h-auto w-full gap-4 max-md:gap-3 relative">
      <div className="md:flex-1 md:grid md:grid-cols-[1fr_minmax(360px,430px)_1fr] md:gap-5 md:min-h-0 max-md:flex max-md:flex-col max-md:gap-3">
        
        {/* My Offer */}
        <div className="flex flex-col bg-card border-2 border-card-border rounded-xl overflow-hidden shadow-lg relative min-h-0 min-w-0 max-md:order-3 max-md:shrink-0">
          {trade.myAccepted && (
            <div className="absolute inset-0 bg-green-900/10 pointer-events-none z-10" />
          )}
          <div className="p-4 max-md:p-2 border-b border-card-border bg-black/20 flex items-center justify-between z-20 shrink-0">
            <div className="flex items-center gap-3 max-md:gap-2">
              <div className="w-10 h-10 max-md:w-8 max-md:h-8 rounded-lg overflow-hidden bg-secondary border border-card-border shrink-0">
                {me?.avatarImage ? (
                  <img src={me.avatarImage ?? undefined} className="w-full h-full object-contain" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-bold">?</div>
                )}
              </div>
              <span className="font-bold text-white text-lg max-md:text-base truncate">{me?.username || 'Me'}</span>
            </div>
            {trade.myAccepted && (
              <div className="bg-green-500 text-green-950 px-3 max-md:px-2 py-1 rounded-full font-black text-xs uppercase flex items-center gap-1 shadow-[0_0_10px_rgba(34,197,94,0.5)] shrink-0">
                <CheckCircle2 className="w-4 h-4 max-md:w-3 max-md:h-3" /> Ready
              </div>
            )}
          </div>

          <ScrollArea className="flex-1 z-20 max-md:hidden">
            {/* Padding lives inside the scroll viewport so quantity badges
                (which stick out above the cards) don't get clipped. */}
            <div className="grid grid-cols-4 gap-3 p-4">
              {trade.myOffer.blooks.map((b: TradeOfferBlook) => (
                <div 
                  key={b.name} 
                  onClick={() => handleRemoveBlook(b.name)}
                  className={`relative ${trade.myAccepted ? '' : 'cursor-pointer hover:scale-105'} transition-transform group bg-black/40 p-2 rounded-xl border`}
                  style={{ borderColor: `${getRarityColor(b.rarity)}40` }}
                >
                  <img src={b.image} className="w-full aspect-square object-contain" style={{ filter: isHighTierRarity(b.rarity) ? `drop-shadow(0 0 12px ${getRarityColor(b.rarity)})` : `drop-shadow(0 0 5px ${getRarityColor(b.rarity)}80)` }} />
                  <div className="absolute -top-2 -right-2 text-white text-xs font-black px-1.5 py-0.5 rounded-full" style={{ backgroundColor: getRarityColor(b.rarity) }}>{b.quantity}</div>
                  {!trade.myAccepted && (
                    <div className="absolute inset-0 bg-red-500/30 rounded-xl opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity backdrop-blur-[1px]">
                      <X className="text-white w-8 h-8 drop-shadow-md" />
                    </div>
                  )}
                </div>
              ))}
              {trade.myOffer.blooks.length === 0 && (
                <div className="col-span-4 text-center text-muted-foreground font-medium py-10 opacity-50">
                  No blooks added
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="hidden max-md:flex overflow-x-auto p-3 gap-3 z-20 custom-scrollbar items-center bg-black/10 min-h-[90px]">
            {trade.myOffer.blooks.map((b: TradeOfferBlook) => (
              <div 
                key={b.name} 
                onClick={() => handleRemoveBlook(b.name)}
                className={`relative shrink-0 w-16 h-16 ${trade.myAccepted ? '' : 'cursor-pointer active:scale-95'} transition-transform group bg-black/40 p-1.5 rounded-xl border`}
                style={{ borderColor: `${getRarityColor(b.rarity)}40` }}
              >
                <img src={b.image} className="w-full h-full object-contain" style={{ filter: isHighTierRarity(b.rarity) ? `drop-shadow(0 0 12px ${getRarityColor(b.rarity)})` : `drop-shadow(0 0 5px ${getRarityColor(b.rarity)}80)` }} />
                <div className="absolute -top-2 -right-2 text-white text-[10px] leading-none font-black px-1.5 py-0.5 rounded-full shadow-md" style={{ backgroundColor: getRarityColor(b.rarity) }}>{b.quantity}</div>
                {!trade.myAccepted && (
                  <div className="absolute inset-0 bg-red-500/30 rounded-xl opacity-0 group-active:opacity-100 flex items-center justify-center transition-opacity backdrop-blur-[1px]">
                    <X className="text-white w-6 h-6 drop-shadow-md" />
                  </div>
                )}
              </div>
            ))}
            {trade.myOffer.blooks.length === 0 && (
              <div className="text-center text-muted-foreground font-medium w-full text-sm opacity-50 py-2">
                No blooks added
              </div>
            )}
          </div>

          <div className="p-4 max-md:p-3 border-t border-card-border bg-black/20 z-20 shrink-0 flex flex-col max-md:flex-row max-md:items-center max-md:gap-3">
            <div className="flex items-center gap-3 mb-3 max-md:mb-0 max-md:flex-1">
              <TokenIcon className="w-6 h-6 max-md:w-5 max-md:h-5 text-yellow-400 shrink-0" />
              <Input 
                type="number"
                min={0}
                value={tokensInput}
                onChange={(e) => handleTokensChange(e.target.value)}
                max={me?.tokens ?? 0}
                onFocus={() => setIsTokensFocused(true)}
                onBlur={handleTokensBlur}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                disabled={trade.myAccepted || updateOfferMutation.isPending}
                className="font-black text-xl max-md:text-lg max-md:h-10 text-yellow-400 bg-black/30 border-yellow-400/20 focus-visible:border-yellow-400/50 h-12"
              />
            </div>

            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button 
                  disabled={trade.myAccepted || updateOfferMutation.isPending} 
                  className="w-full max-md:w-auto font-bold border-dashed border-2 border-primary/50 bg-primary/10 hover:bg-primary/20 text-primary h-12 max-md:h-10 max-md:px-4"
                >
                  <Plus className="w-5 h-5 mr-2 max-md:mr-1 max-md:w-4 max-md:h-4" /> Add Blook
                </Button>
              </PopoverTrigger>
              <PopoverContent className="z-[70] w-[300px] max-md:w-[280px] p-0 border-card-border" align="center" side="top" sideOffset={10}>
                <div className="p-3 border-b border-card-border bg-card">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input 
                      placeholder="Search your blooks..." 
                      className="h-9 pl-9 text-sm"
                      value={pickerSearch}
                      onChange={e => setPickerSearch(e.target.value)}
                    />
                  </div>
                </div>
                <ScrollArea className="h-64 bg-card">
                  <div className="grid grid-cols-4 gap-2 p-3">
                    {availableBlooks.map((b: OwnedBlook & { available: number }) => (
                      <div 
                        key={b.name}
                        onClick={() => handleAddBlook(b.name)}
                        className="cursor-pointer hover:scale-110 active:scale-95 transition-transform relative group bg-secondary rounded-lg p-1 border border-card-border"
                        title={`${b.name} (${b.available} left)`}
                      >
                        <img src={b.image} className="w-10 h-10 max-md:w-8 max-md:h-8 object-contain mx-auto" style={{ filter: isHighTierRarity(b.rarity) ? `drop-shadow(0 0 8px ${getRarityColor(b.rarity)})` : undefined }} />
                        <div className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground text-[10px] font-bold px-1 rounded-sm shadow-md">
                          x{b.available}
                        </div>
                      </div>
                    ))}
                    {availableBlooks.length === 0 && (
                      <div className="col-span-4 text-center text-xs text-muted-foreground py-8">No blooks available</div>
                    )}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Trade Chat */}
        <div className="flex flex-col bg-card border border-card-border rounded-xl overflow-hidden shadow-lg min-h-0 min-w-0 max-md:order-2 max-md:h-[232px] max-md:shrink-0">
          <div className="p-4 max-md:p-2 border-b border-card-border bg-black/20 shrink-0">
            <span className="font-bold text-white text-lg max-md:text-base">Trade Chat</span>
          </div>
          <ScrollArea className="flex-1 p-4 max-md:p-2" ref={chatScrollRef}>
            <div className="flex flex-col">
              {messages?.map((msg, i) => {
                const prev = i > 0 ? messages[i - 1] : null;
                const grouped = !!prev && prev.author === msg.author;
                return (
                  <div key={msg.id} className={grouped ? "mt-0.5" : "mt-2 first:mt-0"}>
                    <ChatMessageRow msg={msg} grouped={grouped} hideClan />
                  </div>
                );
              })}
              {messages?.length === 0 && (
                <div className="text-center text-muted-foreground text-sm py-4 max-md:py-2">No messages yet</div>
              )}
            </div>
          </ScrollArea>
          <div className="p-3 max-md:p-2 bg-secondary/50 border-t border-card-border shrink-0">
            <form onSubmit={handleSendChat} className="flex gap-2 w-full min-w-0">
              <Input 
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Message..."
                className="h-10 text-sm flex-1 min-w-0"
                maxLength={200}
              />
              <Button type="submit" disabled={!chatInput.trim() || sendMutation.isPending} size="icon" className="h-10 w-10 shrink-0">
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        </div>

        {/* Partner Offer */}
        <div className="flex flex-col bg-card border-2 border-card-border rounded-xl overflow-hidden shadow-lg relative min-h-0 min-w-0 max-md:order-1 max-md:shrink-0">
          {trade.partnerAccepted && (
            <div className="absolute inset-0 bg-green-900/10 pointer-events-none z-10" />
          )}
          <div className="p-4 max-md:p-2 border-b border-card-border bg-black/20 flex items-center justify-between z-20 shrink-0">
            <div className="flex items-center gap-3 max-md:gap-2">
              <div className="w-10 h-10 max-md:w-8 max-md:h-8 rounded-lg overflow-hidden bg-secondary border border-card-border shrink-0">
                {trade.partnerAvatarImage ? (
                  <img src={trade.partnerAvatarImage} className="w-full h-full object-contain" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-bold text-xl max-md:text-lg">{trade.partnerName.charAt(0).toUpperCase()}</div>
                )}
              </div>
              <span className="font-bold text-white text-lg max-md:text-base truncate">{trade.partnerName}</span>
            </div>
            {trade.partnerAccepted ? (
              <div className="bg-green-500 text-green-950 px-3 max-md:px-2 py-1 rounded-full font-black text-xs uppercase flex items-center gap-1 shadow-[0_0_10px_rgba(34,197,94,0.5)] shrink-0">
                <CheckCircle2 className="w-4 h-4 max-md:w-3 max-md:h-3" /> Ready
              </div>
            ) : (
              <div className="text-muted-foreground px-3 max-md:px-2 py-1 rounded-full font-bold text-xs uppercase flex items-center gap-1 shrink-0">
                <Loader2 className="w-3 h-3 max-md:w-3 max-md:h-3 animate-spin" /> Thinking
              </div>
            )}
          </div>

          <ScrollArea className="flex-1 z-20 max-md:hidden">
            {/* Padding inside the viewport so quantity badges aren't clipped. */}
            <div className="grid grid-cols-4 gap-3 p-4">
              {trade.partnerOffer.blooks.map((b: TradeOfferBlook) => (
                <div 
                  key={b.name} 
                  className="relative group bg-black/40 p-2 rounded-xl border"
                  style={{ borderColor: `${getRarityColor(b.rarity)}40` }}
                >
                  <img src={b.image} className="w-full aspect-square object-contain" style={{ filter: isHighTierRarity(b.rarity) ? `drop-shadow(0 0 12px ${getRarityColor(b.rarity)})` : `drop-shadow(0 0 5px ${getRarityColor(b.rarity)}80)` }} />
                  <div className="absolute -top-2 -right-2 text-white text-xs font-black px-1.5 py-0.5 rounded-full" style={{ backgroundColor: getRarityColor(b.rarity) }}>{b.quantity}</div>
                </div>
              ))}
              {trade.partnerOffer.blooks.length === 0 && (
                <div className="col-span-4 text-center text-muted-foreground font-medium py-10 opacity-50">
                  No blooks added
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="hidden max-md:flex overflow-x-auto p-3 gap-3 z-20 custom-scrollbar items-center bg-black/10 min-h-[90px]">
            {trade.partnerOffer.blooks.map((b: TradeOfferBlook) => (
              <div 
                key={b.name} 
                className="relative shrink-0 w-16 h-16 group bg-black/40 p-1.5 rounded-xl border"
                style={{ borderColor: `${getRarityColor(b.rarity)}40` }}
              >
                <img src={b.image} className="w-full h-full object-contain" style={{ filter: isHighTierRarity(b.rarity) ? `drop-shadow(0 0 12px ${getRarityColor(b.rarity)})` : `drop-shadow(0 0 5px ${getRarityColor(b.rarity)}80)` }} />
                <div className="absolute -top-2 -right-2 text-white text-[10px] leading-none font-black px-1.5 py-0.5 rounded-full shadow-md" style={{ backgroundColor: getRarityColor(b.rarity) }}>{b.quantity}</div>
              </div>
            ))}
            {trade.partnerOffer.blooks.length === 0 && (
              <div className="text-center text-muted-foreground font-medium w-full text-sm opacity-50 py-2">
                No blooks added
              </div>
            )}
          </div>

          <div className="p-4 max-md:p-3 border-t border-card-border bg-black/20 z-20 shrink-0">
            <div className="flex items-center gap-3 max-md:gap-2">
              <TokenIcon className="w-6 h-6 max-md:w-5 max-md:h-5 text-yellow-400 shrink-0" />
              <div className="font-black text-2xl max-md:text-xl text-yellow-400 h-12 max-md:h-10 flex items-center">
                {formatNumber(trade.partnerOffer.tokens)}
              </div>
            </div>
          </div>
        </div>

      </div>

      <div className="flex gap-4 shrink-0 md:mt-2 max-md:sticky max-md:bottom-2 max-md:z-50 max-md:bg-card/95 max-md:backdrop-blur-xl max-md:p-2 max-md:rounded-2xl max-md:border max-md:border-card-border max-md:shadow-[0_10px_40px_rgba(0,0,0,0.8)]">
        <Button 
          onClick={handleDecline} 
          disabled={declineMutation.isPending}
          className="flex-1 bg-red-600 hover:bg-red-500 text-white h-16 max-md:h-14 text-2xl max-md:text-xl font-black shadow-lg hover:shadow-red-600/20 transition-all rounded-xl"
        >
          <span className="max-md:hidden">Decline Trade</span>
          <span className="md:hidden">Decline</span>
        </Button>
        <Button 
          onClick={handleAccept} 
          disabled={acceptMutation.isPending || updateOfferMutation.isPending}
          className={`flex-1 h-16 max-md:h-14 text-2xl max-md:text-xl font-black shadow-lg transition-all rounded-xl ${
            trade.myAccepted 
              ? 'bg-amber-500 hover:bg-amber-400 text-amber-950 shadow-amber-500/20' 
              : 'bg-green-500 hover:bg-green-400 text-green-950 shadow-green-500/20'
          }`}
        >
          <span className="max-md:hidden">{trade.myAccepted ? "Cancel Accept" : "Accept Trade"}</span>
          <span className="md:hidden">{trade.myAccepted ? "Cancel" : "Accept"}</span>
        </Button>
      </div>
    </div>
  );
}

const DISMISSED_KEY = "blk_dismissed_trade_id";

export default function TradePage() {
  const isMobile = useIsMobile();
  // Persisted across remounts/navigation: the server surfaces just-ended
  // trades for ~45s, so we must remember dismissal or the completed screen
  // reappears every time the page is revisited.
  const [dismissedTradeId, setDismissedTradeIdState] = useState<number>(() =>
    Number(sessionStorage.getItem(DISMISSED_KEY) ?? 0),
  );
  const setDismissedTradeId = (id: number) => {
    sessionStorage.setItem(DISMISSED_KEY, String(id));
    setDismissedTradeIdState(id);
  };

  const { data: trade, isLoading, error } = useGetCurrentTrade({
    query: { refetchInterval: 2500, retry: false, queryKey: getGetCurrentTradeQueryKey(), placeholderData: keepPreviousData }
  });

  const isNoTrade = (error as any)?.status === 404;
  // A terminal (completed/declined) trade at or below the dismissed id is
  // history — never resurface it. Active trades always show.
  const isTerminal = trade && trade.status !== "active";
  const activeTrade = trade && !(isTerminal && trade.id <= dismissedTradeId) ? trade : null;

  // Only show the full-page spinner on the very first load; background
  // polling must never flip back to the spinner (it remounts children).
  const hasSettledRef = useRef(false);
  if (!isLoading || error || trade) hasSettledRef.current = true;

  if (isLoading && !error && !trade && !hasSettledRef.current) {
    return <Layout title="Trade"><div className="flex h-full items-center justify-center"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div></Layout>;
  }

  const showActiveTrade =
    !!activeTrade && activeTrade.status === "active" && !isNoTrade;

  // An active trade takes over the whole screen — no sidebar, just a
  // branded top bar above the trade UI.
  if (showActiveTrade) {
    return (
      <div className="fixed inset-0 z-[60] bg-background text-foreground flex flex-col">
        <div className="absolute inset-0 bg-checkerboard opacity-20 pointer-events-none" />
        <header className="h-16 max-md:h-14 shrink-0 bg-card border-b-2 border-card-border flex items-center gap-3 px-5 max-md:px-3 relative z-10">
          <img src={logoImg} alt="Logo" className="w-11 h-11 max-md:w-9 max-md:h-9 object-contain drop-shadow-md" />
          <h1 className="text-2xl max-md:text-xl font-black font-display tracking-widest text-rainbow uppercase" style={{ animationDelay: RAINBOW_OFFSET }}>
            CLOAKET
          </h1>
        </header>
        <main className={`flex-1 min-h-0 relative z-10 p-4 max-md:p-2 ${isMobile ? "overflow-y-auto custom-scrollbar" : "overflow-hidden"}`}>
          <TradeActive trade={activeTrade} />
        </main>
      </div>
    );
  }

  return (
    <Layout title="Trade">
      {(!activeTrade || (isNoTrade && activeTrade.status === 'active')) ? (
        <TradeEmptyState />
      ) : activeTrade.status === 'completed' || activeTrade.status === 'declined' ? (
        <TradeResult trade={activeTrade} onDismiss={() => setDismissedTradeId(activeTrade.id)} />
      ) : (
        <TradeActive trade={activeTrade} />
      )}
    </Layout>
  );
}