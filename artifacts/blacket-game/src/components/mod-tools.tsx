import { memo, useState, useEffect, useMemo, useRef } from "react";
import { TokenIcon } from "@/components/token-icon";
import {
  useGetPacks,
  useModLookup,
  useModBanPlayer,
  useModUnbanPlayer,
  useModDeletePlayerChat,
  useModSetBadge,
  useModSetMuted,
  useModListTrades,
  useModPlayerTrades,
  useModListPulls,
  useModListCrafts,
  useModListChat,
  useModDeleteChatMessage,
  useModListClans,
  useModBanClan,
  useModUnbanClan,
} from "@workspace/api-client-react";
import type { ModLookupResult, ModTrade, ModChatMessage, ModPull, ModCraft, ModClanInfo } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import {
  Loader2,
  Search,
  Ban,
  Undo2,
  BadgeCheck,
  Eye,
  Users,
  Check,
  MessageSquare,
  Trash2,
  Crown,
  VolumeX,
  Volume2,
  Bot,
  ArrowLeftRight,
  Package,
  Hammer,
  Flag,
} from "lucide-react";
import { CloaketAiPanel } from "@/components/cloaket-ai-panel";
import { IpBansPanel } from "@/components/admin-tools";

const VERIFIED = "Verified";
const OG = "OG";

