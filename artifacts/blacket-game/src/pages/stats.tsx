import { BadgeList } from "@/components/badge-list";
import { blookImageAnimation } from "@/lib/rarity";
import { useState, useEffect } from "react";
import { TokenIcon } from "@/components/token-icon";
import { Layout } from "@/components/layout/layout";
import { 
  useGetStats, useGetMe, useGetMyBlooks, useGetPlayerProfile, useUpdateMe, useClaimTokens,
  getGetPlayerProfileQueryKey,
  getGetMeQueryKey
} from "@workspace/api-client-react";
import { formatNumber, nameEffectClass, nameEffectStyle } from "@/lib/utils";
import { Loader2, Search, Gift, Pencil } from "lucide-react";
import { GiMining } from "react-icons/gi";
import { FaBoxOpen, FaComment, FaLockOpen } from "react-icons/fa6";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { useLocation, useSearch } from "wouter";

export default function Stats() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { data: stats, isLoading: isStatsLoading } = useGetStats();
  const { data: me, isLoading: isMeLoading } = useGetMe();
  const { data: myBlooks } = useGetMyBlooks();
  
  const updateMeMutation = useUpdateMe();
  const queryClient = useQueryClient();

  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [viewStatsUsername, setViewStatsUsername] = useState("");
  // Derived from the URL so back/forward and direct links always show the right player.
  const searchedUsername = new URLSearchParams(search).get("player");
  const isViewingOther = !!searchedUsername && searchedUsername !== me?.username;
  const { data: viewedProfile, isLoading: isViewedProfileLoading } = useGetPlayerProfile(searchedUsername || "", {
    query: {
      enabled: isViewingOther,
      queryKey: getGetPlayerProfileQueryKey(searchedUsername || ""),
    },
  });

  const claimMutation = useClaimTokens();

  // Tick every second so the claim countdown stays fresh.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const claimReadyAt = me?.nextClaimAt ? new Date(me.nextClaimAt).getTime() : null;
  const canClaim = !!me && (claimReadyAt === null || claimReadyAt <= now);
  const claimCountdown = (() => {
    if (canClaim || claimReadyAt === null) return null;
    const ms = Math.max(0, claimReadyAt - now);
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    const s = Math.floor((ms % 60_000) / 1000);
    return `${h}h ${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`;
  })();

  const handleClaim = () => {
    claimMutation.mutate(undefined, {
      onSuccess: (res) => {
        if (res.claimed) {
          toast({ title: "Daily Reward!", description: `You claimed ${formatNumber(res.tokensAwarded)} tokens.` });
        } else {
          toast({ title: "Not yet", description: "Your daily tokens aren't ready yet.", variant: "destructive" });
        }
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      },
      onError: () => {
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        toast({ title: "Not yet", description: "Your daily tokens aren't ready yet.", variant: "destructive" });
      }
    });
  };

  const getLevelProgress = () => {
    if (!me) return 0;
    const currentLevelBaseXP = 100 * (me.level - 1) ** 2;
    const nextLevelXP = 100 * me.level ** 2;
    const progress = Math.min(100, Math.max(0, ((me.experience - currentLevelBaseXP) / (nextLevelXP - currentLevelBaseXP)) * 100));
    return progress;
  };

  const handleSetAvatar = (blookName: string) => {
    updateMeMutation.mutate({ data: { avatarBlook: blookName } }, {
      onSuccess: () => {
        toast({ title: "Avatar Updated", description: "Your profile picture has been changed." });
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        setIsAvatarPickerOpen(false);
      }
    });
  };

  const handleRename = (e: React.FormEvent) => {
    e.preventDefault();
    const username = newName.trim();
    if (!username || username === me?.username) return;
    updateMeMutation.mutate({ data: { username } }, {
      onSuccess: (res) => {
        toast({ title: "Name Changed", description: `You are now ${res.username}.` });
        queryClient.invalidateQueries();
        setIsRenameOpen(false);
        setNewName("");
      },
      onError: (err) => {
        toast({ title: "Failed", description: (err.data as any)?.message || "Couldn't change name", variant: "destructive" });
      }
    });
  };

  const handleSearchStats = (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewStatsUsername.trim()) return;
    const username = viewStatsUsername.trim();
    setLocation(`/stats?player=${encodeURIComponent(username)}`);
  };

  if (isStatsLoading || isMeLoading || !stats || !me || (isViewingOther && isViewedProfileLoading)) {
    return <Layout title="Stats"><div className="flex h-full items-center justify-center"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div></Layout>;
  }

  const displayedPlayer = isViewingOther ? viewedProfile : me;
  if (!displayedPlayer) {
    return <Layout title="Stats"><div className="flex h-full items-center justify-center text-muted-foreground font-bold">Player not found.</div></Layout>;
  }

  const displayedTotalBlooks = "totalBlookDefs" in displayedPlayer
    ? displayedPlayer.totalBlookDefs
    : stats.totalBlookDefs;

  const getDisplayedLevelProgress = () => {
    const currentLevelBaseXP = 100 * (displayedPlayer.level - 1) ** 2;
    const nextLevelXP = 100 * displayedPlayer.level ** 2;
    return Math.min(100, Math.max(0, ((displayedPlayer.experience - currentLevelBaseXP) / (nextLevelXP - currentLevelBaseXP)) * 100));
  };

  const pageHeader = (
    <div className="flex flex-col md:flex-row items-center md:items-stretch gap-6 max-md:gap-4 mb-6 max-md:mb-4">
      <div 
        className={`w-32 h-32 md:w-40 md:h-40 shrink-0 bg-card border-2 border-card-border rounded-3xl max-md:rounded-2xl shadow-xl p-4 max-md:p-2 flex items-center justify-center relative overflow-hidden ${isViewingOther ? "" : "cursor-pointer group"}`}
        onClick={() => !isViewingOther && setIsAvatarPickerOpen(true)}
      >
        {!isViewingOther && (
          <div className="absolute inset-0 bg-black/50 z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="font-bold text-white text-sm max-md:text-xs text-center">Change Avatar</span>
          </div>
        )}
        {displayedPlayer.avatarImage ? (
          <img src={displayedPlayer.avatarImage ?? undefined} alt="Avatar" className="w-full h-full object-contain drop-shadow-xl z-10 relative group-hover:scale-110 transition-transform" />
        ) : (
          <span className="font-display text-6xl max-md:text-5xl text-muted-foreground z-10 relative">{displayedPlayer.username[0].toUpperCase()}</span>
        )}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-accent/10 z-0"></div>
      </div>
      
      <div className="flex-1 flex flex-col bg-card border-2 border-card-border rounded-3xl max-md:rounded-2xl p-6 max-md:p-4 shadow-xl relative overflow-hidden w-full">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-2 relative z-10 w-full">
          <div className="flex flex-wrap items-center gap-3 min-w-0">
            <h1 className={`text-4xl max-md:text-2xl font-black font-display tracking-tight text-white ${nameEffectClass(displayedPlayer.nameEffect)}`} style={nameEffectStyle(displayedPlayer.nameEffect)}>
              {displayedPlayer.username}
            </h1>
            <BadgeList badges={displayedPlayer.badges} size={32} smallSize={18} className="ml-2 max-md:ml-1" />
            {!isViewingOther && <button
              onClick={() => { setNewName(me.username); setIsRenameOpen(true); }}
              className="text-muted-foreground hover:text-white transition-colors"
              title="Change name"
            >
              <Pencil className="w-4 h-4 max-md:w-3 max-md:h-3" />
            </button>}
          </div>
          
          <div className="flex flex-col md:items-end gap-2 max-md:mt-2 w-full md:w-auto">
            <form onSubmit={handleSearchStats} className="flex items-center gap-2 w-full md:w-auto">
              <Input 
                placeholder="Search player..." 
                value={viewStatsUsername}
                onChange={(e) => setViewStatsUsername(e.target.value)}
                className="h-10 max-md:h-8 bg-input border-card-border flex-1 md:w-40 min-w-0"
              />
              <Button type="submit" size="sm" variant="secondary" className="h-10 max-md:h-8 shrink-0">
                <Search className="w-4 h-4 max-md:mr-0 mr-1" /> <span className="max-md:hidden">View Stats</span>
              </Button>
            </form>
            {!isViewingOther && (canClaim ? (
              <Button
                size="sm"
                onClick={handleClaim}
                disabled={claimMutation.isPending}
                className="h-8 px-3 max-md:w-full text-xs font-black uppercase tracking-wide rounded-lg bg-yellow-500 hover:bg-yellow-400 text-black shrink-0"
              >
                {claimMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Gift className="w-4 h-4 mr-1" /> Claim 4,000 daily tokens</>}
              </Button>
            ) : (
              <span className="text-xs font-bold text-muted-foreground flex items-center gap-1">
                <Gift className="w-4 h-4 text-yellow-400" /> Daily tokens in <span className="text-yellow-400 font-black tabular-nums">{claimCountdown}</span>
              </span>
            ))}
          </div>
        </div>
        
        <p className="text-lg max-md:text-sm text-muted-foreground font-bold mb-auto relative z-10 mt-2">
          {isViewingOther ? `${displayedPlayer.username}'s collection overview.` : "Collection overview and history."}
        </p>
        
        <div className="flex items-center gap-4 max-md:gap-3 mt-4 relative z-10">
          <div className="w-16 h-16 max-md:w-12 max-md:h-12 rounded-2xl max-md:rounded-xl bg-secondary border border-card-border flex flex-col items-center justify-center shrink-0">
            <span className="text-[10px] max-md:text-[8px] font-black uppercase text-muted-foreground leading-none mb-1">Level</span>
            <span className="text-2xl max-md:text-xl font-black font-display leading-none text-white">{displayedPlayer.level}</span>
          </div>
          <div className="flex-1 flex flex-col gap-2 max-md:gap-1 min-w-0">
            <div className="flex justify-between items-end">
              <span className="font-bold text-sm max-md:text-xs text-muted-foreground uppercase tracking-wider">Experience</span>
              <span className="text-sm max-md:text-xs font-black text-white">{formatNumber(displayedPlayer.experience)} XP</span>
            </div>
            <Progress value={getDisplayedLevelProgress()} indicatorClassName={displayedPlayer.level > 100 ? "bg-purple-500" : "bg-yellow-400"} className="h-3 max-md:h-2 bg-secondary" />
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <Layout title="Stats" pageHeader={pageHeader}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-md:gap-2 mb-4">
        <div className="relative bg-gradient-to-br from-yellow-500/15 via-secondary/50 to-secondary/50 border border-card-border hover:border-yellow-500/40 rounded-2xl max-md:rounded-xl overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-yellow-500/10">
          <div className="absolute top-0 left-0 w-11 h-11 max-md:w-9 max-md:h-9 rounded-br-2xl max-md:rounded-br-xl bg-yellow-500/25 text-yellow-400 flex items-center justify-center border-b border-r border-yellow-500/20">
            <TokenIcon className="w-5 h-5 max-md:w-4 max-md:h-4" />
          </div>
          <TokenIcon className="absolute -bottom-4 -right-4 w-24 h-24 text-yellow-400/[0.06] rotate-[-12deg] pointer-events-none" />
          <div className="flex flex-col min-w-0 p-4 max-md:p-3 pl-16 max-md:pl-12 relative">
            <span className="text-xs max-md:text-[10px] font-bold uppercase tracking-widest text-muted-foreground truncate">Tokens</span>
            <span className="text-3xl max-md:text-xl font-black font-display truncate">{formatNumber(displayedPlayer.tokens)}</span>
          </div>
        </div>

        <div className="relative bg-gradient-to-br from-purple-500/15 via-secondary/50 to-secondary/50 border border-card-border hover:border-purple-500/40 rounded-2xl max-md:rounded-xl overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-purple-500/10">
          <div className="absolute top-0 left-0 w-11 h-11 max-md:w-9 max-md:h-9 rounded-br-2xl max-md:rounded-br-xl bg-purple-500/25 text-purple-400 flex items-center justify-center border-b border-r border-purple-500/20">
            <FaLockOpen className="w-5 h-5 max-md:w-4 max-md:h-4" />
          </div>
          <FaLockOpen className="absolute -bottom-4 -right-4 w-24 h-24 text-purple-400/[0.06] rotate-[-12deg] pointer-events-none" />
          <div className="flex flex-col min-w-0 p-4 max-md:p-3 pl-16 max-md:pl-12 relative">
            <span className="text-xs max-md:text-[10px] font-bold uppercase tracking-widest text-muted-foreground truncate">Blooks</span>
            <span className="text-3xl max-md:text-xl font-black font-display truncate">{formatNumber(displayedPlayer.uniqueBlooks)} <span className="text-lg max-md:text-xs text-muted-foreground">/ {displayedTotalBlooks}</span></span>
          </div>
        </div>

        <div className="relative bg-gradient-to-br from-green-500/15 via-secondary/50 to-secondary/50 border border-card-border hover:border-green-500/40 rounded-2xl max-md:rounded-xl overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-green-500/10">
          <div className="absolute top-0 left-0 w-11 h-11 max-md:w-9 max-md:h-9 rounded-br-2xl max-md:rounded-br-xl bg-green-500/25 text-green-400 flex items-center justify-center border-b border-r border-green-500/20">
            <FaBoxOpen className="w-5 h-5 max-md:w-4 max-md:h-4" />
          </div>
          <FaBoxOpen className="absolute -bottom-4 -right-4 w-24 h-24 text-green-400/[0.06] rotate-[-12deg] pointer-events-none" />
          <div className="flex flex-col min-w-0 p-4 max-md:p-3 pl-16 max-md:pl-12 relative">
            <span className="text-xs max-md:text-[10px] font-bold uppercase tracking-widest text-muted-foreground truncate">Opened</span>
            <span className="text-3xl max-md:text-xl font-black font-display truncate">{formatNumber(displayedPlayer.packsOpened)}</span>
          </div>
        </div>

        <div className="relative bg-gradient-to-br from-blue-500/15 via-secondary/50 to-secondary/50 border border-card-border hover:border-blue-500/40 rounded-2xl max-md:rounded-xl overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-500/10">
          <div className="absolute top-0 left-0 w-11 h-11 max-md:w-9 max-md:h-9 rounded-br-2xl max-md:rounded-br-xl bg-blue-500/25 text-blue-400 flex items-center justify-center border-b border-r border-blue-500/20">
            {isViewingOther ? <GiMining className="w-5 h-5 max-md:w-4 max-md:h-4" /> : <FaComment className="w-5 h-5 max-md:w-4 max-md:h-4" />}
          </div>
          {isViewingOther ? (
            <GiMining className="absolute -bottom-4 -right-4 w-24 h-24 text-blue-400/[0.06] rotate-[-12deg] pointer-events-none" />
          ) : (
            <FaComment className="absolute -bottom-4 -right-4 w-24 h-24 text-blue-400/[0.06] rotate-[-12deg] pointer-events-none" />
          )}
          <div className="flex flex-col min-w-0 p-4 max-md:p-3 pl-16 max-md:pl-12 relative">
            <span className="text-xs max-md:text-[10px] font-bold uppercase tracking-widest text-muted-foreground truncate">{isViewingOther ? "Mine Rate" : "Messages"}</span>
            <span className="text-3xl max-md:text-xl font-black font-display truncate">
              {isViewingOther ? (
                <>{formatNumber(viewedProfile?.minePerHour ?? 0)}<span className="text-lg max-md:text-xs text-muted-foreground">/hr</span></>
              ) : (
                formatNumber(stats.messagesSent)
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Rename Dialog */}
      <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display">Change Name</DialogTitle>
            <DialogDescription>3-20 characters. Letters, numbers, _ and - only.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRename} className="flex flex-col gap-3">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New username"
              maxLength={20}
              className="bg-input border-card-border"
              autoFocus
            />
            <Button
              type="submit"
              disabled={updateMeMutation.isPending || !newName.trim() || newName.trim() === me.username}
              className="font-black font-display uppercase tracking-wide rounded-xl"
            >
              {updateMeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Avatar Picker Dialog */}
      <Dialog open={isAvatarPickerOpen} onOpenChange={setIsAvatarPickerOpen}>
        <DialogContent className="max-w-3xl h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display">Select Avatar</DialogTitle>
            <DialogDescription>Choose a blook from your collection to display as your avatar.</DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="flex-1 -mx-6 px-6">
            {!myBlooks ? (
              <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin" /></div>
            ) : myBlooks.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">You don't own any blooks yet.</div>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-4 py-4">
                {myBlooks.map(blook => (
                  <div 
                    key={blook.name}
                    className={`relative bg-secondary/50 border rounded-xl p-2 cursor-pointer transition-all hover:scale-105 ${me.avatarBlook === blook.name ? 'border-primary shadow-[0_0_15px_rgba(139,92,246,0.5)]' : 'border-card-border hover:border-primary/50'}`}
                    onClick={() => handleSetAvatar(blook.name)}
                  >
                    <img src={blook.image} alt={blook.name} className={`w-full aspect-square object-contain drop-shadow-md ${blookImageAnimation(blook.name)}`} />
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

    </Layout>
  );
}
