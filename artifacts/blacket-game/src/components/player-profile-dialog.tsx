import { useState, useEffect } from "react";
import { BadgeList } from "@/components/badge-list";
import { TokenIcon } from "@/components/token-icon";
import { blookImageAnimation } from "@/lib/rarity";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatNumber, nameEffectClass, nameEffectStyle } from "@/lib/utils";
import {
  Loader2, Trophy, PackageOpen, LayoutDashboard, ArrowRightLeft, Gift, ArrowLeft,
  UserPlus, Check, Clock, BarChart2,
} from "lucide-react";
import { GiMining } from "react-icons/gi";
import {
  useGetMe, useGetMyBlooks, useGetPlayerProfile, useSendTradeRequest, useSendGift, useSendFriendRequest, useGetRarities,
  getGetPlayerProfileQueryKey, getGetTradeRequestsQueryKey, getGetMeQueryKey, getGetMyBlooksQueryKey, getGetFriendsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

/**
 * Shared player profile dialog: stats card + Trade / Gift split buttons,
 * Add-friend button, and an in-dialog gift composer (with a Back button).
 * Used by the Stats page, Chat, and the Friends tab.
 */
export function PlayerProfileDialog({
  username,
  onClose,
}: {
  username: string | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { data: me } = useGetMe();
  const { data: myBlooks } = useGetMyBlooks();
  const { data: rarities } = useGetRarities();
  const rarityColor = (rarity: string) => {
    const c = rarities?.find((r) => r.name === rarity)?.color;
    return !c || c.toLowerCase() === "#ffffff" ? "#60a5fa" : c;
  };

  const [mode, setMode] = useState<"profile" | "gift">("profile");
  const [giftTokens, setGiftTokens] = useState("");
  const [giftBlooks, setGiftBlooks] = useState<Map<string, number>>(new Map());

  // Reset the composer whenever the dialog target changes / closes.
  useEffect(() => {
    setMode("profile");
    setGiftTokens("");
    setGiftBlooks(new Map());
  }, [username]);

  // If inventory refreshes while picking (e.g. a trade or sale elsewhere),
  // clamp selections so you can never offer more than you currently own.
  useEffect(() => {
    if (!myBlooks) return;
    setGiftBlooks((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [name, qty] of prev) {
        const owned = myBlooks.find((b) => b.name === name)?.quantity ?? 0;
        if (owned <= 0) { next.delete(name); changed = true; }
        else if (qty > owned) { next.set(name, owned); changed = true; }
      }
      return changed ? next : prev;
    });
  }, [myBlooks]);

  const { data: profile, isLoading, isError } = useGetPlayerProfile(username || "", {
    query: { enabled: !!username, queryKey: getGetPlayerProfileQueryKey(username || "") },
  });

  const sendRequestMutation = useSendTradeRequest();
  const sendGiftMutation = useSendGift();
  const friendRequestMutation = useSendFriendRequest();

  const handleTradeRequest = () => {
    if (!profile) return;
    sendRequestMutation.mutate({ data: { username: profile.username } }, {
      onSuccess: (request) => {
        queryClient.invalidateQueries({ queryKey: getGetTradeRequestsQueryKey() });
        onClose();
        if (request.status === "accepted") {
          toast({ title: "Trade Started!", description: `${profile.username} accepted your trade.` });
          setLocation("/trade");
        } else {
          toast({ title: "Request Sent!", description: `Waiting for ${profile.username} to accept.` });
        }
      },
      onError: (err) => {
        toast({ title: "Failed", description: (err.data as any)?.message || "Error", variant: "destructive" });
      },
    });
  };

  const handleAddFriend = () => {
    if (!profile) return;
    friendRequestMutation.mutate({ data: { username: profile.username } }, {
      onSuccess: (res) => {
        toast({ title: res.status === "accepted" ? "Friends!" : "Request Sent!", description: res.message });
        queryClient.invalidateQueries({ queryKey: getGetPlayerProfileQueryKey(profile.username) });
        queryClient.invalidateQueries({ queryKey: getGetFriendsQueryKey() });
      },
      onError: (err) => {
        toast({ title: "Failed", description: (err.data as any)?.message || "Error", variant: "destructive" });
      },
    });
  };

  const tokensNum = /^\d+$/.test(giftTokens.trim()) ? parseInt(giftTokens.trim(), 10) : 0;
  const giftCount = [...giftBlooks.values()].reduce((a, b) => a + b, 0);
  const canSendGift = (tokensNum > 0 || giftCount > 0) && !sendGiftMutation.isPending;

  const addGiftBlook = (name: string, owned: number) => {
    setGiftBlooks((prev) => {
      const next = new Map(prev);
      const cur = next.get(name) ?? 0;
      if (cur < owned) next.set(name, cur + 1);
      return next;
    });
  };
  const removeGiftBlook = (name: string) => {
    setGiftBlooks((prev) => {
      const next = new Map(prev);
      const cur = next.get(name) ?? 0;
      if (cur <= 1) next.delete(name);
      else next.set(name, cur - 1);
      return next;
    });
  };

  const handleSendGift = () => {
    if (!profile || !canSendGift) return;
    sendGiftMutation.mutate(
      {
        data: {
          username: profile.username,
          tokens: tokensNum,
          blooks: [...giftBlooks.entries()].map(([name, quantity]) => ({ name, quantity })),
        },
      },
      {
        onSuccess: (res) => {
          toast({ title: "Gift Sent!", description: res.message });
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetMyBlooksQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetPlayerProfileQueryKey(profile.username) });
          onClose();
        },
        onError: (err) => {
          toast({ title: "Gift Failed", description: (err.data as any)?.message || "Error", variant: "destructive" });
          // Server state may have changed under us — refresh what we own.
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetMyBlooksQueryKey() });
        },
      },
    );
  };

  const friendButton = () => {
    if (!profile || profile.friendStatus === "self") return null;
    if (profile.friendStatus === "friends") {
      return (
        <div className="w-full h-10 flex items-center justify-center gap-2 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 font-black text-sm uppercase tracking-wide">
          <Check className="w-4 h-4" /> Friends
        </div>
      );
    }
    if (profile.friendStatus === "outgoing") {
      return (
        <div className="w-full h-10 flex items-center justify-center gap-2 rounded-xl bg-secondary/60 border border-card-border text-muted-foreground font-black text-sm uppercase tracking-wide">
          <Clock className="w-4 h-4" /> Friend request sent
        </div>
      );
    }
    return (
      <Button
        variant="outline"
        className="w-full h-10 font-black font-display tracking-wide rounded-xl"
        onClick={handleAddFriend}
        disabled={friendRequestMutation.isPending}
        data-testid="button-add-friend"
      >
        {friendRequestMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UserPlus className="w-4 h-4 mr-2" />}
        {profile.friendStatus === "incoming" ? "Accept Friend Request" : "Add Friend"}
      </Button>
    );
  };

  return (
    <Dialog open={!!username} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className={mode === "gift" ? "max-w-2xl h-[85vh] flex flex-col" : "sm:max-w-md"}>
        <DialogTitle className="sr-only">Player Profile</DialogTitle>
        <DialogDescription className="sr-only">View player stats and badges</DialogDescription>

        {isLoading ? (
          <div className="flex h-64 items-center justify-center p-6">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
          </div>
        ) : isError || !profile ? (
          <div className="flex h-64 items-center justify-center flex-col gap-2 p-6">
            <span className="text-xl font-bold text-muted-foreground">Player not found.</span>
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        ) : mode === "gift" ? (
          <div className="flex flex-col gap-4 flex-1 min-h-0">
            <div className="flex items-center gap-3 shrink-0">
              <Button variant="ghost" size="sm" onClick={() => setMode("profile")} className="font-bold" data-testid="button-gift-back">
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <h2 className="text-2xl max-md:text-xl font-black font-display tracking-wide flex items-center gap-2 min-w-0">
                <Gift className="w-6 h-6 text-blue-400 shrink-0" />
                <span className="truncate">Gift {profile.username}</span>
              </h2>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-2 bg-secondary/50 border border-card-border rounded-xl px-3 h-12 flex-1">
                <TokenIcon className="w-5 h-5 text-yellow-400 shrink-0" />
                <Input
                  value={giftTokens}
                  onChange={(e) => setGiftTokens(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="Tokens to gift (optional)"
                  inputMode="numeric"
                  className="border-0 bg-transparent focus-visible:bg-transparent focus-visible:border-0 focus-visible:ring-0 px-0 font-bold"
                  data-testid="input-gift-tokens"
                />
              </div>
              <span className="text-xs font-bold text-muted-foreground whitespace-nowrap">
                You have {formatNumber(me?.tokens ?? 0)}
              </span>
            </div>
            {tokensNum > (me?.tokens ?? 0) && (
              <p className="text-xs font-bold text-red-400 -mt-2 shrink-0">You don't have that many tokens.</p>
            )}

            <div className="flex flex-col gap-2 flex-1 min-h-0">
              <span className="text-xs font-black uppercase tracking-widest text-muted-foreground shrink-0">
                Tap blooks to add them{giftCount > 0 ? ` — ${giftCount} selected (tap the count to remove)` : ""}
              </span>
              <ScrollArea className="flex-1 bg-secondary/30 border border-card-border rounded-xl p-3">
                {!myBlooks ? (
                  <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin" /></div>
                ) : myBlooks.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground font-bold">You don't own any blooks yet.</div>
                ) : (
                  <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3">
                    {myBlooks.map((blook) => {
                      const picked = giftBlooks.get(blook.name) ?? 0;
                      const left = blook.quantity - picked;
                      const color = rarityColor(blook.rarity);
                      return (
                        <div
                          key={blook.name}
                          className={`relative bg-secondary/50 border rounded-xl p-2 transition-all select-none ${
                            picked > 0 ? "" : "border-card-border"
                          } ${left > 0 ? "cursor-pointer hover:scale-105" : "opacity-60"}`}
                          style={picked > 0 ? { borderColor: color, boxShadow: `0 0 12px ${color}66` } : undefined}
                          onClick={() => left > 0 && addGiftBlook(blook.name, blook.quantity)}
                          data-testid={`gift-blook-${blook.name}`}
                        >
                          <img src={blook.image} alt={blook.name} className={`w-full aspect-square object-contain drop-shadow-md ${blookImageAnimation(blook.name)}`} />
                          <span className="absolute top-1 left-1 text-[10px] font-black bg-black/60 rounded px-1 text-white">x{blook.quantity}</span>
                          {picked > 0 && (
                            <button
                              className="absolute -top-2 -right-2 min-w-6 h-6 px-1 rounded-full text-white text-xs font-black shadow-lg"
                              style={{ backgroundColor: color }}
                              onClick={(e) => { e.stopPropagation(); removeGiftBlook(blook.name); }}
                              title="Remove one"
                            >
                              {picked}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </div>

            <Button
              className="w-full h-14 shrink-0 text-xl font-black font-display tracking-wide bg-blue-500 hover:bg-blue-400 text-white shadow-lg rounded-xl"
              disabled={!canSendGift || tokensNum > (me?.tokens ?? 0)}
              onClick={handleSendGift}
              data-testid="button-send-gift"
            >
              {sendGiftMutation.isPending ? <Loader2 className="w-6 h-6 animate-spin mr-2" /> : <Gift className="w-6 h-6 mr-2" />}
              Send Gift
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 py-1">
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 rounded-2xl bg-secondary border border-card-border shadow-xl flex items-center justify-center overflow-hidden mb-2 relative group">
                <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                {profile.avatarImage ? (
                  <img src={profile.avatarImage} alt="Avatar" className="w-full h-full object-contain" />
                ) : (
                  <span className="font-display text-4xl">{profile.username[0].toUpperCase()}</span>
                )}
              </div>

              <h2 className="text-3xl font-black font-display tracking-wide mb-1 flex items-center gap-2">
                <span className={nameEffectClass(profile.nameEffect)} style={nameEffectStyle(profile.nameEffect)}>{profile.username}</span>
                <BadgeList badges={profile.badges} size={20} smallSize={16} />
                {profile.isOnline && <div className="w-3 h-3 bg-green-500 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.8)]" title="Online" />}
              </h2>

               <p className="text-sm font-bold text-muted-foreground mb-3 uppercase tracking-widest flex items-center gap-2">
                <span>Joined {new Date(profile.joinedAt).toLocaleDateString()}</span>
                <span className="text-muted-foreground/50">·</span>
                <span className="flex items-center gap-1 text-amber-400" title="Mine rate">
                  <GiMining className="w-3.5 h-3.5" />{formatNumber(profile.minePerHour)}/hr
                </span>
              </p>

               <div className="w-full grid grid-cols-2 gap-3 mb-3">
                <div className="bg-secondary/50 rounded-xl p-2 flex flex-col items-center justify-center border border-card-border">
                  <Trophy className="w-5 h-5 text-blue-400 mb-1" />
                  <span className="text-lg font-black">{profile.level}</span>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Level</span>
                </div>
                <div className="bg-secondary/50 rounded-xl p-2 flex flex-col items-center justify-center border border-card-border">
                  <TokenIcon className="w-5 h-5 text-yellow-400 mb-1" />
                  <span className="text-lg font-black">{formatNumber(profile.tokens)}</span>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Tokens</span>
                </div>
                <div className="bg-secondary/50 rounded-xl p-2 flex flex-col items-center justify-center border border-card-border">
                  <PackageOpen className="w-5 h-5 text-green-400 mb-1" />
                  <span className="text-lg font-black">{formatNumber(profile.packsOpened)}</span>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Packs Opened</span>
                </div>
                <div className="bg-secondary/50 rounded-xl p-2 flex flex-col items-center justify-center border border-card-border">
                  <LayoutDashboard className="w-5 h-5 text-purple-400 mb-1" />
                  <span className="text-lg font-black">{formatNumber(profile.uniqueBlooks)} <span className="text-sm text-muted-foreground">/ {formatNumber(profile.totalBlookDefs)}</span></span>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Blooks</span>
                </div>
              </div>

              {me?.username !== profile.username && (
                  <div className="w-full flex flex-col gap-2">
                  <div className="w-full flex gap-3">
                    <Button
                      className="flex-1 h-12 text-lg font-black font-display tracking-wide bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-primary/30 rounded-xl"
                      onClick={handleTradeRequest}
                      disabled={sendRequestMutation.isPending}
                      data-testid="button-trade"
                    >
                      {sendRequestMutation.isPending ? <Loader2 className="w-6 h-6 animate-spin mr-2" /> : <ArrowRightLeft className="w-6 h-6 mr-2" />}
                      Trade
                    </Button>
                    <Button
                      className="flex-1 h-12 text-lg font-black font-display tracking-wide bg-blue-500 hover:bg-blue-400 text-white shadow-lg hover:shadow-blue-500/30 rounded-xl"
                      onClick={() => setMode("gift")}
                      data-testid="button-gift"
                    >
                      <Gift className="w-6 h-6 mr-2" />
                      Gift
                    </Button>
                  </div>
                  <Button
                    className="w-full h-11 text-lg font-black font-display tracking-wide rounded-xl"
                    onClick={() => {
                      setLocation(`/stats?player=${encodeURIComponent(profile.username)}`);
                      onClose();
                    }}
                    data-testid="button-view-stats"
                  >
                    <BarChart2 className="w-5 h-5 mr-2" />
                    View Stats
                  </Button>
                  {friendButton()}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
