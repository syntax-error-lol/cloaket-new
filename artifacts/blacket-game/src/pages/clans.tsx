import { usePlaceClanHeldBlook, useWithdrawClanHeldBlook, useGetMyBlooks, getGetMyBlooksQueryKey, useGetRarities, getGetRaritiesQueryKey } from "@workspace/api-client-react";
import { AlertTriangle } from "lucide-react";
import { Layout } from "@/components/layout/layout";
import { useState, useRef, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetClans, getGetClansQueryKey,
  useGetMyClanMembership, getGetMyClanMembershipQueryKey,
  useCreateClan,
  useGetClan, getGetClanQueryKey,
  useApplyToClan,
  useDecideClanApplication,
  useJoinClan,
  useLeaveClan,
  useGetClanMessages, getGetClanMessagesQueryKey,
  useSendClanMessage,
  useGetMe, getGetMeQueryKey,
  useSetClanImage,
  useSetClanDescription,
  useRenameClan,
  useKickClanMember,
  useTransferClanOwnership,
  useBoostClan,
  useSetClanRainbow
} from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader, DialogFooter } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Loader2, Lock, Plus, Check, X, Send, LogOut, ArrowLeft, Users, Settings, Image as ImageIcon, UploadCloud, MessageSquare, Crown, Pencil, Search } from "lucide-react";
import { FaBriefcase } from "react-icons/fa6";
import { TokenIcon } from "@/components/token-icon";
import { Textarea } from "@/components/ui/textarea";
import { ChatMessageRow } from "@/components/chat-message";

function ClanChat({ clanColor }: { clanColor: string }) {
  const [content, setContent] = useState("");
  const queryClient = useQueryClient();
  const sendMutation = useSendClanMessage();
  const { data: me } = useGetMe();

  const { data: messages, isLoading } = useGetClanMessages(undefined, {
    query: {
      refetchInterval: 3000,
      queryKey: getGetClanMessagesQueryKey()
    }
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessageCount = useRef(messages?.length || 0);

  useEffect(() => {
    if (!messages) return;
    if (scrollRef.current) {
      const scrollElement = scrollRef.current;
      const distanceToBottom = scrollElement.scrollHeight - scrollElement.scrollTop - scrollElement.clientHeight;
      const isAtBottom = distanceToBottom < 150;
      const isFirstLoad = lastMessageCount.current === 0;
      const hasNewMessageFromMe = messages.length > 0 && messages[messages.length - 1]?.author === me?.username;
      
      if (isAtBottom || isFirstLoad || hasNewMessageFromMe) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (scrollElement) {
              scrollElement.scrollTop = scrollElement.scrollHeight;
            }
          });
        });
      }
    }
    lastMessageCount.current = messages.length;
  }, [messages, me]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || sendMutation.isPending) return;

    sendMutation.mutate({ data: { content: content.trim() } }, {
      onSuccess: () => {
        setContent("");
        queryClient.invalidateQueries({ queryKey: getGetClanMessagesQueryKey() });
      }
    });
  };

  return (
    <Card className="flex flex-col h-full overflow-hidden shadow-xl border-2 max-md:border min-h-0 min-w-0 relative max-md:rounded-xl" style={{ borderColor: `${clanColor}40` }}>
      <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundColor: clanColor }} />
      <div className="p-4 max-md:p-3 border-b border-white/10 bg-black/40 shrink-0 relative z-10 flex items-center gap-3 max-md:gap-2">
        <div className="w-2 h-2 max-md:w-1.5 max-md:h-1.5 rounded-full animate-pulse" style={{ backgroundColor: clanColor, boxShadow: `0 0 10px ${clanColor}` }} />
        <span className="font-black font-display text-white text-xl max-md:text-lg tracking-wide">Clan Chat</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 max-md:p-3 relative z-10 custom-scrollbar min-h-0" ref={scrollRef}>
        <div className="flex flex-col pb-2">
          {isLoading && !messages ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-8 h-8 max-md:w-6 max-md:h-6 animate-spin" style={{ color: clanColor }} />
            </div>
          ) : messages?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <MessageSquare className="w-12 h-12 max-md:w-10 max-md:h-10 mb-3 max-md:mb-2 opacity-20" style={{ color: clanColor }} />
              <span className="text-white/50 font-bold text-sm max-md:text-xs">No messages yet. Say hi!</span>
            </div>
          ) : (
            messages?.map((msg, i) => {
              const prev = i > 0 ? messages[i - 1] : null;
              const grouped = !!prev && prev.author === msg.author;
              return (
                <div key={msg.id} className={grouped ? "mt-0.5" : "mt-3 max-md:mt-2 first:mt-0"}>
                  <ChatMessageRow msg={msg} grouped={grouped} />
                </div>
              );
            })
          )}
        </div>
      </div>
      <div className="p-4 max-md:p-2 bg-black/40 border-t border-white/10 shrink-0 relative z-10">
        <form onSubmit={handleSend} className="flex gap-3 max-md:gap-2 w-full min-w-0">
          <Input 
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Message clan..."
            className="h-12 max-md:h-10 max-md:text-sm flex-1 min-w-0 font-bold bg-secondary rounded-xl max-md:rounded-lg border-2 max-md:border px-4 max-md:px-3 shadow-inner focus-visible:ring-1"
            maxLength={200}
            style={{ borderColor: `${clanColor}40`, '--tw-ring-color': clanColor } as React.CSSProperties}
          />
          <Button type="submit" disabled={!content.trim() || sendMutation.isPending} className="h-12 max-md:h-10 w-16 max-md:w-12 shrink-0 hover:opacity-90 rounded-xl max-md:rounded-lg transition-transform hover:scale-105 active:scale-95 shadow-lg" style={{ backgroundColor: clanColor }}>
            {sendMutation.isPending ? <Loader2 className="w-5 h-5 max-md:w-4 max-md:h-4 animate-spin text-white" /> : <Send className="w-5 h-5 max-md:w-4 max-md:h-4 text-white" />}
          </Button>
        </form>
      </div>
    </Card>
  );
}



// Blook and banner images come in two flavors: object-storage paths
// ("/objects/…") are served through /api/storage, while built-in content
// paths ("/api/…") are already complete. Prefixing the latter breaks them.
function resolveImageUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  return path.startsWith('/objects/') ? `/api/storage${path}` : path;
}

