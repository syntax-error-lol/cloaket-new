const fs = require('fs');

const code = `import { useState, useMemo } from "react";
import { Layout } from "@/components/layout/layout";
import { 
  useGetStats, useGetMe, useGetMyBlooks, useUpdateMe, useGetPlayerProfile, useSendTradeRequest,
  getGetMeQueryKey, getGetMyBlooksQueryKey, getGetPlayerProfileQueryKey, getGetTradeRequestsQueryKey
} from "@workspace/api-client-react";
import { formatNumber } from "@/lib/utils";
import { Loader2, PackageOpen, Coins, LayoutDashboard, MessageCircle, Search, Trophy, ArrowRightLeft } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

export default function Stats() {
  const { data: stats, isLoading: isStatsLoading } = useGetStats();
  const { data: me, isLoading: isMeLoading } = useGetMe();
  const { data: myBlooks } = useGetMyBlooks();
  
  const updateMeMutation = useUpdateMe();
  const queryClient = useQueryClient();

  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false);
  const [viewStatsUsername, setViewStatsUsername] = useState("");
  const [searchedUsername, setSearchedUsername] = useState<string | null>(null);

  const [, setLocation] = useLocation();
  const sendRequestMutation = useSendTradeRequest();

  const { data: profile, isLoading: isProfileLoading, isError: isProfileError } = useGetPlayerProfile(searchedUsername || "", {
    query: {
      enabled: !!searchedUsername,
      queryKey: getGetPlayerProfileQueryKey(searchedUsername || "")
    }
  });

  const getLevelProgress = () => {
    if (!me) return 0;
    const currentLevelBaseXP = (me.level - 1) * 100;
    const nextLevelXP = me.level * 100;
    const progress = Math.min(100, Math.max(0, ((me.experience - currentLevelBaseXP) / (nextLevelXP - currentLevelBaseXP)) * 100));
    return progress || 50;
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

  const handleSearchStats = (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewStatsUsername.trim()) return;
    setSearchedUsername(viewStatsUsername.trim());
  };

  const handleTradeRequest = () => {
    if (!profile) return;
    sendRequestMutation.mutate({ data: { username: profile.username } }, {
      onSuccess: (request) => {
        queryClient.invalidateQueries({ queryKey: getGetTradeRequestsQueryKey() });
        setSearchedUsername(null);
        setViewStatsUsername("");
        if (request.status === "accepted") {
          toast({ title: "Trade Started!", description: \`\${profile.username} accepted your trade.\` });
          setLocation("/trade");
        } else {
          toast({ title: "Request Sent!", description: \`Waiting for \${profile.username} to accept.\` });
        }
      },
      onError: (err) => {
        toast({ title: "Failed", description: (err.data as any)?.message || "Error", variant: "destructive" });
      }
    });
  };

  if (isStatsLoading || isMeLoading || !stats || !me) {
    return <Layout title="Stats"><div className="flex h-full items-center justify-center"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div></Layout>;
  }

  const pageHeader = (
    <div className="flex flex-col md:flex-row items-center md:items-stretch gap-6 mb-6">
      <div 
        className="w-32 h-32 md:w-40 md:h-40 shrink-0 bg-card border-2 border-card-border rounded-3xl shadow-xl p-4 flex items-center justify-center relative overflow-hidden cursor-pointer group"
        onClick={() => setIsAvatarPickerOpen(true)}
      >
        <div className="absolute inset-0 bg-black/50 z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="font-bold text-white text-sm">Change Avatar</span>
        </div>
        {me.avatarBlook ? (
          <img src={\`https://blacket.org/content/blooks/\${me.avatarBlook}.webp\`} alt="Avatar" className="w-full h-full object-contain drop-shadow-xl z-10 relative group-hover:scale-110 transition-transform" />
        ) : (
          <span className="font-display text-6xl text-muted-foreground z-10 relative">{me.username[0].toUpperCase()}</span>
        )}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-accent/10 z-0"></div>
      </div>
      
      <div className="flex-1 flex flex-col bg-card border-2 border-card-border rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex items-center justify-between gap-3 mb-2 relative z-10 flex-wrap">
          <div className="flex items-center gap-3">
            <h1 className={\`text-4xl font-black font-display tracking-tight text-white \${me.nameEffect === 'rainbow' ? 'text-rainbow drop-shadow-none' : ''}\`}>
              {me.username}
            </h1>
            <div className="flex gap-1.5 ml-2">
              {me.badges?.map(b => (
                <img key={b.name} src={b.image} alt={b.name} title={\`\${b.name} — \${b.description}\`} className="w-8 h-8 object-contain" />
              ))}
            </div>
          </div>
          
          <form onSubmit={handleSearchStats} className="flex items-center gap-2">
            <Input 
              placeholder="Search player..." 
              value={viewStatsUsername}
              onChange={(e) => setViewStatsUsername(e.target.value)}
              className="h-10 bg-input border-card-border w-40"
            />
            <Button type="submit" size="sm" variant="secondary" className="h-10">
              <Search className="w-4 h-4 mr-1" /> View Stats
            </Button>
          </form>
        </div>
        
        <p className="text-lg text-muted-foreground font-bold mb-auto relative z-10">Collection overview and history.</p>
        
        <div className="flex items-center gap-4 mt-4 relative z-10">
          <div className="w-16 h-16 rounded-2xl bg-secondary border border-card-border flex flex-col items-center justify-center shrink-0">
            <span className="text-[10px] font-black uppercase text-muted-foreground leading-none mb-1">Level</span>
            <span className="text-2xl font-black font-display leading-none text-white">{me.level}</span>
          </div>
          <div className="flex-1 flex flex-col gap-2">
            <div className="flex justify-between items-end">
              <span className="font-bold text-sm text-muted-foreground uppercase tracking-wider">Experience</span>
              <span className="text-sm font-black text-white">{formatNumber(me.experience)} XP</span>
            </div>
            <Progress value={getLevelProgress()} indicatorClassName="bg-yellow-400" className="h-3 bg-secondary" />
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <Layout title="Stats" pageHeader={pageHeader}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <div className="bg-secondary/50 border border-card-border rounded-2xl p-5 flex items-center gap-5">
          <div className="w-14 h-14 rounded-xl bg-yellow-500/20 text-yellow-400 flex items-center justify-center shrink-0">
            <Coins className="w-7 h-7" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Tokens</span>
            <span className="text-3xl font-black font-display">{formatNumber(me.tokens)}</span>
          </div>
        </div>

        <div className="bg-secondary/50 border border-card-border rounded-2xl p-5 flex items-center gap-5">
          <div className="w-14 h-14 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
            <LayoutDashboard className="w-7 h-7" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Blooks Unlocked</span>
            <span className="text-3xl font-black font-display">{formatNumber(stats.uniqueBlooks)} <span className="text-lg text-muted-foreground">/ {stats.totalBlookDefs}</span></span>
          </div>
        </div>

        <div className="bg-secondary/50 border border-card-border rounded-2xl p-5 flex items-center gap-5">
          <div className="w-14 h-14 rounded-xl bg-green-500/20 text-green-400 flex items-center justify-center shrink-0">
            <PackageOpen className="w-7 h-7" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Packs Opened</span>
            <span className="text-3xl font-black font-display">{formatNumber(stats.packsOpened)}</span>
          </div>
        </div>

        <div className="bg-secondary/50 border border-card-border rounded-2xl p-5 flex items-center gap-5">
          <div className="w-14 h-14 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
            <MessageCircle className="w-7 h-7" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Messages Sent</span>
            <span className="text-3xl font-black font-display">{formatNumber(stats.messagesSent)}</span>
          </div>
        </div>
      </div>

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
                    className={\`relative bg-secondary/50 border rounded-xl p-2 cursor-pointer transition-all hover:scale-105 \${me.avatarBlook === blook.name ? 'border-primary shadow-[0_0_15px_rgba(139,92,246,0.5)]' : 'border-card-border hover:border-primary/50'}\`}
                    onClick={() => handleSetAvatar(blook.name)}
                  >
                    <img src={blook.image} alt={blook.name} className="w-full aspect-square object-contain drop-shadow-md" />
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* View Player Stats Dialog */}
      <Dialog open={!!searchedUsername} onOpenChange={(open) => {
        if (!open) {
          setSearchedUsername(null);
          setViewStatsUsername("");
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle className="sr-only">Player Profile</DialogTitle>
          <DialogDescription className="sr-only">View player stats and badges</DialogDescription>
          
          {isProfileLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
            </div>
          ) : isProfileError || !profile ? (
            <div className="flex h-64 items-center justify-center flex-col gap-2">
              <span className="text-xl font-bold text-muted-foreground">Player not found.</span>
              <Button variant="outline" onClick={() => setSearchedUsername(null)}>Close</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-6 py-4">
              <div className="flex flex-col items-center text-center">
                <div className="w-24 h-24 rounded-2xl bg-secondary border border-card-border shadow-xl flex items-center justify-center overflow-hidden mb-4 relative group">
                  <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                  {profile.avatarImage ? (
                    <img src={profile.avatarImage} alt="Avatar" className="w-full h-full object-contain" />
                  ) : (
                    <span className="font-display text-4xl">{profile.username[0].toUpperCase()}</span>
                  )}
                </div>
                
                <h2 className="text-3xl font-black font-display tracking-wide mb-1 flex items-center gap-2">
                  <span className={profile.nameEffect === 'rainbow' ? 'text-rainbow drop-shadow-none' : ''}>{profile.username}</span>
                  {profile.badges?.map(b => (
                    <img key={b.name} src={b.image} alt={b.name} title={\`\${b.name} — \${b.description}\`} className="w-5 h-5 object-contain" />
                  ))}
                  {profile.isOnline && <div className="w-3 h-3 bg-green-500 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.8)]" title="Online" />}
                </h2>
                
                <p className="text-sm font-bold text-muted-foreground mb-6 uppercase tracking-widest">
                  Joined {new Date(profile.joinedAt).toLocaleDateString()}
                </p>

                <div className="w-full grid grid-cols-2 gap-3 mb-6">
                  <div className="bg-secondary/50 rounded-xl p-3 flex flex-col items-center justify-center border border-card-border">
                    <Trophy className="w-5 h-5 text-blue-400 mb-1" />
                    <span className="text-lg font-black">{profile.level}</span>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">Level</span>
                  </div>
                  <div className="bg-secondary/50 rounded-xl p-3 flex flex-col items-center justify-center border border-card-border">
                    <Coins className="w-5 h-5 text-yellow-400 mb-1" />
                    <span className="text-lg font-black">{formatNumber(profile.tokens)}</span>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">Tokens</span>
                  </div>
                  <div className="bg-secondary/50 rounded-xl p-3 flex flex-col items-center justify-center border border-card-border">
                    <PackageOpen className="w-5 h-5 text-green-400 mb-1" />
                    <span className="text-lg font-black">{formatNumber(profile.packsOpened)}</span>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">Packs Opened</span>
                  </div>
                  <div className="bg-secondary/50 rounded-xl p-3 flex flex-col items-center justify-center border border-card-border">
                    <LayoutDashboard className="w-5 h-5 text-purple-400 mb-1" />
                    <span className="text-lg font-black">{formatNumber(profile.uniqueBlooks)} <span className="text-sm text-muted-foreground">/ {formatNumber(profile.totalBlooks)}</span></span>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">Blooks</span>
                  </div>
                </div>

                {me?.username !== profile.username && (
                  <Button 
                    className="w-full h-14 text-xl font-black font-display tracking-wide bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-primary/30 rounded-xl"
                    onClick={handleTradeRequest}
                    disabled={sendRequestMutation.isPending}
                  >
                    {sendRequestMutation.isPending ? <Loader2 className="w-6 h-6 animate-spin mr-2" /> : <ArrowRightLeft className="w-6 h-6 mr-2" />}
                    Trade
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
`;

fs.writeFileSync('artifacts/blacket-game/src/pages/stats.tsx', code);