function OfferCard({
  side,
}: {
  side: ModTrade["sideA"];
}) {
  return (
    <div
      className={`flex-1 min-w-0 rounded-2xl border-2 p-3 ${side.accepted ? "border-green-500/60 bg-green-500/10" : "border-card-border bg-background/40"}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="font-black text-white truncate">{side.username}</span>
        {side.accepted && (
          <span className="flex items-center gap-1 text-green-400 text-xs font-black uppercase">
            <Check className="w-4 h-4" /> Accepted
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 text-yellow-400 font-black mb-2">
        <TokenIcon className="w-4 h-4" /> {side.offer.tokens.toLocaleString()}
      </div>
      {side.offer.blooks.length === 0 ? (
        <p className="text-muted-foreground text-sm font-bold">No blooks offered</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {side.offer.blooks.map((b) => (
            <div
              key={b.name}
              className="flex items-center gap-1.5 bg-card border border-card-border rounded-xl px-2 py-1"
              title={`${b.name} (${b.rarity})`}
            >
              <img src={b.image} alt={b.name} className="w-6 h-6 object-contain" />
              <span className="text-xs font-bold text-white">
                {b.name}
                {b.quantity > 1 && <span className="text-muted-foreground"> ×{b.quantity}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The full mod toolset (players / live trades / chat / pulls / Cloaket AI),
 * shared between the mod panel and the owner panel. The backend accepts the
 * owner password on all /mod endpoints, so either password works here.
 */
export const ModTools = memo(function ModTools({ password }: { password: string }) {
  const [data, setData] = useState<ModLookupResult | null>(null);
  const [tab, setTab] = useState<"players" | "trades" | "chat" | "pulls" | "crafts" | "clans" | "ai">("players");
  const [search, setSearch] = useState("");
  const [searchMode, setSearchMode] = useState<"name" | "ip">("name");
  const [trades, setTrades] = useState<ModTrade[] | null>(null);
  const [tradeHistoryUser, setTradeHistoryUser] = useState<string | null>(null);
  const [playerTrades, setPlayerTrades] = useState<ModTrade[] | null>(null);
  const [pulls, setPulls] = useState<ModPull[] | null>(null);
  const [pullsTotal, setPullsTotal] = useState<number | null>(null);
  const [pullPack, setPullPack] = useState("");
  const [pullBlook, setPullBlook] = useState("");
  const [crafts, setCrafts] = useState<ModCraft[] | null>(null);
  const [craftsTotal, setCraftsTotal] = useState<number | null>(null);
  const [craftBlook, setCraftBlook] = useState("");
  const { data: allPacks } = useGetPacks();
  // The Top pack is displayed by its remaining supply ("97 Left"), not its name.
  const topRemaining = allPacks?.find((p) => p.name === "1k")?.remaining ?? 0;
  const packLabel = (name: string) => (name === "1k" ? `${topRemaining} Left` : name);
  // Blook name → image, for rendering craft inputs as pictures.
  const blookImages = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of allPacks ?? []) for (const b of p.blooks) map.set(b.name, b.image);
    return map;
  }, [allPacks]);
  const [chat, setChat] = useState<ModChatMessage[] | null>(null);
  const [clans, setClans] = useState<ModClanInfo[] | null>(null);
  const [clanSearch, setClanSearch] = useState("");

  const listClansMutation = useModListClans();
  const banClanMutation = useModBanClan();
  const unbanClanMutation = useModUnbanClan();

  const refreshClans = () => {
    listClansMutation.mutate(
      { data: { password } },
      {
        onSuccess: (res) => setClans(res),
        onError: (err) => toast({ title: "Failed", description: (err.data as any)?.message || "Couldn't load clans", variant: "destructive" }),
      },
    );
  };

  // Load clans when the tab is opened.
  useEffect(() => {
    if (tab === "clans" && clans === null) refreshClans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const handleClanBanToggle = (clan: ModClanInfo) => {
    const mutation = clan.banned ? unbanClanMutation : banClanMutation;
    mutation.mutate(
      { data: { password, clanName: clan.name } },
      {
        onSuccess: (res) => {
          toast({
            title: res.banned ? "Clan banned" : "Clan restored",
            description: res.banned
              ? `${res.name} is now hidden from everyone. You can unban it anytime.`
              : `${res.name} is back, with all members and progress intact.`,
          });
          refreshClans();
        },
        onError: (err) => toast({ title: "Failed", description: (err.data as any)?.message || "Error", variant: "destructive" }),
      },
    );
  };

  const lookupMutation = useModLookup();
  const banMutation = useModBanPlayer();
  const unbanMutation = useModUnbanPlayer();
  const deletePlayerChatMutation = useModDeletePlayerChat();
  const badgeMutation = useModSetBadge();
  const mutedMutation = useModSetMuted();
  const tradesMutation = useModListTrades();
  const playerTradesMutation = useModPlayerTrades();
  const pullsMutation = useModListPulls();
  const craftsMutation = useModListCrafts();
  const chatMutation = useModListChat();
  const deleteMessageMutation = useModDeleteChatMessage();

  // Initial player list load.
  useEffect(() => {
    lookupMutation.mutate({ data: { password } }, { onSuccess: setData });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [password]);

  const refreshPlayers = () => {
    lookupMutation.mutate({ data: { password } }, { onSuccess: setData });
  };

  // Poll live trades every 3s while the Trades tab is open.
  const pollBusy = useRef(false);
  useEffect(() => {
    if (tab !== "trades") return;
    let cancelled = false;
    const poll = () => {
      if (pollBusy.current) return;
      pollBusy.current = true;
      tradesMutation.mutate(
        { data: { password } },
        {
          onSuccess: (res) => {
            if (!cancelled) setTrades(res.trades);
          },
          onSettled: () => {
            pollBusy.current = false;
          },
        },
      );
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, password]);

  // Poll live pulls every 3s while the Pulls tab is open.
  const pullsPollBusy = useRef(false);
  useEffect(() => {
    if (tab !== "pulls") return;
    let cancelled = false;
    const poll = () => {
      if (pullsPollBusy.current) return;
      pullsPollBusy.current = true;
      pullsMutation.mutate(
        { data: { password, ...(pullBlook ? { blook: pullBlook } : {}), ...(pullPack ? { pack: pullPack } : {}) } },
        {
          onSuccess: (res) => {
            if (!cancelled) {
              setPulls(res.pulls);
              setPullsTotal(res.totalCount);
            }
          },
          onSettled: () => {
            pullsPollBusy.current = false;
          },
        },
      );
    };
    setPulls(null);
    setPullsTotal(null);
    poll();
    const id = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, password, pullPack, pullBlook]);

  // Poll live crafts every 3s while the Crafts tab is open.
  const craftsPollBusy = useRef(false);
  useEffect(() => {
    if (tab !== "crafts") return;
    let cancelled = false;
    const poll = () => {
      if (craftsPollBusy.current) return;
      craftsPollBusy.current = true;
      craftsMutation.mutate(
        { data: { password, ...(craftBlook ? { blook: craftBlook } : {}) } },
        {
          onSuccess: (res) => {
            if (!cancelled) {
              setCrafts(res.crafts);
              setCraftsTotal(res.totalCount);
            }
          },
          onSettled: () => {
            craftsPollBusy.current = false;
          },
        },
      );
    };
    setCrafts(null);
    setCraftsTotal(null);
    poll();
    const id = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, password, craftBlook]);

  // Poll live chat every 3s while the Chat tab is open.
  const chatPollBusy = useRef(false);
  useEffect(() => {
    if (tab !== "chat") return;
    let cancelled = false;
    const poll = () => {
      if (chatPollBusy.current) return;
      chatPollBusy.current = true;
      chatMutation.mutate(
        { data: { password } },
        {
          onSuccess: (res) => {
            if (!cancelled) setChat(res.messages);
          },
          onSettled: () => {
            chatPollBusy.current = false;
          },
        },
      );
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, password]);

  const handleDeleteMessage = (messageId: number) => {
    deleteMessageMutation.mutate(
      { data: { password, messageId } },
      {
        onSuccess: () => {
          setChat((prev) => prev?.filter((m) => m.id !== messageId) ?? prev);
          toast({ title: "Deleted", description: "Chat message removed." });
        },
        onError: (err) => {
          toast({
            title: "Failed",
            description: (err.data as any)?.message || "Error",
            variant: "destructive",
          });
        },
      },
    );
  };

  const filteredPlayers = useMemo(() => {
    const players = (data?.players ?? []).filter((p) => !p.isBot);
    if (!search) return players;
    const q = search.toLowerCase();
    if (searchMode === "ip") {
      return players.filter((p) => (p.lastIp ?? "").toLowerCase().includes(q));
    }
    return players.filter((p) => p.username.toLowerCase().includes(q));
  }, [data, search, searchMode]);

  const handleViewTrades = (username: string) => {
    setTradeHistoryUser(username);
    setPlayerTrades(null);
    playerTradesMutation.mutate(
      { data: { password, username } },
      {
        onSuccess: (res) => setPlayerTrades(res.trades),
        onError: (err: any) => {
          setTradeHistoryUser(null);
          toast({
            title: "Failed",
            description: (err?.data as any)?.message || "Error loading trades",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleDeletePlayerChat = (username: string) => {
    if (!window.confirm(`Delete ALL chat messages ever sent by ${username}? This can't be undone.`)) return;
    deletePlayerChatMutation.mutate(
      { data: { password, username } },
      {
        onSuccess: (res) => {
          toast({
            title: "Chat history deleted",
            description: `Removed ${res.messagesDeleted.toLocaleString()} message${res.messagesDeleted === 1 ? "" : "s"} from ${res.username}.`,
          });
        },
        onError: (err: any) => {
          toast({
            title: "Failed",
            description: (err?.data as any)?.message || "Error deleting chat history",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleBanToggle = (username: string, banned: boolean) => {
    const mutation = banned ? unbanMutation : banMutation;
    mutation.mutate(
      { data: { password, username } },
      {
        onSuccess: (res) => {
          toast({
            title: res.banned ? "Banned" : "Unbanned",
            description: `${res.username} is now ${res.banned ? "banned" : "unbanned"}.`,
          });
          refreshPlayers();
        },
        onError: (err) => {
          toast({
            title: "Failed",
            description: (err.data as any)?.message || "Error",
            variant: "destructive",
          });
        },
      },
    );
  };

  const [muteTarget, setMuteTarget] = useState<string | null>(null);
  const [muteCustom, setMuteCustom] = useState("");

  const handleMuteToggle = (username: string, isMuted: boolean) => {
    if (!isMuted) {
      // Muting: pick a duration first.
      setMuteCustom("");
      setMuteTarget(username);
      return;
    }
    doMute(username, false);
  };

  const doMute = (username: string, muted: boolean, minutes?: number) => {
    mutedMutation.mutate(
      { data: { password, username, muted, ...(minutes ? { minutes } : {}) } },
      {
        onSuccess: (res) => {
          setMuteTarget(null);
          toast({
            title: "Updated",
            description: res.muted
              ? minutes
                ? `${res.username} is muted for ${minutes} minute${minutes === 1 ? "" : "s"}.`
                : `${res.username} is now muted in chat.`
              : `${res.username} is no longer muted.`,
          });
          refreshPlayers();
        },
        onError: (err) => {
          toast({
            title: "Failed",
            description: (err.data as any)?.message || "Error",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleBadgeToggle = (username: string, badge: "Verified" | "OG", has: boolean) => {
    badgeMutation.mutate(
      { data: { password, username, badge, granted: !has } },
      {
        onSuccess: (res) => {
          toast({
            title: "Updated",
            description: `${res.username} ${res.badges.includes(badge) ? `now has the ${badge} badge` : `no longer has the ${badge} badge`}.`,
          });
          refreshPlayers();
        },
        onError: (err) => {
          toast({
            title: "Failed",
            description: (err.data as any)?.message || "Error",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <div>
      <div className="flex gap-2 mb-6 max-md:mb-4 max-md:overflow-x-auto max-md:pb-2 custom-scrollbar">
        <Button
          variant={tab === "players" ? "default" : "secondary"}
          onClick={() => setTab("players")}
          className="font-black font-display uppercase tracking-wide rounded-xl max-md:text-xs max-md:h-8 max-md:shrink-0"
        >
          <Users className="w-5 h-5 mr-2 max-md:w-4 max-md:h-4 max-md:mr-1" /> Players
        </Button>
        <Button
          variant={tab === "trades" ? "default" : "secondary"}
          onClick={() => setTab("trades")}
          className="font-black font-display uppercase tracking-wide rounded-xl max-md:text-xs max-md:h-8 max-md:shrink-0"
        >
          <Eye className="w-5 h-5 mr-2 max-md:w-4 max-md:h-4 max-md:mr-1" /> Live Trades
        </Button>
        <Button
          variant={tab === "chat" ? "default" : "secondary"}
          onClick={() => setTab("chat")}
          className="font-black font-display uppercase tracking-wide rounded-xl max-md:text-xs max-md:h-8 max-md:shrink-0"
        >
          <MessageSquare className="w-5 h-5 mr-2 max-md:w-4 max-md:h-4 max-md:mr-1" /> Chat
        </Button>
        <Button
          variant={tab === "pulls" ? "default" : "secondary"}
          onClick={() => setTab("pulls")}
          className="font-black font-display uppercase tracking-wide rounded-xl max-md:text-xs max-md:h-8 max-md:shrink-0"
        >
          <Package className="w-5 h-5 mr-2 max-md:w-4 max-md:h-4 max-md:mr-1" /> Pulls
        </Button>
        <Button
          variant={tab === "crafts" ? "default" : "secondary"}
          onClick={() => setTab("crafts")}
          className="font-black font-display uppercase tracking-wide rounded-xl max-md:text-xs max-md:h-8 max-md:shrink-0"
        >
          <Hammer className="w-5 h-5 mr-2 max-md:w-4 max-md:h-4 max-md:mr-1" /> Crafts
        </Button>
        <Button
          variant={tab === "clans" ? "default" : "secondary"}
          onClick={() => setTab("clans")}
          className="font-black font-display uppercase tracking-wide rounded-xl max-md:text-xs max-md:h-8 max-md:shrink-0"
        >
          <Flag className="w-5 h-5 mr-2 max-md:w-4 max-md:h-4 max-md:mr-1" /> Clans
        </Button>
        <Button
          variant={tab === "ai" ? "default" : "secondary"}
          onClick={() => setTab("ai")}
          className="font-black font-display uppercase tracking-wide rounded-xl max-md:text-xs max-md:h-8 max-md:shrink-0"
        >
          <Bot className="w-5 h-5 mr-2 max-md:w-4 max-md:h-4 max-md:mr-1" /> Cloaket AI
        </Button>
      </div>

      {tab === "ai" && <CloaketAiPanel password={password} />}

      {tab === "clans" && (
        <div className="bg-card border-2 border-card-border rounded-3xl max-md:rounded-2xl p-4 md:p-6 max-md:p-3">
          <div className="flex items-center gap-2 mb-4 max-md:mb-3">
            <div className="relative flex-1">
              <Search className="w-5 h-5 absolute left-4 max-md:left-3 top-1/2 -translate-y-1/2 text-muted-foreground max-md:w-4 max-md:h-4" />
              <Input
                value={clanSearch}
                onChange={(e) => setClanSearch(e.target.value)}
                placeholder="Search clans..."
                className="font-bold bg-input border-card-border h-12 max-md:h-10 rounded-2xl pl-12 max-md:pl-9 max-md:text-sm max-md:rounded-xl"
              />
            </div>
            <Button
              variant="secondary"
              onClick={refreshClans}
              disabled={listClansMutation.isPending}
              className="h-12 max-md:h-10 font-black font-display uppercase tracking-wide rounded-2xl max-md:rounded-xl"
            >
              {listClansMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Refresh"}
            </Button>
          </div>
          {clans === null ? (
            <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin" /></div>
          ) : (
            <div className="flex flex-col gap-2">
              {clans
                .filter((c) => c.name.toLowerCase().includes(clanSearch.trim().toLowerCase()))
                .map((clan) => (
                  <div
                    key={clan.id}
                    className={`flex flex-wrap items-center gap-3 border rounded-2xl max-md:rounded-xl p-3 max-md:p-2 ${clan.banned ? "border-red-500/50 bg-red-500/10" : "border-card-border bg-secondary/40"}`}
                  >
                    <span className="font-black font-display text-lg max-md:text-base truncate" style={{ color: clan.color === "rainbow" ? undefined : clan.color }}>
                      {clan.name}
                    </span>
                    {clan.banned && (
                      <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[10px] font-black uppercase tracking-wider">Banned</span>
                    )}
                    <span className="text-sm max-md:text-xs font-bold text-muted-foreground">
                      Owner: {clan.ownerUsername} • {clan.memberCount} member{clan.memberCount === 1 ? "" : "s"}
                    </span>
                    <div className="flex-1" />
                    <Button
                      size="sm"
                      variant={clan.banned ? "secondary" : "destructive"}
                      onClick={() => handleClanBanToggle(clan)}
                      disabled={banClanMutation.isPending || unbanClanMutation.isPending}
                      className="font-black font-display uppercase tracking-wide rounded-xl"
                    >
                      {clan.banned ? (<><Undo2 className="w-4 h-4 mr-1" /> Unban</>) : (<><Ban className="w-4 h-4 mr-1" /> Ban</>)}
                    </Button>
                  </div>
                ))}
              {clans.length === 0 && (
                <p className="text-sm font-semibold text-muted-foreground py-6 text-center">No clans yet.</p>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "players" && (
        <div className="bg-card border-2 border-card-border rounded-3xl max-md:rounded-2xl p-4 md:p-6 max-md:p-3">
          <div className="flex items-center gap-2 mb-4 max-md:mb-3">
            <div className="relative flex-1">
              <Search className="w-5 h-5 absolute left-4 max-md:left-3 top-1/2 -translate-y-1/2 text-muted-foreground max-md:w-4 max-md:h-4" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchMode === "ip" ? "Search by IP..." : "Search players..."}
                className="font-bold bg-input border-card-border h-12 max-md:h-10 rounded-2xl pl-12 max-md:pl-9 max-md:text-sm max-md:rounded-xl"
              />
            </div>
            {(data?.players ?? []).some((p) => p.lastIp) && (
            <div className="flex shrink-0 rounded-2xl max-md:rounded-xl border-2 border-card-border bg-input overflow-hidden h-12 max-md:h-10">
              <button
                type="button"
                onClick={() => setSearchMode("name")}
                className={`px-4 max-md:px-3 font-black text-sm max-md:text-xs transition-colors ${searchMode === "name" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-white"}`}
              >
                Name
              </button>
              <button
                type="button"
                onClick={() => setSearchMode("ip")}
                className={`px-4 max-md:px-3 font-black text-sm max-md:text-xs transition-colors ${searchMode === "ip" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-white"}`}
              >
                IP
              </button>
            </div>
            )}
          </div>
          <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto pr-1">
            {data === null && (
              <div className="flex justify-center py-10">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            )}
            {data !== null && filteredPlayers.length === 0 && (
              <p className="text-muted-foreground font-bold text-center py-6">No players found.</p>
            )}
            {filteredPlayers.map((p) => {
              const isVerified = p.badges.includes(VERIFIED);
              const isOg = p.badges.includes(OG);
              const timedMuted = !!p.mutedUntil && new Date(p.mutedUntil).getTime() > Date.now();
              const isMuted = p.muted || timedMuted;
              const muteMinsLeft = timedMuted
                ? Math.ceil((new Date(p.mutedUntil!).getTime() - Date.now()) / 60_000)
                : 0;
              return (
                <div
                  key={p.username}
                  className={`flex flex-wrap items-center gap-3 max-md:gap-2 max-md:flex-col max-md:items-start rounded-2xl max-md:rounded-xl border-2 px-4 py-3 max-md:p-3 ${p.banned ? "border-red-500/50 bg-red-500/10" : "border-card-border bg-background/40"}`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1 w-full">
                    <span className="font-black text-white truncate max-md:text-sm">{p.username}</span>
                    {isVerified && <BadgeCheck className="w-5 h-5 max-md:w-4 max-md:h-4 text-sky-400 shrink-0" />}
                    {p.banned && (
                      <span className="text-red-400 text-xs max-md:text-[10px] font-black uppercase shrink-0">Banned</span>
                    )}
                    {p.lastIp && (
                      <span className="text-xs max-md:text-[10px] font-bold font-mono shrink-0 text-muted-foreground">
                        {p.lastIp}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 max-md:gap-1.5 w-full">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={playerTradesMutation.isPending}
                      onClick={() => handleViewTrades(p.username)}
                      className="font-black rounded-xl max-md:h-8 max-md:text-xs max-md:px-2 max-md:rounded-lg"
                    >
                      <ArrowLeftRight className="w-4 h-4 mr-1 max-md:w-3 max-md:h-3 max-md:mr-1" />
                      Trades
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={badgeMutation.isPending}
                      onClick={() => handleBadgeToggle(p.username, VERIFIED, isVerified)}
                      className={`font-black rounded-xl max-md:h-8 max-md:text-xs max-md:px-2 max-md:rounded-lg ${isVerified ? "text-sky-400" : ""}`}
                    >
                      <BadgeCheck className="w-4 h-4 mr-1 max-md:w-3 max-md:h-3 max-md:mr-1" />
                      {isVerified ? "Unverify" : "Verify"}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={badgeMutation.isPending}
                      onClick={() => handleBadgeToggle(p.username, OG, isOg)}
                      className={`font-black rounded-xl max-md:h-8 max-md:text-xs max-md:px-2 max-md:rounded-lg ${isOg ? "text-amber-400" : ""}`}
                    >
                      <Crown className="w-4 h-4 mr-1 max-md:w-3 max-md:h-3 max-md:mr-1" />
                      {isOg ? "Remove OG" : "OG"}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={mutedMutation.isPending}
                      onClick={() => handleMuteToggle(p.username, isMuted)}
                      className={`font-black rounded-xl max-md:h-8 max-md:text-xs max-md:px-2 max-md:rounded-lg ${isMuted ? "text-orange-400" : ""}`}
                    >
                      {isMuted ? <Volume2 className="w-4 h-4 mr-1 max-md:w-3 max-md:h-3 max-md:mr-1" /> : <VolumeX className="w-4 h-4 mr-1 max-md:w-3 max-md:h-3 max-md:mr-1" />}
                      {isMuted ? (timedMuted ? `Unmute (${muteMinsLeft}m left)` : "Unmute") : "Mute"}
                    </Button>
                    <Button
                      size="sm"
                      variant={p.banned ? "secondary" : "destructive"}
                      disabled={banMutation.isPending || unbanMutation.isPending}
                      onClick={() => handleBanToggle(p.username, p.banned)}
                      className="font-black rounded-xl max-md:h-8 max-md:text-xs max-md:px-2 max-md:rounded-lg max-md:ml-auto"
                    >
                      {p.banned ? (
                        <>
                          <Undo2 className="w-4 h-4 mr-1 max-md:w-3 max-md:h-3 max-md:mr-1" /> Unban
                        </>
                      ) : (
                        <>
                          <Ban className="w-4 h-4 mr-1 max-md:w-3 max-md:h-3 max-md:mr-1" /> Ban
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={deletePlayerChatMutation.isPending}
                      onClick={() => handleDeletePlayerChat(p.username)}
                      className="font-black rounded-xl max-md:h-8 max-md:text-xs max-md:px-2 max-md:rounded-lg"
                    >
                      <Trash2 className="w-4 h-4 mr-1 max-md:w-3 max-md:h-3 max-md:mr-1" /> Delete Chat
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "players" && <IpBansPanel password={password} />}

      {tab === "trades" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-muted-foreground font-bold text-sm">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
            </span>
            Live — refreshes every 3 seconds
          </div>
          {trades === null && (
            <div className="flex justify-center py-10">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          )}
          {trades !== null && trades.length === 0 && (
            <div className="bg-card border-2 border-card-border rounded-3xl p-10 text-center">
              <Eye className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground font-bold">No live trades right now.</p>
            </div>
          )}
          {trades?.map((t) => (
            <div key={t.id} className="bg-card border-2 border-card-border rounded-3xl p-4 md:p-6">
              <div className="flex items-center justify-between mb-3">
                <span className="font-black font-display text-white uppercase tracking-wide">
                  Trade #{t.id}
                </span>
                <span className="text-xs font-bold text-muted-foreground">
                  Started {new Date(t.createdAt).toLocaleTimeString()}
                </span>
              </div>
              <div className="flex flex-col md:flex-row gap-3">
                <OfferCard side={t.sideA} />
                <OfferCard side={t.sideB} />
              </div>
              {t.messages.length > 0 && (
                <div className="mt-3 border-t-2 border-card-border pt-3 flex flex-col gap-1 max-h-40 overflow-y-auto">
                  {t.messages.map((m, i) => (
                    <p key={i} className="text-sm">
                      <span className="font-black text-white">{m.username}: </span>
                      <span className="text-muted-foreground font-medium break-words">{m.content}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "pulls" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-muted-foreground font-bold text-sm">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
              </span>
              Live — refreshes every 3 seconds
            </div>
            <select
              data-testid="select-pulls-pack"
              value={pullPack}
              onChange={(e) => {
                setPullPack(e.target.value);
                setPullBlook("");
              }}
              className="bg-secondary border border-card-border rounded-lg px-3 py-1.5 text-sm font-bold text-white"
            >
              <option value="">All packs</option>
              {allPacks?.map((p) => (
                <option key={p.name} value={p.name}>{packLabel(p.name)}</option>
              ))}
            </select>
            <select
              data-testid="select-pulls-blook"
              value={pullBlook}
              onChange={(e) => setPullBlook(e.target.value)}
              className="bg-secondary border border-card-border rounded-lg px-3 py-1.5 text-sm font-bold text-white"
            >
              <option value="">All blooks</option>
              {(pullPack ? allPacks?.filter((p) => p.name === pullPack) : allPacks)?.flatMap((p) =>
                p.blooks.map((b) => (
                  <option key={`${p.name}:${b.name}`} value={b.name}>{b.name}</option>
                )),
              )}
              {(!pullPack || pullPack === "1k") && <option value="Nothing">Nothing</option>}
            </select>
            {pullsTotal !== null && (
              <span data-testid="text-pulls-total" className="text-sm font-black text-white bg-secondary border border-card-border rounded-lg px-3 py-1.5">
                {pullBlook
                  ? `${pullBlook} pulled ${pullsTotal.toLocaleString()}× all time`
                  : pullPack
                    ? `${packLabel(pullPack)} opened ${pullsTotal.toLocaleString()}× all time`
                    : `${pullsTotal.toLocaleString()} pulls all time`}
              </span>
            )}
          </div>
          <div className="bg-card border-2 border-card-border rounded-3xl max-md:rounded-2xl p-4 md:p-6 max-md:p-3">
            {pulls === null && (
              <div className="flex justify-center py-10">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            )}
            {pulls !== null && pulls.length === 0 && (
              <p className="text-muted-foreground font-bold text-center py-6">No pack pulls logged yet.</p>
            )}
            <div className="flex flex-col gap-1 max-h-[65vh] overflow-y-auto pr-1">
              {pulls?.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 max-md:gap-2 rounded-xl px-3 py-2 hover:bg-background/60"
                >
                  {p.image ? (
                    <img src={p.image} alt={p.blook} className="w-8 h-8 max-md:w-6 max-md:h-6 object-contain shrink-0" />
                  ) : (
                    <Package className="w-8 h-8 max-md:w-6 max-md:h-6 text-muted-foreground shrink-0" />
                  )}
                  <p className="flex-1 min-w-0 text-sm max-md:text-xs font-medium text-muted-foreground truncate">
                    <span className="font-black text-white">{p.username}</span>
                    {" pulled "}
                    <span className="font-black text-white">{p.blook}</span>
                    <span className="font-bold"> ({p.rarity})</span>
                    {" from "}
                    <span className="font-black text-white">{packLabel(p.pack)}</span>
                  </p>
                  <span className="text-xs max-md:text-[10px] font-bold text-muted-foreground shrink-0">
                    {new Date(p.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "crafts" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-muted-foreground font-bold text-sm">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
              </span>
              Live — refreshes every 3 seconds
            </div>
            <select
              data-testid="select-crafts-blook"
              value={craftBlook}
              onChange={(e) => setCraftBlook(e.target.value)}
              className="bg-secondary border border-card-border rounded-lg px-3 py-1.5 text-sm font-bold text-white"
            >
              <option value="">All results</option>
              {allPacks?.flatMap((p) =>
                p.blooks.map((b) => (
                  <option key={`${p.name}:${b.name}`} value={b.name}>{b.name}</option>
                )),
              )}
            </select>
            {craftsTotal !== null && (
              <span data-testid="text-crafts-total" className="text-sm font-black text-white bg-secondary border border-card-border rounded-lg px-3 py-1.5">
                {craftBlook
                  ? `${craftBlook} crafted ${craftsTotal.toLocaleString()}× all time`
                  : `${craftsTotal.toLocaleString()} crafts all time`}
              </span>
            )}
          </div>
          <div className="bg-card border-2 border-card-border rounded-3xl max-md:rounded-2xl p-4 md:p-6 max-md:p-3">
            {crafts === null && (
              <div className="flex justify-center py-10">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            )}
            {crafts !== null && crafts.length === 0 && (
              <p className="text-muted-foreground font-bold text-center py-6">No crafts logged yet.</p>
            )}
            <div className="flex flex-col gap-1 max-h-[65vh] overflow-y-auto pr-1">
              {crafts?.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-3 max-md:gap-2 rounded-xl px-3 py-2 hover:bg-background/60"
                >
                  {c.image ? (
                    <img src={c.image} alt={c.result} className="w-8 h-8 max-md:w-6 max-md:h-6 object-contain shrink-0" />
                  ) : (
                    <Hammer className="w-8 h-8 max-md:w-6 max-md:h-6 text-muted-foreground shrink-0" />
                  )}
                  <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap text-sm max-md:text-xs font-medium text-muted-foreground">
                    <span className="font-black text-white">{c.username}</span>
                    <span>crafted</span>
                    <span className="font-black text-white">{c.result}</span>
                    <span className="font-bold">({c.rarity})</span>
                    <span>from</span>
                    {c.inputs.map((name, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5">
                        {i > 0 && <span className="font-black text-muted-foreground">+</span>}
                        {blookImages.get(name) ? (
                          <img
                            src={blookImages.get(name)}
                            alt={name}
                            title={name}
                            className="w-7 h-7 max-md:w-5 max-md:h-5 object-contain"
                          />
                        ) : (
                          <span className="font-bold text-white/80">{name}</span>
                        )}
                      </span>
                    ))}
                    {c.usedLuck && <span className="font-black text-yellow-400">· 2.5x luck</span>}
                  </div>
                  <span className="text-xs max-md:text-[10px] font-bold text-muted-foreground shrink-0">
                    {new Date(c.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "chat" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-muted-foreground font-bold text-sm">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
            </span>
            Live — refreshes every 3 seconds
          </div>
          <div className="bg-card border-2 border-card-border rounded-3xl p-4 md:p-6">
            {chat === null && (
              <div className="flex justify-center py-10">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            )}
            {chat !== null && chat.length === 0 && (
              <p className="text-muted-foreground font-bold text-center py-6">No chat messages.</p>
            )}
            <div className="flex flex-col gap-1 max-h-[65vh] overflow-y-auto pr-1">
              {chat?.map((m) => (
                <div
                  key={m.id}
                  className="group flex items-start gap-2 rounded-xl px-3 py-2 hover:bg-background/60"
                >
                  <div className="flex-1 min-w-0">
                    <span className="font-black text-white">{m.username}</span>
                    <span className="text-xs text-muted-foreground font-bold ml-2">
                      {new Date(m.createdAt).toLocaleTimeString()}
                    </span>
                    <p className="text-muted-foreground font-medium break-words">{m.content}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={deleteMessageMutation.isPending}
                    onClick={() => handleDeleteMessage(m.id)}
                    className="font-black rounded-xl opacity-60 group-hover:opacity-100 shrink-0"
                    title="Delete message"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <Dialog open={muteTarget !== null} onOpenChange={(open) => { if (!open) setMuteTarget(null); }}>
        <DialogContent className="bg-card border-2 border-card-border rounded-3xl max-md:rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="font-black font-display text-white uppercase tracking-wide">
              Mute {muteTarget}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm font-bold text-muted-foreground">
            How long should {muteTarget} be muted? Timed mutes end on their own.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "10 min", mins: 10 },
              { label: "30 min", mins: 30 },
              { label: "1 hour", mins: 60 },
              { label: "6 hours", mins: 360 },
              { label: "24 hours", mins: 1440 },
            ].map((opt) => (
              <Button
                key={opt.mins}
                variant="secondary"
                disabled={mutedMutation.isPending}
                onClick={() => muteTarget && doMute(muteTarget, true, opt.mins)}
                className="font-black rounded-xl"
                data-testid={`button-mute-${opt.mins}`}
              >
                {opt.label}
              </Button>
            ))}
            <Button
              variant="destructive"
              disabled={mutedMutation.isPending}
              onClick={() => muteTarget && doMute(muteTarget, true)}
              className="font-black rounded-xl"
              data-testid="button-mute-forever"
            >
              Forever
            </Button>
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const mins = parseInt(muteCustom, 10);
              if (muteTarget && mins >= 1 && mins <= 10080) doMute(muteTarget, true, mins);
            }}
          >
            <Input
              type="number"
              min={1}
              max={10080}
              value={muteCustom}
              onChange={(e) => setMuteCustom(e.target.value)}
              placeholder="Custom minutes (max 10080)"
              className="font-bold"
              data-testid="input-mute-minutes"
            />
            <Button
              type="submit"
              disabled={mutedMutation.isPending || !(parseInt(muteCustom, 10) >= 1 && parseInt(muteCustom, 10) <= 10080)}
              className="font-bold shrink-0"
              data-testid="button-mute-custom"
            >
              Mute
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={tradeHistoryUser !== null} onOpenChange={(open) => { if (!open) { setTradeHistoryUser(null); setPlayerTrades(null); } }}>
        <DialogContent className="bg-card border-2 border-card-border rounded-3xl max-md:rounded-2xl max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-black font-display text-white uppercase tracking-wide">
              {tradeHistoryUser}'s trades
            </DialogTitle>
          </DialogHeader>
          {playerTrades === null && (
            <div className="flex justify-center py-10">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          )}
          {playerTrades !== null && playerTrades.length === 0 && (
            <p className="text-muted-foreground font-bold text-center py-6">No trades logged for this player.</p>
          )}
          {playerTrades !== null && playerTrades.length > 0 && (
            <div className="flex flex-col gap-4">
              {playerTrades.map((t) => (
                <div key={t.id} className="border-2 border-card-border rounded-2xl p-4 bg-background/40">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <span className="font-black font-display text-white uppercase tracking-wide">
                      Trade #{t.id}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-black uppercase px-2 py-0.5 rounded-lg ${t.status === "active" ? "bg-green-500/20 text-green-400" : t.status === "completed" ? "bg-sky-500/20 text-sky-400" : "bg-secondary text-muted-foreground"}`}>
                        {t.status}
                      </span>
                      <span className="text-xs font-bold text-muted-foreground">
                        {new Date(t.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col md:flex-row gap-3">
                    <OfferCard side={t.sideA} />
                    <OfferCard side={t.sideB} />
                  </div>
                  {t.messages.length > 0 && (
                    <div className="mt-3 border-t-2 border-card-border pt-3 flex flex-col gap-1 max-h-40 overflow-y-auto">
                      {t.messages.map((m, i) => (
                        <p key={i} className="text-sm">
                          <span className="font-black text-white">{m.username}: </span>
                          <span className="text-muted-foreground font-medium break-words">{m.content}</span>
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
});