function formatTimeLeft(ms: number): string {
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${Math.max(mins, 1)}m`;
}

function ClanHeldVault({ clanDetail, isMemberOrOwner }: { clanDetail: any, isMemberOrOwner: boolean }) {
  const queryClient = useQueryClient();
  const { data: me } = useGetMe();
  const placeMutation = usePlaceClanHeldBlook();
  const withdrawMutation = useWithdrawClanHeldBlook();
  const [placeOpen, setPlaceOpen] = useState(false);
  // Batch selection: blook name -> how many copies to place this round.
  const [selectedBlooks, setSelectedBlooks] = useState<Record<string, number>>({});
  const [now, setNow] = useState(() => Date.now());
  const { data: rarities } = useGetRarities({ query: { queryKey: getGetRaritiesQueryKey(), staleTime: Infinity } });

  // Tick so lock countdowns stay honest while the page sits open.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const rarityColor = (rarity: string) => rarities?.find((r: any) => r.name === rarity)?.color ?? '#fff';

  const { data: myBlooks, isLoading: blooksLoading } = useGetMyBlooks({
    query: { enabled: placeOpen, queryKey: getGetMyBlooksQueryKey() }
  });

  // Blooks with a real clan power float to the top of the picker.
  // Miscellaneous trophies and the 1k gamble blook can never be held
  // (the server rejects them too), so they don't appear at all.
  const availableBlooks = useMemo(() => {
    return (myBlooks || [])
      .filter((b: any) => b.quantity > 0 && b.pack !== "Miscellaneous" && b.pack !== "1k" && b.pack !== "Top")
      .sort((a: any, b: any) => {
        if (!!a.clanEffect !== !!b.clanEffect) return a.clanEffect ? -1 : 1;
        return b.price - a.price;
      });
  }, [myBlooks]);

  const selectedTotal = useMemo(
    () => Object.values(selectedBlooks).reduce((sum, n) => sum + n, 0),
    [selectedBlooks],
  );

  const addBlook = (b: any) => {
    const current = selectedBlooks[b.name] ?? 0;
    if (current >= b.quantity) return;
    if (selectedTotal >= 30) {
      toast({ title: "Batch limit", description: "You can place at most 30 blooks at once.", variant: "destructive" });
      return;
    }
    setSelectedBlooks({ ...selectedBlooks, [b.name]: current + 1 });
  };

  const removeBlook = (name: string) => {
    setSelectedBlooks((prev) => {
      const current = prev[name] ?? 0;
      if (current <= 1) {
        const { [name]: _gone, ...rest } = prev;
        return rest;
      }
      return { ...prev, [name]: current - 1 };
    });
  };

  const handlePlace = () => {
    if (selectedTotal === 0 || placeMutation.isPending) return;
    const blookNames = Object.entries(selectedBlooks).flatMap(([name, count]) => Array(count).fill(name) as string[]);
    placeMutation.mutate({ clanId: clanDetail.id, data: { blookNames } }, {
      onSuccess: (res: any) => {
        setPlaceOpen(false);
        setSelectedBlooks({});
        const unavailable = (res.results ?? []).filter((r: any) => r.outcome === 'unavailable').length;
        const parts: string[] = [];
        if (res.heldCount > 0) parts.push(`${res.heldCount} now held by the clan`);
        if (res.lostCount > 0) parts.push(`${res.lostCount} destroyed by the 5% risk`);
        if (unavailable > 0) parts.push(`${unavailable} skipped (not owned)`);
        toast({
          title: res.lostCount > 0 ? "Placed — with losses" : "Blooks Placed!",
          description: parts.length > 0 ? `${parts.join(', ')}.` : 'Nothing was placed.',
          variant: res.lostCount > 0 ? 'destructive' : undefined,
        });
        queryClient.invalidateQueries({ queryKey: getGetClanQueryKey(clanDetail.id) });
        queryClient.invalidateQueries({ queryKey: getGetMyBlooksQueryKey() });
      },
      onError: (err: any) => {
        toast({ title: "Placement failed", description: err?.data?.message || "Failed to place blooks", variant: "destructive" });
      }
    });
  };

  const handleWithdraw = (heldBlookId: number) => {
    if (withdrawMutation.isPending) return;
    withdrawMutation.mutate({ clanId: clanDetail.id, heldBlookId }, {
      onSuccess: (res: any) => {
        toast({ title: "Withdrawn", description: res.message });
        queryClient.invalidateQueries({ queryKey: getGetClanQueryKey(clanDetail.id) });
        queryClient.invalidateQueries({ queryKey: getGetMyBlooksQueryKey() });
      },
      onError: (err: any) => {
        toast({ title: "Withdrawal failed", description: err?.data?.message || "Try again later", variant: "destructive" });
      }
    });
  };

  const production = clanDetail.heldProduction ?? { payingCount: 0, ratePerHour: 0 };
  // Vault order: your own placements first, then highest rarity down. Rarity
  // rank comes from the /rarities catalog order (lowest → highest).
  const myUsername = me?.username;
  const heldBlooks = useMemo(() => {
    const rank = (r: string) => rarities?.findIndex((x: any) => x.name === r) ?? -1;
    return [...(clanDetail.heldBlooks ?? [])].sort((a: any, b: any) => {
      const mine = (b.ownerUsername === myUsername ? 1 : 0) - (a.ownerUsername === myUsername ? 1 : 0);
      if (mine !== 0) return mine;
      const byRarity = rank(b.rarity) - rank(a.rarity);
      if (byRarity !== 0) return byRarity;
      return a.id - b.id;
    });
  }, [clanDetail.heldBlooks, rarities, myUsername]);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 flex flex-col gap-4 max-md:gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <FaBriefcase className="w-6 h-6 max-md:w-5 max-md:h-5" style={{ color: clanDetail.color ?? '#fff', filter: `drop-shadow(0 0 6px ${clanDetail.color ?? '#fff'}50)` }} />
            <h2 className="font-black font-display text-white text-2xl max-md:text-xl uppercase tracking-wide">Held Blooks</h2>
            <span className="bg-black/40 border border-white/10 px-2 py-0.5 rounded-full text-[11px] font-black text-muted-foreground uppercase tracking-widest">{heldBlooks.length} held</span>
          </div>
          {isMemberOrOwner && (
            <Button onClick={() => setPlaceOpen(true)} className="font-black h-10 max-md:h-9 px-5 max-md:px-4 rounded-xl max-md:rounded-lg bg-primary hover:bg-primary/90 text-white uppercase tracking-wider text-sm max-md:text-xs transition-transform hover:scale-105 active:scale-95" data-testid="button-place-blook">
              <Plus className="w-4 h-4 mr-1.5" /> Place Blook
            </Button>
          )}
        </div>

        {clanDetail.activeEffects && clanDetail.activeEffects.length > 0 && (
          <div className="flex flex-wrap gap-1.5 shrink-0">
            {clanDetail.activeEffects.map((fx: any) => {
              const dashIdx = fx.label.indexOf('—');
              const source = dashIdx >= 0 ? fx.label.slice(0, dashIdx).trim() : null;
              const perk = dashIdx >= 0 ? fx.label.slice(dashIdx + 1).trim() : fx.label;
              return (
                <div key={fx.key} title={fx.description} className="cursor-help bg-secondary/60 border border-card-border rounded-lg px-2.5 py-1.5 flex flex-col leading-tight" data-testid={`chip-effect-${fx.key}`}>
                  <span className="text-[11px] max-md:text-[10px] font-black text-white/90">{perk}</span>
                  {source && (
                    <span className="text-[9px] max-md:text-[8px] font-bold text-muted-foreground uppercase tracking-wider truncate max-w-[140px]">{source}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <Card className="border-2 max-md:border border-card-border bg-secondary/30 overflow-hidden shrink-0 max-md:rounded-xl">
          <div className="p-4 max-md:p-3 flex items-center justify-between gap-4 max-md:flex-col max-md:items-stretch">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 max-md:w-10 max-md:h-10 rounded-xl bg-secondary border border-card-border flex items-center justify-center shrink-0">
                <TokenIcon className="w-6 h-6" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-black font-display text-white uppercase tracking-wider text-sm">Token Mine</span>
                <span className="text-xs max-md:text-[11px] text-muted-foreground font-bold">
                  {production.payingCount > 0
                    ? `${production.payingCount} blook${production.payingCount === 1 ? '' : 's'} paying${isMemberOrOwner ? ` — ${production.ratePerHour} tokens/hr per member` : ' the clan hourly'}`
                    : 'Held blooks pay all members tokens hourly — Uncommons grant pack luck instead'}
                </span>
              </div>
            </div>
          </div>
        </Card>

        {heldBlooks.length === 0 ? (
          <Card className="flex flex-col items-center justify-center py-16 max-md:py-10 border-2 max-md:border border-dashed border-card-border bg-black/10 max-md:rounded-xl">
            <div className="w-16 h-16 max-md:w-12 max-md:h-12 bg-secondary/50 rounded-2xl mb-4 max-md:mb-3 flex items-center justify-center rotate-6">
              <Lock className="w-7 h-7 max-md:w-5 max-md:h-5 text-muted-foreground" />
            </div>
            <span className="font-black font-display text-white uppercase tracking-widest text-lg max-md:text-base">No Held Blooks</span>
            <p className="text-sm max-md:text-xs text-muted-foreground font-medium mt-2 max-w-md text-center px-6">
              {isMemberOrOwner
                ? 'Most held blooks auto-pay all members tokens hourly — higher rarities pay more. Mysticals and Uncommons grant clan-wide powers instead.'
                : 'This clan has not placed any blooks yet.'}
            </p>
          </Card>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1">
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 max-md:gap-1.5 pb-4">
            {heldBlooks.map((hb: any) => {
              const lockMsLeft = new Date(hb.withdrawableAt).getTime() - now;
              const color = rarityColor(hb.rarity);
              return (
                <Card key={hb.id} className="relative overflow-hidden border-2 max-md:border border-card-border bg-card p-2 flex flex-col items-center gap-1.5 max-md:rounded-xl">
                  <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: color }} />
                  <div className="w-14 h-14 max-md:w-12 max-md:h-12 mt-1">
                    <img src={resolveImageUrl(hb.image)} alt={hb.blookName} className="w-full h-full object-contain animate-blook-float" style={{ filter: `drop-shadow(0 0 8px ${color}60)` }} />
                  </div>
                  <div className="flex flex-col items-center text-center min-w-0 w-full leading-tight">
                    <span className="font-black text-xs max-md:text-[11px] text-white truncate w-full">{hb.blookName}</span>
                    <span className="text-[9px] font-black uppercase tracking-widest" style={{ color }}>{hb.rarity}</span>
                  </div>
                  <div className="w-full bg-black/20 border border-white/5 rounded-lg px-1.5 py-1 text-center">
                    <span className="text-[9px] max-md:text-[8px] font-bold text-muted-foreground leading-tight block">{hb.effect ?? '—'}</span>
                  </div>
                  <span className="text-[8px] text-muted-foreground font-bold uppercase tracking-wider truncate w-full text-center">Placed by {hb.ownerUsername}</span>
                  {hb.canWithdraw ? (
                    <Button size="sm" onClick={() => handleWithdraw(hb.id)} disabled={withdrawMutation.isPending} className="w-full h-7 max-md:h-6 bg-primary/20 text-primary hover:bg-primary/40 font-black text-[9px] uppercase tracking-wider rounded-lg" data-testid={`button-withdraw-${hb.id}`}>
                      Withdraw
                    </Button>
                  ) : (
                    <div className="w-full h-7 max-md:h-6 flex items-center justify-center gap-1.5 rounded-lg bg-black/30 border border-white/5" title={lockMsLeft > 0 ? 'Locked for 7 days after placement' : 'Only the contributor can withdraw'}>
                      <Lock className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">{lockMsLeft > 0 ? formatTimeLeft(lockMsLeft) : 'Held'}</span>
                    </div>
                  )}
                </Card>
              );
            })}
            </div>
          </div>
        )}
      </div>

      <Dialog open={placeOpen} onOpenChange={(open) => { if (!open) { setPlaceOpen(false); setSelectedBlooks({}); } }}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col max-md:w-[95%] p-0 overflow-hidden border-2 border-primary/20 bg-background">
          <div className="p-4 max-md:p-3 border-b border-card-border bg-secondary/20 shrink-0">
            <DialogTitle className="text-lg max-md:text-base font-black font-display uppercase text-white">Place Clan Blook</DialogTitle>
            <div className="mt-2 flex gap-2 items-start">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-black text-amber-400 block mb-0.5">RISK OF LOSS (5%) & 7-DAY LOCK</span>
                <span className="text-muted-foreground font-medium">There is a 5% chance the blook is lost permanently upon placement. If successful, it is locked in the clan for 7 days before you can withdraw it. You still own it while held.</span>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 max-md:p-2 custom-scrollbar bg-background/50">
            {blooksLoading ? (
               <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 max-md:gap-1.5">
                {availableBlooks.map((b: any) => {
                  const count = selectedBlooks[b.name] ?? 0;
                  return (
                    <div
                      key={b.name}
                      className={`relative rounded-lg border transition-all ${count > 0 ? 'border-primary bg-primary/10 z-10' : 'border-card-border bg-card hover:bg-secondary/50'}`}
                    >
                      <button
                        onClick={() => addBlook(b)}
                        className="w-full p-2 flex flex-col items-center gap-1"
                        data-testid={`button-pick-${b.name}`}
                      >
                        <div className="absolute top-1 right-1 bg-black/60 rounded px-1 text-[8px] font-black text-white">x{b.quantity}</div>
                        <div className="w-11 h-11 max-md:w-9 max-md:h-9">
                          <img src={resolveImageUrl(b.image)} alt={b.name} className="w-full h-full object-contain" />
                        </div>
                        <span className="text-[10px] max-md:text-[9px] font-bold text-white truncate w-full text-center">{b.name}</span>
                        <span className="text-[8px] font-bold text-muted-foreground leading-tight text-center line-clamp-2 min-h-[16px]">{b.clanEffect ?? '—'}</span>
                      </button>
                      {count > 0 && (
                        <>
                          <div className="absolute top-1 left-1 bg-primary text-primary-foreground rounded px-1 text-[8px] font-black">{count}×</div>
                          <button
                            onClick={() => removeBlook(b.name)}
                            className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-destructive text-white text-[10px] font-black leading-none flex items-center justify-center"
                            data-testid={`button-unpick-${b.name}`}
                            aria-label={`Remove one ${b.name}`}
                          >−</button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="p-3 max-md:p-2 border-t border-card-border bg-secondary/20 shrink-0 flex items-center justify-end gap-2">
            {selectedTotal > 0 && (
              <span className="mr-auto text-xs max-md:text-[10px] font-bold text-white/70 truncate" data-testid="text-selected-count">
                {selectedTotal} selected
              </span>
            )}
            <Button variant="outline" onClick={() => { setPlaceOpen(false); setSelectedBlooks({}); }} className="font-bold h-9 max-md:h-8 text-xs px-3">Cancel</Button>
            <Button disabled={selectedTotal === 0 || placeMutation.isPending} onClick={handlePlace} className="font-black bg-destructive hover:bg-destructive/90 text-white h-9 max-md:h-8 text-xs px-3" data-testid="button-confirm-place">
              {placeMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : selectedTotal > 1 ? `Place ${selectedTotal} (5% Risk Each)` : "Place (5% Risk)"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Clans() {
  const queryClient = useQueryClient();
  const { data: clans, isLoading: clansLoading } = useGetClans({
    query: { queryKey: getGetClansQueryKey(), refetchInterval: 5000 }
  });

  const applyMutation = useApplyToClan();
  const joinMutation = useJoinClan();
  const leaveMutation = useLeaveClan();
  const createMutation = useCreateClan();
  const decideMutation = useDecideClanApplication();
  const setClanImageMutation = useSetClanImage();
  const setDescriptionMutation = useSetClanDescription();
  const [descOpen, setDescOpen] = useState(false);
  const [descText, setDescText] = useState("");
  const renameClanMutation = useRenameClan();
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameText, setRenameText] = useState("");
  const kickMutation = useKickClanMember();
  const transferMutation = useTransferClanOwnership();
  const boostMutation = useBoostClan();
  const rainbowMutation = useSetClanRainbow();
  const { data: me } = useGetMe();

  // Banned clans are hidden from the clans list, so their members would
  // otherwise have no Leave button anywhere — stuck, unable to join another
  // clan. This endpoint reports membership even when the clan is hidden.
  const { data: myMembership } = useGetMyClanMembership({
    query: { queryKey: getGetMyClanMembershipQueryKey() },
  });

  const handleBannedLeave = () => {
    leaveMutation.mutate(undefined, {
      onSuccess: (res) => {
        toast({ title: "Left the clan", description: res.message || "You're free to join or create another clan." });
        queryClient.invalidateQueries({ queryKey: getGetMyClanMembershipQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetClansQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      },
      onError: (err) => {
        toast({ title: "Couldn't leave", description: (err as any)?.data?.message || "Try again later.", variant: "destructive" });
      },
    });
  };

  const handleBoost = (clanId: number) => {
    boostMutation.mutate({ clanId }, {
      onSuccess: (result) => {
        toast({ title: "Clan boosted!", description: `Your clan jumped to level ${result.level}!` });
        queryClient.invalidateQueries({ queryKey: getGetClanQueryKey(clanId) });
        queryClient.invalidateQueries({ queryKey: getGetClansQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      },
      onError: (err) => {
        toast({ title: "Boost failed", description: (err as any)?.data?.message || "Try again later.", variant: "destructive" });
      }
    });
  };

  const handleRainbow = (clanId: number, apply: boolean) => {
    rainbowMutation.mutate({ clanId, data: { apply } }, {
      onSuccess: (result) => {
        toast({ title: result.rainbow ? "Rainbow applied!" : "Rainbow removed", description: result.rainbow ? "Your clan name now shines in rainbow colors." : "The rainbow perk is back in your inventory." });
        queryClient.invalidateQueries({ queryKey: getGetClanQueryKey(clanId) });
        queryClient.invalidateQueries({ queryKey: getGetClansQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      },
      onError: (err) => {
        toast({ title: "Failed", description: (err as any)?.data?.message || "Try again later.", variant: "destructive" });
      }
    });
  };

  const { uploadFile: uploadCreateBanner, isUploading: isCreateUploading } = useUpload({
    onError: (err: Error) => toast({ title: "Upload Failed", description: err.message, variant: "destructive" })
  });
  
  const { uploadFile: uploadUpdateBanner, isUploading: isUpdateUploading } = useUpload({
    onError: (err: Error) => toast({ title: "Upload Failed", description: err.message, variant: "destructive" })
  });

  const [selectedClanId, setSelectedClanId] = useState<number | null>(null);
  const [directorySearch, setDirectorySearch] = useState("");
  const initialClanSelectionAttempted = useRef(false);
  const [mobileView, setMobileView] = useState<'info' | 'chat'>('info');
  // 'overview' is the classic clan page; 'held' swaps the whole detail area
  // for the full-size held-blooks vault.
  const [detailView, setDetailView] = useState<'overview' | 'held'>('overview');
  
  const { data: clanDetail, isLoading: detailLoading } = useGetClan(selectedClanId!, {
    query: {
      enabled: !!selectedClanId,
      queryKey: getGetClanQueryKey(selectedClanId!),
      refetchInterval: 5000
    }
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createColor, setCreateColor] = useState("#8b5cf6");
  const [createImage, setCreateImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [kickTarget, setKickTarget] = useState<string | null>(null);
  // Transfer dialog state: pickerOpen shows the member list; target is the
  // chosen member awaiting confirmation; leaveAfter leaves the clan once the
  // transfer succeeds (owner "leave" flow).
  const [transferPickerOpen, setTransferPickerOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState<string | null>(null);
  const [leaveAfterTransfer, setLeaveAfterTransfer] = useState(false);

  const handleKick = () => {
    if (!kickTarget || !selectedClanId) return;
    kickMutation.mutate({ clanId: selectedClanId, data: { username: kickTarget } }, {
      onSuccess: () => {
        toast({ title: "Kicked", description: `${kickTarget} was removed from the clan.` });
        setKickTarget(null);
        queryClient.invalidateQueries({ queryKey: getGetClanQueryKey(selectedClanId) });
        queryClient.invalidateQueries({ queryKey: getGetClansQueryKey() });
      },
      onError: (err) => {
        toast({ title: "Failed", description: (err as any)?.data?.message || "Couldn't kick that player", variant: "destructive" });
        setKickTarget(null);
      }
    });
  };

  const isInClan = useMemo(() => clans?.some(c => c.myStatus === 'member' || c.myStatus === 'owner'), [clans]);

  // The Clan tab is a home for the player's clan first. They can still return
  // to the directory without this effect immediately selecting their clan again.
  useEffect(() => {
    if (!clans || initialClanSelectionAttempted.current) return;

    initialClanSelectionAttempted.current = true;
    const myClan = clans.find((clan) => clan.myStatus === 'member' || clan.myStatus === 'owner');
    if (myClan) {
      setSelectedClanId(myClan.id);
    }
  }, [clans]);

  const visibleClans = useMemo(() => {
    if (!clans) return [];
    const normalizedSearch = directorySearch.trim().toLowerCase();

    return [...clans]
      .filter((clan) => {
        if (!normalizedSearch) return true;
        return clan.name.toLowerCase().includes(normalizedSearch)
          || clan.ownerUsername.toLowerCase().includes(normalizedSearch);
      })
      .sort((a, b) => {
        const aIsMine = a.myStatus === 'member' || a.myStatus === 'owner';
        const bIsMine = b.myStatus === 'member' || b.myStatus === 'owner';
        if (aIsMine !== bIsMine) return aIsMine ? -1 : 1;
        // Directory runs highest level first; names only break exact ties.
        return (b.level - a.level) || a.name.localeCompare(b.name);
      });
  }, [clans, directorySearch]);

  const handleApply = (id: number) => {
    applyMutation.mutate({ clanId: id }, {
      onSuccess: () => {
        toast({ title: "Applied", description: "Your application has been sent." });
        queryClient.invalidateQueries({ queryKey: getGetClansQueryKey() });
      },
      onError: (err) => toast({ title: "Failed", description: (err as any)?.data?.message || "Error applying", variant: "destructive" })
    });
  };

  const handleJoin = (id: number) => {
    joinMutation.mutate({ clanId: id }, {
      onSuccess: (res) => {
        // Server message may note held blooks that moved with you.
        toast({ title: "Joined", description: res?.message || "You have joined the clan!" });
        queryClient.invalidateQueries({ queryKey: getGetClansQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetClanQueryKey(id) });
      },
      onError: (err) => toast({ title: "Failed", description: (err as any)?.data?.message || "Error joining", variant: "destructive" })
    });
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max image size is 5MB.", variant: "destructive" });
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast({ title: "Invalid file", description: "Only images are allowed.", variant: "destructive" });
      return;
    }
    setCreateImage(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim()) return;

    let imagePath: string | undefined = undefined;
    if (createImage) {
      const uploadRes = await uploadCreateBanner(createImage);
      if (!uploadRes) return;
      imagePath = uploadRes.objectPath;
    }

    createMutation.mutate({ data: { name: createName.trim(), color: createColor, imagePath } }, {
      onSuccess: () => {
        toast({ title: "Created", description: "Your clan has been created." });
        setCreateOpen(false);
        setCreateName("");
        setCreateColor("#8b5cf6");
        setCreateImage(null);
        setImagePreview(null);
        queryClient.invalidateQueries({ queryKey: getGetClansQueryKey() });
      },
      onError: (err) => toast({ title: "Failed", description: (err as any)?.data?.message || "Error creating clan", variant: "destructive" })
    });
  };

  const handleLeave = () => {
    if (!selectedClanId) return;
    leaveMutation.mutate(undefined, {
      onSuccess: () => {
        toast({ title: "Left Clan", description: "You have left the clan." });
        setLeaveConfirmOpen(false);
        setSelectedClanId(null);
        queryClient.invalidateQueries({ queryKey: getGetClansQueryKey() });
      },
      onError: (err) => toast({ title: "Failed", description: (err as any)?.data?.message || "Error leaving clan", variant: "destructive" })
    });
  };

  const handleTransfer = () => {
    if (!transferTarget || !selectedClanId) return;
    const target = transferTarget;
    const leaveAfter = leaveAfterTransfer;
    transferMutation.mutate({ clanId: selectedClanId, data: { username: target } }, {
      onSuccess: () => {
        setTransferTarget(null);
        setTransferPickerOpen(false);
        setLeaveAfterTransfer(false);
        queryClient.invalidateQueries({ queryKey: getGetClanQueryKey(selectedClanId) });
        queryClient.invalidateQueries({ queryKey: getGetClansQueryKey() });
        if (leaveAfter) {
          leaveMutation.mutate(undefined, {
            onSuccess: () => {
              toast({ title: "Left Clan", description: `${target} is the new owner and you left the clan.` });
              setSelectedClanId(null);
              queryClient.invalidateQueries({ queryKey: getGetClansQueryKey() });
            },
            onError: (err) => toast({ title: "Transfer done, but leaving failed", description: (err as any)?.data?.message || "Try leaving again.", variant: "destructive" })
          });
        } else {
          toast({ title: "Ownership transferred", description: `${target} is now the clan owner.` });
        }
      },
      onError: (err) => {
        toast({ title: "Failed", description: (err as any)?.data?.message || "Couldn't transfer ownership", variant: "destructive" });
        setTransferTarget(null);
      }
    });
  };

  const handleDecide = (username: string, action: 'accept' | 'reject') => {
    if (!selectedClanId) return;
    decideMutation.mutate({ clanId: selectedClanId, data: { username, action } }, {
      onSuccess: () => {
        toast({ title: action === 'accept' ? "Accepted" : "Rejected", description: `${username}'s application was ${action}ed.` });
        queryClient.invalidateQueries({ queryKey: getGetClanQueryKey(selectedClanId) });
      },
      onError: (err) => toast({ title: "Failed", description: (err as any)?.data?.message || "Error updating application", variant: "destructive" })
    });
  };

  const handleBannerSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedClanId) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max image size is 5MB.", variant: "destructive" });
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast({ title: "Invalid file", description: "Only images are allowed.", variant: "destructive" });
      return;
    }

    const uploadRes = await uploadUpdateBanner(file);
    if (!uploadRes) return;

    setClanImageMutation.mutate({ clanId: selectedClanId, data: { imagePath: uploadRes.objectPath } }, {
      onSuccess: () => {
        toast({ title: "Success", description: "Clan banner updated." });
        queryClient.invalidateQueries({ queryKey: getGetClanQueryKey(selectedClanId) });
        queryClient.invalidateQueries({ queryKey: getGetClansQueryKey() });
      },
      onError: (err: any) => {
        toast({ title: "Failed", description: err?.data?.message || "Failed to update image", variant: "destructive" });
      }
    });
    
    e.target.value = '';
  };

  const handleView = (id: number) => {
    setSelectedClanId(id);
    setMobileView('info');
    setDetailView('overview');
  };

  if (selectedClanId) {
    const isOwner = clanDetail?.myStatus === 'owner';
    const isMemberOrOwner = clanDetail?.myStatus === 'member' || isOwner;

    return (
      <Layout title="Clan Details" fixedHeight>
        <div className="flex flex-col h-full gap-4 max-md:gap-3 max-w-6xl mx-auto w-full min-h-0">
          <div className="flex items-center justify-between shrink-0">
            <Button variant="outline" onClick={() => {
                if (detailView === 'held') {
                  setDetailView('overview');
                } else if (mobileView === 'chat') {
                  setMobileView('info');
                } else {
                  setSelectedClanId(null);
                }
              }} className="md:hidden font-bold bg-card border-2 max-md:border border-card-border hover:bg-secondary/80 rounded-xl max-md:rounded-lg px-3 h-10 max-md:h-9 max-md:text-sm transition-transform active:scale-95">
              <ArrowLeft className="w-4 h-4 max-md:w-3.5 max-md:h-3.5 mr-1" /> {detailView === 'held' ? 'Back' : mobileView === 'chat' ? 'Info' : 'All Clans'}
            </Button>
            <Button variant="outline" onClick={() => { setSelectedClanId(null); setDetailView('overview'); }} className="max-md:hidden font-bold bg-card border-2 border-card-border hover:bg-secondary/80 rounded-xl px-4 h-10 transition-transform hover:scale-105 active:scale-95">
              <ArrowLeft className="w-4 h-4 mr-2" /> All Clans
            </Button>
            <div className="flex gap-2">
              {isMemberOrOwner && detailView !== 'held' && (
                <Button onClick={() => setMobileView('chat')} className={`md:hidden font-bold rounded-lg h-9 px-3 text-sm transition-transform active:scale-95 bg-primary text-white ${mobileView === 'chat' ? 'hidden' : ''}`}>
                  Clan Chat
                </Button>
              )}
              {clanDetail && (
                <Button variant="outline" onClick={() => setDetailView(detailView === 'held' ? 'overview' : 'held')} className="font-bold bg-card border-2 max-md:border border-card-border hover:bg-secondary/80 rounded-xl max-md:rounded-lg h-10 max-md:h-9 px-4 max-md:px-3 transition-transform hover:scale-105 active:scale-95" data-testid="button-toggle-held">
                  <FaBriefcase className="w-4 h-4 mr-2 max-md:mr-0 max-md:w-3.5 max-md:h-3.5" style={{ color: clanDetail.color ?? undefined }} />
                  <span className="max-md:hidden">{detailView === 'held' ? 'Overview' : 'Held Blooks'}</span>
                </Button>
              )}
              {isOwner && (
                <Button variant="outline" onClick={() => {
                  setDescText(clanDetail?.description ?? "");
                  setDescOpen(true);
                }} className="font-bold bg-card border-2 max-md:border border-card-border hover:bg-secondary/80 rounded-xl max-md:rounded-lg h-10 max-md:h-9 px-4 max-md:px-3 transition-transform hover:scale-105 active:scale-95">
                  <Pencil className="w-4 h-4 mr-2 max-md:mr-0 max-md:w-3.5 max-md:h-3.5" />
                  <span className="max-md:hidden">Edit Desc</span>
                </Button>
              )}
              {isMemberOrOwner && (
                <Button variant="destructive" onClick={() => {
                  // Owner with other members must transfer ownership first.
                  if (isOwner && (clanDetail?.members?.length ?? 0) > 1) {
                    setLeaveAfterTransfer(true);
                    setTransferPickerOpen(true);
                  } else {
                    setLeaveConfirmOpen(true);
                  }
                }} className="font-bold rounded-xl max-md:rounded-lg h-10 max-md:h-9 px-4 max-md:px-3 transition-transform hover:scale-105 active:scale-95">
                  <LogOut className="w-4 h-4 mr-2 max-md:mr-0 max-md:w-3.5 max-md:h-3.5" /> 
                  <span className="max-md:hidden">Leave Clan</span>
                </Button>
              )}
            </div>
          </div>

          {detailLoading && !clanDetail ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-10 h-10 max-md:w-8 max-md:h-8 animate-spin text-primary" />
            </div>
          ) : !clanDetail ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground font-bold">Clan not found.</div>
          ) : detailView === 'held' ? (
            <ClanHeldVault clanDetail={clanDetail} isMemberOrOwner={isMemberOrOwner} />
          ) : (
            <div className="flex flex-col md:flex-row gap-6 max-md:gap-3 min-h-0 flex-1">
              {/* Left Column: Info & Members */}
              <div className={`flex flex-col gap-6 max-md:gap-3 w-full md:w-[340px] lg:w-[400px] min-h-0 shrink-0 ${mobileView === 'chat' ? 'max-md:hidden' : ''}`}>
                <Card className="flex flex-col shadow-lg border-2 border-card-border overflow-hidden shrink-0 max-md:rounded-xl bg-card relative">
                  <div className="h-1.5 shrink-0" style={{ backgroundColor: clanDetail.color }} />

                  <div className="p-5 max-md:p-4 flex flex-col gap-3 relative z-10">
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <h2 className={`text-3xl max-md:text-2xl font-black font-display uppercase tracking-wide truncate ${clanDetail.rainbow ? 'text-rainbow' : ''}`} style={clanDetail.rainbow ? undefined : { color: clanDetail.color, textShadow: `0 2px 10px ${clanDetail.color}40` }}>{clanDetail.name}</h2>
                          {isOwner && (
                            <button
                              className="shrink-0 text-muted-foreground hover:text-white transition-colors"
                              title="Rename clan"
                              onClick={() => { setRenameText(clanDetail.name); setRenameOpen(true); }}
                              data-testid="button-rename-clan"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          <span className="shrink-0 bg-primary/20 border border-primary/40 text-primary px-2 py-0.5 rounded-full font-black text-xs uppercase tracking-wider" title={`${clanDetail.experience} XP`}>Lv {clanDetail.level}</span>
                        </div>
                        {isOwner && (
                          <div className="shrink-0">
                            <input type="file" id="change-banner-upload" className="hidden" accept="image/*" onChange={handleBannerSelect} />
                            <Button size="sm" variant="secondary" onClick={() => document.getElementById('change-banner-upload')?.click()} disabled={isUpdateUploading || setClanImageMutation.isPending} className="font-bold border border-white/10 bg-black/40 hover:bg-black/60 text-white hover:text-white">
                              {(isUpdateUploading || setClanImageMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4 mr-2 max-md:mr-0" />}
                              <span className="max-md:hidden uppercase tracking-wider text-[10px]">{isUpdateUploading ? 'Uploading...' : 'Change Banner'}</span>
                            </Button>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        <span className="flex items-center gap-1.5 text-white"><Users className="w-3.5 h-3.5" /> {clanDetail.members.length}/25</span>
                        <span className="text-white/20">•</span>
                        <span className="truncate">Owner: <span className="text-white/80">{clanDetail.ownerUsername}</span></span>
                      </div>
                      {clanDetail.description && (
                        <p className="mt-2 text-sm max-md:text-xs font-medium text-white/70 break-words">{clanDetail.description}</p>
                      )}
                    </div>

                    {isMemberOrOwner && ((me?.clanBoosts ?? 0) > 0 || (isOwner && (me?.rainbowPerks ?? 0) > 0 && !clanDetail.rainbow) || clanDetail.rainbowMine) && (
                      <div className="mt-2 pt-4 border-t-2 border-card-border flex flex-col gap-2">
                        {(me?.clanBoosts ?? 0) > 0 && (
                          <Button onClick={() => handleBoost(clanDetail.id)} disabled={boostMutation.isPending} className="w-full h-11 font-black text-sm uppercase tracking-wider rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-amber-950 border-2 border-amber-600 shadow-[0_4px_0_rgb(180,83,9)] active:translate-y-1 active:shadow-none transition-all">
                            {boostMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Boost Clan +10 Levels ({me?.clanBoosts} left)</>}
                          </Button>
                        )}
                        {isOwner && (me?.rainbowPerks ?? 0) > 0 && !clanDetail.rainbow && (
                          <Button onClick={() => handleRainbow(clanDetail.id, true)} disabled={rainbowMutation.isPending} variant="outline" className="w-full h-11 font-black text-sm uppercase tracking-wider rounded-xl border-2 border-card-border hover:bg-secondary">
                            {rainbowMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <span className="text-rainbow">Apply Rainbow Name ({me?.rainbowPerks} left)</span>}
                          </Button>
                        )}
                        {clanDetail.rainbowMine && (
                          <Button onClick={() => handleRainbow(clanDetail.id, false)} disabled={rainbowMutation.isPending} variant="outline" className="w-full h-11 font-black text-sm uppercase tracking-wider rounded-xl border-2 border-purple-400/40 text-purple-300 hover:bg-purple-500/10">
                            {rainbowMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Remove Rainbow Name</>}
                          </Button>
                        )}
                      </div>
                    )}

                    {!isMemberOrOwner && (
                      <div className="mt-2 pt-4 border-t-2 border-card-border">
                        {clanDetail.myStatus === 'accepted' ? (
                          <Button onClick={() => handleJoin(clanDetail.id)} disabled={joinMutation.isPending || clanDetail.members.length >= 25} className="w-full h-12 font-black text-lg bg-green-500 hover:bg-green-400 text-green-950 rounded-xl border-2 border-green-600 shadow-[0_4px_0_rgb(21,128,61)] active:translate-y-1 active:shadow-none transition-all">
                            {clanDetail.members.length >= 25 ? 'Clan Full' : 'Join Clan'}
                          </Button>
                        ) : clanDetail.myStatus === 'pending' ? (
                          <Button disabled variant="outline" className="w-full h-12 font-black text-lg rounded-xl opacity-50 border-2 bg-black/20 text-muted-foreground">Applied</Button>
                        ) : (
                          <Button onClick={() => handleApply(clanDetail.id)} disabled={isInClan || applyMutation.isPending || clanDetail.members.length >= 25} className={`w-full h-12 font-black text-lg rounded-xl uppercase tracking-wider transition-all border-2 ${clanDetail.members.length >= 25 || isInClan ? 'bg-secondary opacity-50 border-card-border text-muted-foreground shadow-none' : 'bg-primary hover:bg-primary/90 text-white border-primary shadow-[0_4px_0_rgba(var(--primary),0.5)] active:translate-y-1 active:shadow-none'}`}>
                            {clanDetail.members.length >= 25 ? 'Clan Full' : 'Apply to Clan'}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </Card>

                <Card className="flex flex-col overflow-hidden shadow-lg border-2 max-md:border border-card-border min-h-0 flex-1 max-md:rounded-xl">
                  <div className="p-2.5 border-b border-card-border bg-black/20 shrink-0 flex items-center justify-between">
                    <span className="font-black text-[10px] uppercase tracking-widest text-white flex items-center gap-1.5"><Users className="w-3 h-3" /> Roster</span>
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-1">{clanDetail.members.length} / 25</span>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto p-1.5 custom-scrollbar">
                      <div className="grid grid-cols-2 max-md:grid-cols-1 gap-1">
                        {clanDetail.members.map((m: any) => (
                          <div key={m.username} className="flex items-center gap-1.5 p-1 rounded-md hover:bg-white/5 transition-colors min-w-0 border border-transparent hover:border-white/5">
                            <div className="w-5 h-5 rounded overflow-hidden bg-secondary border border-card-border shrink-0">
                              {m.avatarImage ? (
                                <img src={m.avatarImage} className="w-full h-full object-contain" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center font-black text-[9px] bg-black/20">{m.username[0].toUpperCase()}</div>
                              )}
                            </div>
                            <span className="font-bold text-[11px] truncate min-w-0 flex-1" style={{ color: m.role === 'owner' ? clanDetail.color : '#fff' }} title={m.role === 'owner' ? `${m.username} (owner)` : m.username}>{m.username}</span>
                            {isOwner && m.role !== 'owner' && (
                              <button
                                onClick={() => { setLeaveAfterTransfer(false); setTransferTarget(m.username); }}
                                className="shrink-0 w-4 h-4 rounded flex items-center justify-center text-amber-400/60 hover:text-white hover:bg-amber-500 transition-colors"
                                title={`Make ${m.username} the owner`}
                              >
                                <Crown className="w-2.5 h-2.5" />
                              </button>
                            )}
                            {isOwner && m.role !== 'owner' && (
                              <button
                                onClick={() => setKickTarget(m.username)}
                                className="shrink-0 w-4 h-4 rounded flex items-center justify-center text-red-500/60 hover:text-white hover:bg-red-500 transition-colors"
                                title={`Kick ${m.username}`}
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                  </div>
                </Card>

                {isOwner && clanDetail.pendingApplications && clanDetail.pendingApplications.length > 0 && (
                  <Card className="flex flex-col overflow-hidden shadow-lg border-2 max-md:border border-primary/40 shrink-0 max-h-[35vh] max-md:max-h-[30vh] max-md:rounded-xl">
                    <div className="p-3 max-md:p-2 border-b border-card-border bg-primary/10 shrink-0 flex items-center gap-2">
                      <Settings className="w-4 h-4 max-md:w-3.5 max-md:h-3.5 text-primary" />
                      <span className="font-black font-display text-primary text-sm max-md:text-xs uppercase tracking-wider">Pending Apps</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                      <div className="flex flex-col gap-2 max-md:gap-1.5">
                        {clanDetail.pendingApplications.map((app: any) => (
                          <div key={app.username} className="flex items-center justify-between p-2.5 max-md:p-2 rounded-xl max-md:rounded-lg bg-secondary/50 border max-md:border-none border-card-border hover:border-white/10 transition-colors">
                            <div className="flex items-center gap-3 max-md:gap-2 min-w-0">
                              <div className="w-8 h-8 max-md:w-7 max-md:h-7 rounded-lg overflow-hidden bg-secondary shrink-0 border border-white/5">
                                {app.avatarImage ? <img src={app.avatarImage} className="w-full h-full object-contain" /> : <div className="w-full h-full flex items-center justify-center font-bold text-sm max-md:text-xs bg-black/20">{app.username[0].toUpperCase()}</div>}
                              </div>
                              <span className="font-bold text-sm max-md:text-xs truncate text-white">{app.username}</span>
                            </div>
                            <div className="flex gap-1 shrink-0 ml-2">
                              <Button size="icon" variant="ghost" className="w-8 h-8 max-md:w-7 max-md:h-7 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500 hover:text-white transition-all hover:scale-110 active:scale-95" onClick={() => handleDecide(app.username, 'accept')} disabled={decideMutation.isPending}>
                                <Check className="w-4 h-4 max-md:w-3.5 max-md:h-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="w-8 h-8 max-md:w-7 max-md:h-7 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white transition-all hover:scale-110 active:scale-95" onClick={() => handleDecide(app.username, 'reject')} disabled={decideMutation.isPending}>
                                <X className="w-4 h-4 max-md:w-3.5 max-md:h-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Card>
                )}
              </div>

              {/* Right Column: Chat */}
              <div className={`flex-1 min-h-0 min-w-0 max-md:h-full ${mobileView === 'info' ? 'max-md:hidden' : ''}`}>
                {isMemberOrOwner ? (
                  <ClanChat clanColor={clanDetail.color} />
                ) : (
                  <Card className="h-full flex flex-col items-center justify-center border-2 max-md:border shadow-xl border-card-border bg-black/20 max-md:rounded-xl">
                    <MessageSquare className="w-16 h-16 max-md:w-12 max-md:h-12 opacity-10 mb-4 max-md:mb-3" />
                    <span className="text-white/50 font-black font-display text-xl max-md:text-lg uppercase tracking-widest text-center px-4">Members Only</span>
                    <span className="text-muted-foreground font-medium text-sm max-md:text-xs mt-2 max-md:mt-1 text-center px-4">Join the clan to view the chat.</span>
                  </Card>
                )}
              </div>
            </div>
          )}
        </div>

        <Dialog open={!!kickTarget} onOpenChange={(open) => { if (!open) setKickTarget(null); }}>
          <DialogContent className="max-md:w-[90%] max-md:rounded-2xl">
            <DialogHeader>
              <DialogTitle>Kick {kickTarget}?</DialogTitle>
              <DialogDescription>
                <strong className="text-white">{kickTarget}</strong> will be removed from the clan and will have to apply again to rejoin.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 mt-4">
              <Button variant="outline" onClick={() => setKickTarget(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleKick} disabled={kickMutation.isPending}>Kick</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={transferPickerOpen} onOpenChange={(open) => { setTransferPickerOpen(open); if (!open) setLeaveAfterTransfer(false); }}>
          <DialogContent className="max-md:w-[90%] max-md:rounded-2xl">
            <DialogHeader>
              <DialogTitle>{leaveAfterTransfer ? "Pick the new owner before you leave" : "Transfer ownership"}</DialogTitle>
              <DialogDescription>
                {leaveAfterTransfer
                  ? "As the owner, you need to hand the clan to another member before leaving."
                  : "Choose the member who will become the new clan owner."}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto custom-scrollbar mt-2">
              {clanDetail?.members?.filter((m: any) => m.role !== 'owner').map((m: any) => (
                <button
                  key={m.username}
                  onClick={() => setTransferTarget(m.username)}
                  className="flex items-center gap-3 p-2 rounded-lg bg-secondary/50 hover:bg-secondary border border-card-border text-left transition-colors"
                >
                  <div className="w-8 h-8 rounded-md overflow-hidden bg-secondary border border-card-border shrink-0">
                    {m.avatarImage ? (
                      <img src={m.avatarImage} className="w-full h-full object-contain" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-black text-xs bg-black/20">{m.username[0].toUpperCase()}</div>
                    )}
                  </div>
                  <span className="font-bold text-sm text-white truncate flex-1">{m.username}</span>
                  <Crown className="w-4 h-4 text-amber-400 shrink-0" />
                </button>
              ))}
            </div>
            <DialogFooter className="gap-2 mt-4">
              <Button variant="outline" onClick={() => { setTransferPickerOpen(false); setLeaveAfterTransfer(false); }}>Cancel</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!transferTarget} onOpenChange={(open) => { if (!open) setTransferTarget(null); }}>
          <DialogContent className="max-md:w-[90%] max-md:rounded-2xl">
            <DialogHeader>
              <DialogTitle>Make {transferTarget} the owner?</DialogTitle>
              <DialogDescription>
                <strong className="text-white">{transferTarget}</strong> will become the clan owner{leaveAfterTransfer ? " and you will leave the clan" : " and you will become a regular member"}. This can only be undone by the new owner.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 mt-4">
              <Button variant="outline" onClick={() => setTransferTarget(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleTransfer} disabled={transferMutation.isPending || leaveMutation.isPending}>
                {(transferMutation.isPending || leaveMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : (leaveAfterTransfer ? "Transfer & Leave" : "Transfer")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={descOpen} onOpenChange={setDescOpen}>
          <DialogContent className="max-md:w-[90%] max-md:rounded-2xl">
            <DialogHeader>
              <DialogTitle>Edit Clan Description</DialogTitle>
              <DialogDescription>
                Tell players what your clan is about. Shown on your clan's card. Max 100 characters.
              </DialogDescription>
            </DialogHeader>
            <Textarea
              value={descText}
              onChange={(e) => setDescText(e.target.value.slice(0, 100))}
              placeholder="Describe your clan..."
              maxLength={100}
              rows={3}
              className="border-2 border-card-border bg-secondary/50 rounded-xl font-medium resize-none"
            />
            <p className="text-xs text-muted-foreground font-bold text-right">{descText.length}/100</p>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDescOpen(false)}>Cancel</Button>
              <Button onClick={() => {
                setDescriptionMutation.mutate({ clanId: clanDetail!.id, data: { description: descText.trim() } }, {
                  onSuccess: () => {
                    setDescOpen(false);
                    toast({ title: "Description updated!" });
                    queryClient.invalidateQueries({ queryKey: getGetClanQueryKey(clanDetail!.id) });
                    queryClient.invalidateQueries({ queryKey: getGetClansQueryKey() });
                  },
                  onError: (err) => {
                    toast({ title: "Couldn't update description", description: (err as any)?.data?.message || "Try again later.", variant: "destructive" });
                  }
                });
              }} disabled={setDescriptionMutation.isPending} className="font-bold">
                {setDescriptionMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
          <DialogContent className="max-md:w-[90%] max-md:rounded-2xl">
            <DialogHeader>
              <DialogTitle>Rename Clan</DialogTitle>
              <DialogDescription>
                Pick a new name for your clan. Max 20 characters.
              </DialogDescription>
            </DialogHeader>
            <Input
              value={renameText}
              onChange={(e) => setRenameText(e.target.value.slice(0, 20))}
              placeholder="Clan name..."
              maxLength={20}
              className="border-2 border-card-border bg-secondary/50 rounded-xl font-bold"
              data-testid="input-rename-clan"
            />
            <p className="text-xs text-muted-foreground font-bold text-right">{renameText.length}/20</p>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setRenameOpen(false)}>Cancel</Button>
              <Button onClick={() => {
                renameClanMutation.mutate({ clanId: clanDetail!.id, data: { name: renameText.trim() } }, {
                  onSuccess: () => {
                    setRenameOpen(false);
                    toast({ title: "Clan renamed!" });
                    queryClient.invalidateQueries({ queryKey: getGetClanQueryKey(clanDetail!.id) });
                    queryClient.invalidateQueries({ queryKey: getGetClansQueryKey() });
                  },
                  onError: (err) => {
                    toast({ title: "Couldn't rename clan", description: (err as any)?.data?.message || "Try again later.", variant: "destructive" });
                  }
                });
              }} disabled={renameClanMutation.isPending || renameText.trim().length === 0} className="font-bold" data-testid="button-save-rename-clan">
                {renameClanMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={leaveConfirmOpen} onOpenChange={setLeaveConfirmOpen}>
          <DialogContent className="max-md:w-[90%] max-md:rounded-2xl">
            <DialogHeader>
              <DialogTitle>Leave Clan?</DialogTitle>
              <DialogDescription>
                Are you sure you want to leave <strong className="text-white">{clanDetail?.name}</strong>?
                {isOwner && <span className="block mt-2 text-red-400 font-bold">You are the only member. Leaving will disband and delete the clan permanently!</span>}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 mt-4">
              <Button variant="outline" onClick={() => setLeaveConfirmOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleLeave} disabled={leaveMutation.isPending}>Confirm Leave</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Layout>
    );
  }

  return (
    <Layout title="Clans">
      <div className="flex flex-col gap-6 max-md:gap-4 h-full min-h-0 max-w-6xl mx-auto w-full">
        <div className="flex items-center justify-between shrink-0 max-md:flex-col max-md:items-start max-md:gap-3">
          <div>
            <h1 className="text-4xl max-md:text-3xl font-black font-display tracking-tight text-white mb-2 max-md:mb-1">Clans</h1>
            <p className="text-lg max-md:text-sm text-muted-foreground font-medium">Join a clan to chat, trade, and dominate together.</p>
          </div>
          {!isInClan && (
            <Button onClick={() => setCreateOpen(true)} className="font-black h-12 max-md:h-10 px-6 max-md:px-5 text-lg max-md:text-base bg-primary hover:bg-primary/90 text-primary-foreground max-md:w-full shadow-[0_0_20px_rgba(var(--primary),0.3)] hover:scale-105 transition-transform rounded-xl max-md:rounded-lg">
              <Plus className="w-5 h-5 max-md:w-4 max-md:h-4 mr-2 max-md:mr-1" /> Create Clan
            </Button>
          )}
        </div>

        {myMembership?.inClan && myMembership.banned && (
          <div className="shrink-0 bg-red-500/10 border-2 border-red-500/40 rounded-2xl max-md:rounded-xl p-4 flex items-center justify-between gap-4 max-md:flex-col max-md:items-start" data-testid="banner-banned-clan">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-black text-white">
                  Your clan{myMembership.clanName ? ` "${myMembership.clanName}"` : ""} was banned
                </div>
                <div className="text-sm font-semibold text-muted-foreground">
                  It's hidden from the clans list. Leave it to join or create another clan.
                </div>
              </div>
            </div>
            <Button
              variant="destructive"
              className="font-black shrink-0 max-md:w-full"
              onClick={handleBannedLeave}
              disabled={leaveMutation.isPending}
              data-testid="button-leave-banned-clan"
            >
              {leaveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <LogOut className="w-4 h-4 mr-2" />}
              Leave Clan
            </Button>
          </div>
        )}

        <div className="relative shrink-0">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
          <Input
            value={directorySearch}
            onChange={(event) => setDirectorySearch(event.target.value)}
            placeholder="Search clans or owners..."
            aria-label="Search clans by name or owner"
            className="h-12 pl-12 pr-4 bg-card border-2 border-card-border rounded-xl font-bold text-base shadow-inner focus-visible:ring-primary"
          />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pb-8 max-md:pb-4">
          {clansLoading && !clans ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-10 h-10 max-md:w-8 max-md:h-8 animate-spin text-primary" />
            </div>
          ) : clans?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 max-md:py-16 text-center bg-card border-2 max-md:border border-card-border rounded-3xl max-md:rounded-2xl shadow-xl max-w-2xl mx-auto w-full">
              <div className="w-24 h-24 max-md:w-16 max-md:h-16 bg-secondary rounded-3xl max-md:rounded-2xl flex items-center justify-center mb-6 max-md:mb-4 border-2 max-md:border border-card-border shadow-inner rotate-3">
                <Users className="w-12 h-12 max-md:w-8 max-md:h-8 text-muted-foreground opacity-50" />
              </div>
              <h2 className="text-3xl max-md:text-2xl font-black font-display text-white mb-3 max-md:mb-2">No Clans Yet</h2>
              <p className="text-lg max-md:text-sm text-muted-foreground font-medium mb-8 max-md:mb-6 max-w-sm max-md:px-4">Gather your friends, pool your tokens, and dominate the leaderboard together.</p>
              {!isInClan && (
                <Button onClick={() => setCreateOpen(true)} className="font-black h-12 max-md:h-10 px-8 max-md:px-6 text-lg max-md:text-base bg-primary hover:bg-primary/90 text-white shadow-[0_0_20px_rgba(var(--primary),0.3)] hover:scale-105 transition-transform rounded-xl max-md:rounded-lg">
                  Create First Clan
                </Button>
              )}
            </div>
          ) : visibleClans.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 max-md:py-14 text-center bg-card border-2 border-card-border rounded-3xl max-md:rounded-2xl shadow-xl">
              <Search className="w-12 h-12 max-md:w-10 max-md:h-10 text-muted-foreground opacity-40 mb-4" />
              <h2 className="text-2xl max-md:text-xl font-black font-display text-white">No Clans Found</h2>
              <p className="mt-2 text-sm text-muted-foreground font-medium">Try another clan name or owner.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 max-md:gap-4">
              {visibleClans.map(clan => (
                <Card 
                  key={clan.id} 
                  onClick={() => handleView(clan.id)}
                  className="p-0 flex flex-col transition-all hover:scale-[1.02] active:scale-[0.98] border-2 max-md:border-2 border-card-border shadow-xl relative overflow-hidden group cursor-pointer max-md:rounded-xl bg-card"
                >
                  <div className="h-32 w-full relative bg-secondary border-b-2 border-card-border overflow-hidden shrink-0">
                    {clan.imageUrl ? (
                      <img src={resolveImageUrl(clan.imageUrl)} className="w-full h-full object-cover" />
                    ) : (
                      <div className="absolute inset-0" style={{ backgroundColor: clan.color }} />
                    )}
                    <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md border border-white/10 px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-lg">
                      <Users className="w-3.5 h-3.5 text-white/80" />
                      <span className="font-black text-xs text-white uppercase tracking-wider">{clan.memberCount}/25</span>
                    </div>
                  </div>

                  <div className="p-4 flex flex-col relative flex-1">
                    <div className="min-h-[56px] flex flex-col justify-center">
                      <div className="flex items-center gap-2 min-w-0">
                        <h3 className={`font-black font-display text-xl uppercase tracking-wide truncate ${clan.rainbow ? 'text-rainbow' : ''}`} style={clan.rainbow ? undefined : { color: clan.color, textShadow: `0 2px 8px ${clan.color}30` }}>{clan.name}</h3>
                        <span className="shrink-0 bg-primary/20 border border-primary/40 text-primary px-1.5 py-0.5 rounded-full font-black text-[10px] uppercase tracking-wider">Lv {clan.level}</span>
                      </div>
                      <p className="text-muted-foreground font-bold text-xs truncate flex items-center gap-1 uppercase tracking-widest mt-0.5">
                        Owner: <span className="text-white/80">{clan.ownerUsername}</span>
                      </p>
                    </div>
                    {clan.description && (
                      <p className="mt-1.5 text-xs font-medium text-white/60 break-words line-clamp-2">{clan.description}</p>
                    )}

                    <div className="mt-auto pt-4 shrink-0" onClick={e => e.stopPropagation()}>
                      {clan.myStatus === 'owner' || clan.myStatus === 'member' ? (
                        <Button disabled variant="secondary" className="w-full font-black text-sm h-10 rounded-xl uppercase tracking-widest border-2 border-transparent bg-primary/20 text-primary">Your Clan</Button>
                      ) : clan.myStatus === 'accepted' ? (
                        <Button onClick={() => handleJoin(clan.id)} disabled={joinMutation.isPending || clan.memberCount >= 25} className="w-full font-black text-sm h-10 rounded-xl uppercase tracking-widest bg-green-500 hover:bg-green-400 text-green-950 shadow-[0_4px_0_rgb(21,128,61)] active:translate-y-1 active:shadow-none transition-all border-2 border-green-600">
                          {clan.memberCount >= 25 ? 'Clan Full' : 'Join'}
                        </Button>
                      ) : clan.myStatus === 'pending' ? (
                        <Button disabled variant="outline" className="w-full font-black text-sm h-10 rounded-xl uppercase tracking-widest opacity-50 border-2 border-white/10 bg-black/20">Applied</Button>
                      ) : (
                        <Button onClick={() => handleApply(clan.id)} disabled={isInClan || applyMutation.isPending || clan.memberCount >= 25} className={`w-full font-black text-sm h-10 rounded-xl uppercase tracking-widest transition-all border-2 ${clan.memberCount >= 25 || isInClan ? 'bg-secondary opacity-50 border-card-border text-muted-foreground shadow-none' : 'bg-primary hover:bg-primary/90 text-white border-primary shadow-[0_4px_0_rgba(var(--primary),0.5)] active:translate-y-1 active:shadow-none'}`}>
                          {clan.memberCount >= 25 ? 'Clan Full' : 'Apply'}
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <Dialog open={createOpen} onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            setCreateName("");
            setCreateColor("#8b5cf6");
            setCreateImage(null);
            setImagePreview(null);
          }
        }}>
          <DialogContent className="sm:max-w-md max-md:w-[90%] max-md:rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-2xl max-md:text-xl font-black font-display uppercase tracking-wide">Create Clan</DialogTitle>
              <DialogDescription className="max-md:text-sm">
                Form a new clan and invite others to join.
              </DialogDescription>
            </DialogHeader>
            
            <form onSubmit={handleCreate} className="flex flex-col gap-5 max-md:gap-4 py-2">
              <div className="flex flex-col gap-2 max-md:gap-1.5">
                <label className="font-black text-sm max-md:text-xs uppercase tracking-widest text-muted-foreground">Clan Name</label>
                <Input 
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Clan name"
                  className="font-bold h-14 max-md:h-12 bg-secondary rounded-xl max-md:rounded-lg border-2 max-md:border border-card-border px-4 max-md:px-3 focus-visible:ring-primary shadow-inner text-lg max-md:text-base"
                  maxLength={20}
                  required
                />
              </div>

              <div className="flex flex-col gap-2 max-md:gap-1.5">
                <label className="font-black text-sm max-md:text-xs uppercase tracking-widest text-muted-foreground">Clan Banner (Optional)</label>
                <div 
                  onClick={() => document.getElementById('create-banner-upload')?.click()}
                  className="h-32 max-md:h-24 border-2 border-dashed border-card-border rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 transition-colors relative overflow-hidden bg-secondary/50"
                >
                  {imagePreview ? (
                    <img src={imagePreview} className="w-full h-full object-cover" />
                  ) : (
                    <>
                      <UploadCloud className="w-8 h-8 text-muted-foreground mb-2 max-md:mb-1 max-md:w-6 max-md:h-6" />
                      <span className="text-sm max-md:text-xs font-bold text-muted-foreground">Click to upload image</span>
                    </>
                  )}
                </div>
                <input 
                  id="create-banner-upload"
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  onChange={handleImageSelect} 
                />
              </div>

              <div className="flex flex-col gap-2 max-md:gap-1.5">
                <label className="font-black text-sm max-md:text-xs uppercase tracking-widest text-muted-foreground">Clan Color</label>
                <div className="flex items-center gap-4 max-md:gap-3">
                  <div className="w-14 h-14 max-md:w-12 max-md:h-12 rounded-2xl max-md:rounded-xl overflow-hidden shrink-0 border-2 max-md:border border-card-border shadow-inner">
                    <input 
                      type="color" 
                      value={createColor}
                      onChange={(e) => setCreateColor(e.target.value)}
                      className="w-full h-full p-0 border-0 outline-none cursor-pointer"
                    />
                  </div>
                  <div className="flex gap-2 max-md:gap-1.5 flex-wrap">
                    {['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'].map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCreateColor(c)}
                        className={`w-10 h-10 max-md:w-8 max-md:h-8 rounded-full border-2 max-md:border transition-transform hover:scale-110 active:scale-95 ${createColor === c ? 'border-white scale-110 shadow-[0_0_15px_rgba(255,255,255,0.4)]' : 'border-transparent shadow-md'}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <Button type="submit" disabled={!createName.trim() || createMutation.isPending || isCreateUploading} className="w-full h-14 max-md:h-12 font-black text-xl max-md:text-lg bg-primary hover:bg-primary/90 mt-2 max-md:mt-1 text-white shadow-[0_0_20px_rgba(var(--primary),0.3)] hover:scale-[1.02] active:scale-[0.98] transition-transform rounded-xl max-md:rounded-lg">
                {(createMutation.isPending || isCreateUploading) ? <Loader2 className="w-6 h-6 max-md:w-5 max-md:h-5 animate-spin" /> : "Create"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

      </div>
    </Layout>
  );
}
