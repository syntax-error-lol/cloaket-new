import { memo, useState, useMemo, useEffect, useRef } from "react";
import { TokenIcon } from "@/components/token-icon";
import { useAdminLookup, useAdminGrantBlook, useAdminGrantBundle, useAdminGrantMod, useAdminSetNameEffect, useAdminRenamePlayer, useAdminResetPassword, useAdminGiftAllBlooks, useAdminDeletePlayers, useAdminGiveTokens, useAdminGiveTokensAll, useAdminPurgeLinkMessages, useAdminPlayerStats, useAdminCleanupCatalog, useAdminListGrants, useAdminListIpBans, useAdminIpBan, useAdminIpUnban, useAdminSetDiscordLink, useGetDiscordLink } from "@workspace/api-client-react";
import type { AdminIpBanInfo } from "@workspace/api-client-react";
import type { AdminGrantInfo } from "@workspace/api-client-react";
import type { AdminLookup, AdminPlayerStatsResult } from "@workspace/api-client-react";
import { CloaketAiPanel } from "@/components/cloaket-ai-panel";
import { DiscordLinkPanel } from "@/components/discord-link-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Loader2, ShieldAlert, PackageOpen, Search, Sparkles, Check, Gift, Trash2, AlertTriangle, Users } from "lucide-react";
import { nameEffectClass, nameEffectStyle } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

/**
 * All the shared admin tooling (players overview + management console + Cloaket AI).
 * Used by both the admin panel and the owner panel.
 * `allowDelete` — owner-only powers: the Delete Players section and AI delete actions.
 */
export const AdminTools = memo(function AdminTools({ password, allowDelete = false }: { password: string; allowDelete?: boolean }) {
  const [data, setData] = useState<AdminLookup | null>(null);
  const [playerStats, setPlayerStats] = useState<AdminPlayerStatsResult | null>(null);

  const lookupMutation = useAdminLookup();
  const playerStatsMutation = useAdminPlayerStats();
  const grantBlookMutation = useAdminGrantBlook();
  const grantBundleMutation = useAdminGrantBundle();
  const grantModMutation = useAdminGrantMod();
  const setNameEffectMutation = useAdminSetNameEffect();
  const giftAllMutation = useAdminGiftAllBlooks();
  const deletePlayersMutation = useAdminDeletePlayers();

  const refreshPlayerStats = () => {
    playerStatsMutation.mutate({ data: { password } }, {
      onSuccess: (res) => setPlayerStats(res),
    });
  };

  const refreshData = () => {
    lookupMutation.mutate({ data: { password } }, { onSuccess: setData });
    refreshPlayerStats();
  };

  // Load once on mount (password is already validated by the parent page's login).
  const loadedRef = useRef(false);
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    refreshData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Blook Grant State
  const [blookPlayer, setBlookPlayer] = useState("");
  const [blookPlayerSearch, setBlookPlayerSearch] = useState("");
  const [blookSearch, setBlookSearch] = useState("");
  const [blookSelected, setBlookSelected] = useState("");
  const [blookQuantity, setBlookQuantity] = useState("1");

  const handleGrantBlook = () => {
    if (!blookPlayer || !blookSelected) return;
    const qty = parseInt(blookQuantity);
    if (isNaN(qty) || qty < 1 || qty > 100) {
      toast({ title: "Invalid quantity", description: "Quantity must be between 1 and 100.", variant: "destructive" });
      return;
    }
    grantBlookMutation.mutate({ data: { password, username: blookPlayer, blook: blookSelected, quantity: qty } }, {
      onSuccess: () => {
        toast({ title: "Request sent", description: `${qty}x ${blookSelected} for ${blookPlayer} is waiting for owner approval.` });
        setBlookPlayer("");
        setBlookSelected("");
        setBlookQuantity("1");
      },
      onError: (err) => {
        toast({ title: "Failed", description: (err.data as any)?.message || "Error granting blook", variant: "destructive" });
      }
    });
  };

  // Starter Bundle requests
  const [bundlePlayer, setBundlePlayer] = useState("");
  const [bundlePlayerSearch, setBundlePlayerSearch] = useState("");
  const handleGrantBundle = () => {
    if (!bundlePlayer) return;
    grantBundleMutation.mutate({ data: { password, username: bundlePlayer } }, {
      onSuccess: () => {
        toast({ title: "Request sent", description: `Starter Bundle for ${bundlePlayer} is waiting for owner approval.` });
        setBundlePlayer("");
        setBundlePlayerSearch("");
      },
      onError: (err) => {
        toast({ title: "Failed", description: (err.data as any)?.message || "Could not request the Starter Bundle", variant: "destructive" });
      },
    });
  };

  // Mod access is intentionally immediate; only blook and Starter Bundle
  // requests require an owner decision.
  const [modPlayer, setModPlayer] = useState("");
  const handleGrantMod = () => {
    const username = modPlayer.trim();
    if (!username) return;
    grantModMutation.mutate({ data: { password, username } }, {
      onSuccess: (res) => {
        toast({ title: "Mod granted", description: `${res.username} now has the Mod badge and mod-panel access.` });
        setModPlayer("");
        refreshData();
      },
      onError: (err) => {
        toast({ title: "Failed", description: (err.data as any)?.message || "Could not grant Mod access", variant: "destructive" });
      },
    });
  };

  // Name Effect State
  const [effectPlayer, setEffectPlayer] = useState("");
  const [effectPlayerSearch, setEffectPlayerSearch] = useState("");
  const [effectSelected, setEffectSelected] = useState<"rainbow" | "none">("none");

  const handleSetNameEffect = () => {
    if (!effectPlayer) return;
    setNameEffectMutation.mutate({ data: { password, username: effectPlayer, effect: effectSelected } }, {
      onSuccess: () => {
        toast({ title: "Success", description: `Set name effect for ${effectPlayer}.` });
        setEffectPlayer("");
        setEffectSelected("none");
        refreshData();
      },
      onError: (err) => {
        toast({ title: "Failed", description: (err.data as any)?.message || "Error setting effect", variant: "destructive" });
      }
    });
  };

  // Rename Player State
  const renamePlayerMutation = useAdminRenamePlayer();
  const [renamePlayer, setRenamePlayer] = useState("");
  const [renamePlayerSearch, setRenamePlayerSearch] = useState("");
  const [renameNewName, setRenameNewName] = useState("");

  const handleRenamePlayer = () => {
    if (!renamePlayer || !renameNewName.trim()) return;
    renamePlayerMutation.mutate({ data: { password, username: renamePlayer, newUsername: renameNewName.trim() } }, {
      onSuccess: (res) => {
        toast({ title: "Renamed", description: `${res.oldUsername} is now ${res.username}.` });
        setRenamePlayer("");
        setRenameNewName("");
        refreshData();
      },
      onError: (err) => {
        toast({ title: "Failed", description: (err.data as any)?.message || "Error renaming player", variant: "destructive" });
      }
    });
  };

  // Reset Password State
  const resetPasswordMutation = useAdminResetPassword();
  const [resetPlayer, setResetPlayer] = useState("");
  const [resetPlayerSearch, setResetPlayerSearch] = useState("");
  const [resetResult, setResetResult] = useState<{ username: string; newPassword: string } | null>(null);

  const handleResetPassword = () => {
    if (!resetPlayer) return;
    resetPasswordMutation.mutate({ data: { password, username: resetPlayer } }, {
      onSuccess: (res) => {
        setResetResult({ username: res.username, newPassword: res.newPassword });
        setResetPlayer("");
      },
      onError: (err) => {
        toast({ title: "Failed", description: (err.data as any)?.message || "Error resetting password", variant: "destructive" });
      }
    });
  };

  // Gift All State
  const [giftAllPlayer, setGiftAllPlayer] = useState("");
  const [giftAllPlayerSearch, setGiftAllPlayerSearch] = useState("");
  const [giftAllQuantity, setGiftAllQuantity] = useState("10");

  const handleGiftAll = () => {
    if (!giftAllPlayer) return;
    const qty = parseInt(giftAllQuantity);
    if (isNaN(qty) || qty < 1 || qty > 100) {
      toast({ title: "Invalid quantity", description: "Quantity must be between 1 and 100.", variant: "destructive" });
      return;
    }
    giftAllMutation.mutate({ data: { password, username: giftAllPlayer, quantity: qty } }, {
      onSuccess: () => {
        toast({ title: "Success", description: `Gifted ${qty}x of every blook (${data?.blooks.length || 0} blooks) to ${giftAllPlayer}.` });
        setGiftAllPlayer("");
        setGiftAllQuantity("10");
      },
      onError: (err) => {
        toast({ title: "Failed", description: (err?.data as any)?.message || "Error gifting blooks", variant: "destructive" });
      }
    });
  };

  // Tokens State
  const giveTokensMutation = useAdminGiveTokens();
  const [tokensPlayer, setTokensPlayer] = useState("");
  const [tokensPlayerSearch, setTokensPlayerSearch] = useState("");
  const [tokensAmount, setTokensAmount] = useState("1000");

  // Given bundles list
  const listGrantsMutation = useAdminListGrants();
  const [grants, setGrants] = useState<AdminGrantInfo[]>([]);
  const refreshGrants = () => {
    listGrantsMutation.mutate({ data: { password } }, { onSuccess: (res) => setGrants(res.grants) });
  };

  const handleTokens = (direction: 1 | -1) => {
    if (!tokensPlayer) return;
    const amount = parseInt(tokensAmount);
    if (isNaN(amount) || amount < 1 || amount > 1000000000) {
      toast({ title: "Invalid amount", description: "Amount must be between 1 and 1,000,000,000.", variant: "destructive" });
      return;
    }
    giveTokensMutation.mutate({ data: { password, username: tokensPlayer, amount: amount * direction } }, {
      onSuccess: (res) => {
        toast({
          title: "Success",
          description: direction === 1
            ? `Gave ${amount.toLocaleString()} tokens to ${res.username} (now ${res.tokens.toLocaleString()}).`
            : `Removed ${amount.toLocaleString()} tokens from ${res.username} (now ${res.tokens.toLocaleString()}).`,
        });
        setTokensPlayer("");
        setTokensAmount("1000");
      },
      onError: (err) => {
        toast({ title: "Failed", description: (err?.data as any)?.message || "Error updating tokens", variant: "destructive" });
      }
    });
  };

  // Give Tokens To Everyone
  const giveTokensAllMutation = useAdminGiveTokensAll();
  const [tokensAllAmount, setTokensAllAmount] = useState("1000");

  const handleGiveTokensAll = () => {
    const amount = parseInt(tokensAllAmount);
    if (isNaN(amount) || amount < 1 || amount > 1000000000) {
      toast({ title: "Invalid amount", description: "Amount must be between 1 and 1,000,000,000.", variant: "destructive" });
      return;
    }
    giveTokensAllMutation.mutate({ data: { password, amount } }, {
      onSuccess: (res) => {
        toast({ title: "Success", description: `Gave ${amount.toLocaleString()} tokens to ${res.playersUpdated} players.` });
      },
      onError: (err) => {
        toast({ title: "Failed", description: (err?.data as any)?.message || "Error distributing tokens", variant: "destructive" });
      }
    });
  };

  // Delete Players State (owner only)
  const [deletePlayerSearch, setDeletePlayerSearch] = useState("");
  const [selectedDeletePlayers, setSelectedDeletePlayers] = useState<string[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const toggleDeletePlayer = (username: string) => {
    setSelectedDeletePlayers(prev =>
      prev.includes(username) ? prev.filter(u => u !== username) : [...prev, username]
    );
  };

  const handleDeletePlayers = () => {
    if (selectedDeletePlayers.length === 0) return;
    deletePlayersMutation.mutate({ data: { password, usernames: selectedDeletePlayers } }, {
      onSuccess: () => {
        toast({ title: "Success", description: `Deleted players: ${selectedDeletePlayers.join(", ")}` });
        setSelectedDeletePlayers([]);
        setDeleteConfirmOpen(false);
        refreshData();
      },
      onError: (err) => {
        toast({ title: "Failed", description: (err?.data as any)?.message || "Error deleting players", variant: "destructive" });
      }
    });
  };

  // Maintenance
  const cleanupCatalogMutation = useAdminCleanupCatalog();
  const handleCleanupCatalog = () => {
    cleanupCatalogMutation.mutate({ data: { password } }, {
      onSuccess: (res) => {
        toast({ title: "Success", description: `Removed ${res.ownedBlooksDeleted} owned blooks, ${res.unlocksDeleted} unlocks, ${res.listingsDeleted} listings; reset ${res.avatarsCleared} avatars.` });
      },
      onError: (err) => {
        toast({ title: "Failed", description: (err?.data as any)?.message || "Error cleaning up old blooks", variant: "destructive" });
      }
    });
  };

  const purgeLinksMutation = useAdminPurgeLinkMessages();
  const handlePurgeLinks = () => {
    purgeLinksMutation.mutate({ data: { password } }, {
      onSuccess: (res) => {
        toast({ title: "Success", description: `Deleted ${res.messagesDeleted} messages containing links` });
      },
      onError: (err) => {
        toast({ title: "Failed", description: (err?.data as any)?.message || "Error purging link messages", variant: "destructive" });
      }
    });
  };

  // Filters
  const filteredBlookPlayers = useMemo(() => {
    if (!data) return [];
    return data.players.filter(p => p.username.toLowerCase().includes(blookPlayerSearch.toLowerCase()));
  }, [data, blookPlayerSearch]);

  const filteredBundlePlayers = useMemo(() => {
    if (!data) return [];
    return data.players.filter(p => p.username.toLowerCase().includes(bundlePlayerSearch.toLowerCase()));
  }, [data, bundlePlayerSearch]);

  const filteredEffectPlayers = useMemo(() => {
    if (!data) return [];
    return data.players.filter(p => p.username.toLowerCase().includes(effectPlayerSearch.toLowerCase()));
  }, [data, effectPlayerSearch]);

  const filteredRenamePlayers = useMemo(() => {
    if (!data) return [];
    return data.players.filter(p => p.username.toLowerCase().includes(renamePlayerSearch.toLowerCase()));
  }, [data, renamePlayerSearch]);

  const filteredResetPlayers = useMemo(() => {
    if (!data) return [];
    return data.players.filter(p => p.username.toLowerCase().includes(resetPlayerSearch.toLowerCase()));
  }, [data, resetPlayerSearch]);

  const filteredGiftAllPlayers = useMemo(() => {
    if (!data) return [];
    return data.players.filter(p => p.username.toLowerCase().includes(giftAllPlayerSearch.toLowerCase()));
  }, [data, giftAllPlayerSearch]);

  const filteredTokensPlayers = useMemo(() => {
    if (!data) return [];
    return data.players.filter(p => p.username.toLowerCase().includes(tokensPlayerSearch.toLowerCase()));
  }, [data, tokensPlayerSearch]);

  const filteredDeletePlayers = useMemo(() => {
    if (!data) return [];
    return data.players.filter(p => p.username.toLowerCase().includes(deletePlayerSearch.toLowerCase()));
  }, [data, deletePlayerSearch]);

  const filteredBlooks = useMemo(() => {
    if (!data) return [];
    return data.blooks.filter(b => b.name.toLowerCase().includes(blookSearch.toLowerCase()));
  }, [data, blookSearch]);

  if (!data) {
    if (lookupMutation.isError) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <p className="font-bold text-muted-foreground">Couldn't load the admin data.</p>
          <Button onClick={refreshData} className="font-black font-display uppercase tracking-wide rounded-xl">
            Try Again
          </Button>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 max-md:gap-4">
      {/* Players Overview */}
      <div className="bg-card border-2 border-card-border rounded-3xl max-md:rounded-2xl p-6 max-md:p-3 shadow-2xl">
        <div className="flex items-center justify-between mb-6 max-md:mb-3">
          <h2 className="text-2xl max-md:text-xl font-black font-display text-white flex items-center gap-3 max-md:gap-2">
            <Users className="w-6 h-6 max-md:w-5 max-md:h-5 text-green-400" /> Players
          </h2>
          <Button variant="outline" onClick={refreshData} disabled={playerStatsMutation.isPending || lookupMutation.isPending} className="font-bold max-md:h-8 max-md:text-xs">
            {(playerStatsMutation.isPending || lookupMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Refresh
          </Button>
        </div>
        <div className="grid grid-cols-2 max-md:grid-cols-1 gap-6 max-md:gap-3">
          <div className="grid grid-cols-2 gap-4 max-md:gap-3">
            <div className="bg-secondary/30 border-2 border-card-border rounded-2xl p-6 max-md:p-4 flex flex-col items-center justify-center gap-1">
              <span className="text-5xl max-md:text-4xl font-black font-display text-white">{playerStats ? playerStats.totalPlayers.toLocaleString() : "—"}</span>
              <span className="font-bold text-sm uppercase tracking-wider text-muted-foreground text-center">Total Players</span>
            </div>
            <div className="bg-secondary/30 border-2 border-card-border rounded-2xl p-6 max-md:p-4 flex flex-col items-center justify-center gap-1">
              <span className="text-5xl max-md:text-4xl font-black font-display text-green-400">{playerStats ? playerStats.onlineCount.toLocaleString() : "—"}</span>
              <span className="font-bold text-sm uppercase tracking-wider text-muted-foreground text-center">Online Now</span>
            </div>
            <div className="bg-secondary/30 border-2 border-blue-400/30 rounded-2xl p-6 max-md:p-4 flex flex-col items-center justify-center gap-1 col-span-2">
              <span className="text-5xl max-md:text-4xl font-black font-display text-blue-400">{playerStats ? playerStats.purchaseCount.toLocaleString() : "—"}</span>
              <span className="font-bold text-sm uppercase tracking-wider text-muted-foreground text-center">
                Store Purchases{playerStats ? ` · ${playerStats.purchaseBuyers.toLocaleString()} buyer${playerStats.purchaseBuyers === 1 ? "" : "s"}` : ""}
              </span>
            </div>
          </div>
          <div className="bg-secondary/30 border-2 border-card-border rounded-2xl p-4 flex flex-col gap-2">
            <span className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Who's Online (last 5 min)</span>
            <ScrollArea className="h-40 bg-input border border-card-border rounded-xl">
              <div className="p-2 flex flex-col gap-1">
                {playerStats && playerStats.onlinePlayers.length > 0 ? (
                  playerStats.onlinePlayers.map((p) => (
                    <div key={p.username} className="flex items-center justify-between px-3 py-2 rounded-lg">
                      <span className="font-bold text-white flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
                        {p.username}
                      </span>
                      <span className="text-[10px] uppercase font-black text-muted-foreground">
                        {new Date(p.lastSeenAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="px-3 py-6 text-center font-bold text-muted-foreground text-sm">
                    {playerStats ? "No players online right now" : "Loading…"}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>

      <div className="bg-card border-2 border-card-border rounded-3xl max-md:rounded-2xl p-6 max-md:p-3 shadow-2xl">
        <h2 className="text-2xl max-md:text-xl font-black font-display text-white mb-6 max-md:mb-3 flex items-center gap-3 max-md:gap-2">
          <ShieldAlert className="w-6 h-6 max-md:w-5 max-md:h-5 text-primary" /> Management Console
        </h2>

        <div className="grid grid-cols-1 xl:grid-cols-3 max-md:grid-cols-1 gap-6 max-md:gap-4">

          {/* Blooks Section */}
          <div className="bg-secondary/30 border-2 border-card-border rounded-2xl p-6 flex flex-col gap-6 xl:col-span-1">
            <div className="flex items-center gap-3 border-b-2 border-card-border pb-4">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
                <PackageOpen className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-black font-display text-white">Blooks</h2>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Select Player</label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search players..."
                    value={blookPlayerSearch}
                    onChange={e => setBlookPlayerSearch(e.target.value)}
                    className="pl-9 h-12 rounded-xl bg-input border-card-border font-bold"
                  />
                </div>
                <ScrollArea className="h-40 bg-input border border-card-border rounded-xl">
                  <div className="p-2 flex flex-col gap-1">
                    {filteredBlookPlayers.map(p => (
                      <button
                        key={p.username}
                        onClick={() => setBlookPlayer(p.username)}
                        className={`px-3 py-2 rounded-lg text-left transition-colors font-bold ${blookPlayer === p.username ? 'bg-primary text-white' : 'hover:bg-secondary text-muted-foreground hover:text-white'}`}
                      >
                        {p.username}
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              <div className="flex flex-col gap-2">
                <label className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Select Blook</label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search blooks..."
                    value={blookSearch}
                    onChange={e => setBlookSearch(e.target.value)}
                    className="pl-9 h-12 rounded-xl bg-input border-card-border font-bold"
                  />
                </div>
                <ScrollArea className="h-48 bg-input border border-card-border rounded-xl">
                  <div className="p-2 grid grid-cols-2 gap-2">
                    {filteredBlooks.map(blook => (
                      <button
                        key={blook.name}
                        onClick={() => setBlookSelected(blook.name)}
                        className={`flex items-center gap-3 p-2 rounded-lg border-2 transition-all text-left ${blookSelected === blook.name ? 'border-primary bg-primary/20' : 'border-transparent hover:bg-secondary'}`}
                      >
                        <img src={blook.image} alt={blook.name} className="w-10 h-10 object-contain drop-shadow-lg" />
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-white text-sm truncate">{blook.name}</span>
                          <span className="text-[10px] uppercase font-black opacity-80 truncate">{blook.rarity}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              <div className="flex flex-col gap-2">
                <label className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Quantity (1-100)</label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={blookQuantity}
                  onChange={(e) => setBlookQuantity(e.target.value)}
                  className="h-12 rounded-xl bg-input border-card-border font-bold text-lg"
                />
              </div>

              <Button
                onClick={handleGrantBlook}
                disabled={!blookPlayer || !blookSelected || grantBlookMutation.isPending}
                className="h-14 w-full mt-2 font-black font-display text-lg uppercase tracking-wide bg-purple-600 hover:bg-purple-500 rounded-xl"
              >
                {grantBlookMutation.isPending ? <Loader2 className="w-6 h-6 animate-spin" /> : "Request Blook"}
              </Button>
            </div>
          </div>

          {/* Starter Bundle request */}
          <div className="bg-secondary/30 border-2 border-card-border rounded-2xl p-6 flex flex-col gap-6 xl:col-span-1">
            <div className="flex items-center gap-3 border-b-2 border-card-border pb-4">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                <Gift className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl font-black font-display text-white">Starter Bundle</h2>
                <p className="text-xs font-bold text-muted-foreground">Requires owner approval</p>
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Select Player</label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search players..."
                    value={bundlePlayerSearch}
                    onChange={e => setBundlePlayerSearch(e.target.value)}
                    className="pl-9 h-12 rounded-xl bg-input border-card-border font-bold"
                  />
                </div>
                <ScrollArea className="h-48 bg-input border border-card-border rounded-xl">
                  <div className="p-2 flex flex-col gap-1">
                    {filteredBundlePlayers.map(p => (
                      <button
                        key={p.username}
                        onClick={() => setBundlePlayer(p.username)}
                        className={`px-3 py-2 rounded-lg text-left transition-colors font-bold ${bundlePlayer === p.username ? "bg-primary text-white" : "hover:bg-secondary text-muted-foreground hover:text-white"}`}
                      >
                        {p.username}
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>
              <Button
                onClick={handleGrantBundle}
                disabled={!bundlePlayer || grantBundleMutation.isPending}
                className="h-14 w-full mt-auto font-black font-display text-lg uppercase tracking-wide bg-cyan-600 hover:bg-cyan-500 rounded-xl"
              >
                {grantBundleMutation.isPending ? <Loader2 className="w-6 h-6 animate-spin" /> : "Request Bundle"}
              </Button>
            </div>
          </div>

          {/* Mod access */}
          <div className="bg-secondary/30 border-2 border-card-border rounded-2xl p-6 flex flex-col gap-6 xl:col-span-1">
            <div className="flex items-center gap-3 border-b-2 border-card-border pb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl font-black font-display text-white">Grant Mod</h2>
                <p className="text-xs font-bold text-muted-foreground">Badge + mod-panel access</p>
              </div>
            </div>
            <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); handleGrantMod(); }}>
              <div className="flex flex-col gap-2">
                <label className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Username</label>
                <Input
                  value={modPlayer}
                  onChange={(event) => setModPlayer(event.target.value)}
                  placeholder="Player username"
                  className="h-12 rounded-xl bg-input border-card-border font-bold"
                />
              </div>
              <Button
                type="submit"
                disabled={!modPlayer.trim() || grantModMutation.isPending}
                className="h-14 w-full font-black font-display text-lg uppercase tracking-wide bg-emerald-600 hover:bg-emerald-500 rounded-xl"
              >
                {grantModMutation.isPending ? <Loader2 className="w-6 h-6 animate-spin" /> : "Grant Mod"}
              </Button>
            </form>
          </div>

          {/* Tokens Section */}
          <div className="bg-secondary/30 border-2 border-card-border rounded-2xl p-6 flex flex-col gap-6 xl:col-span-1">
            <div className="flex items-center gap-3 border-b-2 border-card-border pb-4">
              <div className="w-10 h-10 rounded-xl bg-yellow-500/20 text-yellow-400 flex items-center justify-center">
                <TokenIcon className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-black font-display text-white">Tokens</h2>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Select Player</label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search players..."
                    value={tokensPlayerSearch}
                    onChange={e => setTokensPlayerSearch(e.target.value)}
                    className="pl-9 h-12 rounded-xl bg-input border-card-border font-bold"
                  />
                </div>
                <ScrollArea className="h-40 bg-input border border-card-border rounded-xl">
                  <div className="p-2 flex flex-col gap-1">
                    {filteredTokensPlayers.map(p => (
                      <button
                        key={p.username}
                        onClick={() => setTokensPlayer(p.username)}
                        className={`px-3 py-2 rounded-lg text-left transition-colors font-bold ${tokensPlayer === p.username ? 'bg-primary text-white' : 'hover:bg-secondary text-muted-foreground hover:text-white'}`}
                      >
                        {p.username}
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              <div className="flex flex-col gap-2">
                <label className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Amount</label>
                <Input
                  type="number"
                  min="1"
                  value={tokensAmount}
                  onChange={(e) => setTokensAmount(e.target.value)}
                  className="h-12 rounded-xl bg-input border-card-border font-bold text-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={() => handleTokens(1)}
                  disabled={!tokensPlayer || giveTokensMutation.isPending}
                  className="h-14 font-black font-display text-lg uppercase tracking-wide bg-yellow-600 hover:bg-yellow-500 rounded-xl"
                >
                  {giveTokensMutation.isPending ? <Loader2 className="w-6 h-6 animate-spin" /> : "Give"}
                </Button>
                <Button
                  onClick={() => handleTokens(-1)}
                  disabled={!tokensPlayer || giveTokensMutation.isPending}
                  className="h-14 font-black font-display text-lg uppercase tracking-wide bg-red-600 hover:bg-red-500 text-white rounded-xl"
                >
                  {giveTokensMutation.isPending ? <Loader2 className="w-6 h-6 animate-spin" /> : "Remove"}
                </Button>
              </div>

              <div className="border-t-2 border-card-border pt-4 mt-2 flex flex-col gap-2">
                <label className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Give To Everyone</label>
                <Input
                  type="number"
                  min="1"
                  value={tokensAllAmount}
                  onChange={(e) => setTokensAllAmount(e.target.value)}
                  className="h-12 rounded-xl bg-input border-card-border font-bold text-lg"
                />
                <Button
                  onClick={handleGiveTokensAll}
                  disabled={giveTokensAllMutation.isPending}
                  className="h-12 w-full font-black font-display uppercase tracking-wide bg-yellow-700 hover:bg-yellow-600 rounded-xl"
                >
                  {giveTokensAllMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Give Tokens To All Players"}
                </Button>
              </div>

              <div className="border-t-2 border-card-border pt-4 mt-2 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Given Bundles ({grants.length})</label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={refreshGrants}
                    disabled={listGrantsMutation.isPending}
                    className="font-bold"
                  >
                    {listGrantsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Load"}
                  </Button>
                </div>
                <div className="max-h-64 overflow-y-auto custom-scrollbar bg-input border border-card-border rounded-xl">
                  <div className="p-2 flex flex-col gap-1">
                    {grants.length === 0 && (
                      <div className="px-3 py-4 text-center font-bold text-muted-foreground text-xs">Press Load to see who gave bundles and who got them.</div>
                    )}
                    {grants.map((g) => (
                      <div key={g.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary text-sm">
                        <span className="font-bold text-cyan-300 truncate">{g.givenBy ?? <span className="text-muted-foreground italic">unknown</span>}</span>
                        <span className="text-[10px] font-black uppercase text-muted-foreground shrink-0">gave it to</span>
                        <span className="font-bold text-white truncate">{g.givenTo ?? <span className="text-muted-foreground italic">deleted</span>}</span>
                        <span className="ml-auto text-[10px] font-bold text-muted-foreground shrink-0">{new Date(g.createdAt).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Name Effect Section */}
          <div className="bg-secondary/30 border-2 border-card-border rounded-2xl p-6 flex flex-col gap-6 xl:col-span-1">
            <div className="flex items-center gap-3 border-b-2 border-card-border pb-4">
              <div className="w-10 h-10 rounded-xl bg-pink-500/20 text-pink-400 flex items-center justify-center">
                <Sparkles className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-black font-display text-white">Name Effect</h2>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Select Player</label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search players..."
                    value={effectPlayerSearch}
                    onChange={e => setEffectPlayerSearch(e.target.value)}
                    className="pl-9 h-12 rounded-xl bg-input border-card-border font-bold"
                  />
                </div>
                <ScrollArea className="h-40 bg-input border border-card-border rounded-xl">
                  <div className="p-2 flex flex-col gap-1">
                    {filteredEffectPlayers.map(p => (
                      <button
                        key={p.username}
                        onClick={() => setEffectPlayer(p.username)}
                        className={`flex items-center justify-between p-2 rounded-lg text-left transition-colors ${effectPlayer === p.username ? 'bg-primary text-white' : 'hover:bg-secondary text-muted-foreground hover:text-white'}`}
                      >
                        <span className={`font-bold ${nameEffectClass(p.nameEffect)}`} style={nameEffectStyle(p.nameEffect)}>{p.username}</span>
                        <span className="text-[10px] uppercase font-black opacity-50">{p.nameEffect || 'None'}</span>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              <div className="flex flex-col gap-2">
                <label className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Select Effect</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setEffectSelected("none")}
                    className={`p-3 rounded-xl border-2 font-bold transition-all ${effectSelected === "none" ? 'border-primary bg-primary/20 text-white' : 'border-card-border bg-input text-muted-foreground hover:border-muted-foreground'}`}
                  >
                    None
                  </button>
                  <button
                    onClick={() => setEffectSelected("rainbow")}
                    className={`p-3 rounded-xl border-2 font-bold transition-all ${effectSelected === "rainbow" ? 'border-primary bg-primary/20 text-rainbow' : 'border-card-border bg-input text-rainbow hover:border-muted-foreground'}`}
                  >
                    Rainbow
                  </button>
                </div>
              </div>

              <Button
                onClick={handleSetNameEffect}
                disabled={!effectPlayer || setNameEffectMutation.isPending}
                className="h-14 w-full mt-2 font-black font-display text-lg uppercase tracking-wide bg-pink-600 hover:bg-pink-500 rounded-xl"
              >
                {setNameEffectMutation.isPending ? <Loader2 className="w-6 h-6 animate-spin" /> : "Set Effect"}
              </Button>
            </div>
          </div>

          {/* Rename Player Section */}
          <div className="bg-secondary/30 border-2 border-card-border rounded-2xl p-6 flex flex-col gap-6 xl:col-span-1">
            <div className="flex items-center gap-3 border-b-2 border-card-border pb-4">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                <Users className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-black font-display text-white">Rename Player</h2>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Select Player</label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search players..."
                    value={renamePlayerSearch}
                    onChange={e => setRenamePlayerSearch(e.target.value)}
                    className="pl-9 h-12 rounded-xl bg-input border-card-border font-bold"
                  />
                </div>
                <ScrollArea className="h-40 bg-input border border-card-border rounded-xl">
                  <div className="p-2 flex flex-col gap-1">
                    {filteredRenamePlayers.map(p => (
                      <button
                        key={p.username}
                        onClick={() => setRenamePlayer(p.username)}
                        className={`flex items-center justify-between p-2 rounded-lg text-left transition-colors ${renamePlayer === p.username ? 'bg-primary text-white' : 'hover:bg-secondary text-muted-foreground hover:text-white'}`}
                      >
                        <span className="font-bold">{p.username}</span>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              <div className="flex flex-col gap-2">
                <label className="font-bold text-sm uppercase tracking-wider text-muted-foreground">New Username</label>
                <Input
                  placeholder="3-20 letters, numbers, _ or -"
                  value={renameNewName}
                  onChange={e => setRenameNewName(e.target.value)}
                  className="h-12 rounded-xl bg-input border-card-border font-bold"
                />
              </div>

              <Button
                onClick={handleRenamePlayer}
                disabled={!renamePlayer || !renameNewName.trim() || renamePlayerMutation.isPending}
                className="h-14 w-full mt-2 font-black font-display text-lg uppercase tracking-wide bg-cyan-600 hover:bg-cyan-500 rounded-xl"
              >
                {renamePlayerMutation.isPending ? <Loader2 className="w-6 h-6 animate-spin" /> : renamePlayer ? `Rename ${renamePlayer}` : "Rename"}
              </Button>
            </div>
          </div>

          {/* Reset Password Section */}
          <div className="bg-secondary/30 border-2 border-card-border rounded-2xl p-6 flex flex-col gap-6 xl:col-span-1">
            <div className="flex items-center gap-3 border-b-2 border-card-border pb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-black font-display text-white">Reset Password</h2>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Select Player</label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search players..."
                    value={resetPlayerSearch}
                    onChange={e => setResetPlayerSearch(e.target.value)}
                    className="pl-9 h-12 rounded-xl bg-input border-card-border font-bold"
                  />
                </div>
                <ScrollArea className="h-40 bg-input border border-card-border rounded-xl">
                  <div className="p-2 flex flex-col gap-1">
                    {filteredResetPlayers.map(p => (
                      <button
                        key={p.username}
                        onClick={() => setResetPlayer(p.username)}
                        className={`flex items-center justify-between p-2 rounded-lg text-left transition-colors ${resetPlayer === p.username ? 'bg-primary text-white' : 'hover:bg-secondary text-muted-foreground hover:text-white'}`}
                      >
                        <span className="font-bold">{p.username}</span>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {resetResult && (
                <div className="bg-amber-500/10 border-2 border-amber-500/40 rounded-xl p-4 text-center">
                  <div className="text-sm font-bold text-muted-foreground uppercase tracking-wider">{resetResult.username}'s new password</div>
                  <div className="text-4xl font-black font-display text-amber-400 tracking-[0.3em] mt-1">{resetResult.newPassword}</div>
                  <div className="text-xs font-semibold text-muted-foreground mt-2">Write it down — it's only shown here.</div>
                </div>
              )}

              <Button
                onClick={handleResetPassword}
                disabled={!resetPlayer || resetPasswordMutation.isPending}
                className="h-14 w-full mt-2 font-black font-display text-lg uppercase tracking-wide bg-amber-600 hover:bg-amber-500 rounded-xl"
              >
                {resetPasswordMutation.isPending ? <Loader2 className="w-6 h-6 animate-spin" /> : resetPlayer ? `Reset ${resetPlayer}'s Password` : "Reset Password"}
              </Button>
            </div>
          </div>

          {/* Gift All Blooks Section */}
          <div className="bg-secondary/30 border-2 border-card-border rounded-2xl p-6 flex flex-col gap-6 xl:col-span-1">
            <div className="flex items-center gap-3 border-b-2 border-card-border pb-4">
              <div className="w-10 h-10 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center">
                <Gift className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-black font-display text-white">Gift All Blooks</h2>
            </div>

            <div className="flex flex-col gap-4 h-full">
              <div className="flex flex-col gap-2">
                <label className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Select Player</label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search players..."
                    value={giftAllPlayerSearch}
                    onChange={e => setGiftAllPlayerSearch(e.target.value)}
                    className="pl-9 h-12 rounded-xl bg-input border-card-border font-bold"
                  />
                </div>
                <ScrollArea className="h-40 bg-input border border-card-border rounded-xl">
                  <div className="p-2 flex flex-col gap-1">
                    {filteredGiftAllPlayers.map(p => (
                      <button
                        key={p.username}
                        onClick={() => setGiftAllPlayer(p.username)}
                        className={`px-3 py-2 rounded-lg text-left transition-colors font-bold ${giftAllPlayer === p.username ? 'bg-primary text-white' : 'hover:bg-secondary text-muted-foreground hover:text-white'}`}
                      >
                        {p.username}
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              <div className="flex flex-col gap-2">
                <label className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Quantity (1-100)</label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={giftAllQuantity}
                  onChange={(e) => setGiftAllQuantity(e.target.value)}
                  className="h-12 rounded-xl bg-input border-card-border font-bold text-lg"
                />
              </div>

              <Button
                onClick={handleGiftAll}
                disabled={!giftAllPlayer || giftAllMutation.isPending}
                className="h-14 w-full mt-auto font-black font-display text-lg uppercase tracking-wide bg-orange-600 hover:bg-orange-500 rounded-xl"
              >
                {giftAllMutation.isPending ? <Loader2 className="w-6 h-6 animate-spin" /> : "Gift All Blooks"}
              </Button>
            </div>
          </div>

          {/* Delete Players Section (owner only) */}
          {allowDelete && (
            <div className="bg-secondary/30 border-2 border-card-border rounded-2xl p-6 flex flex-col gap-6 xl:col-span-1">
              <div className="flex items-center gap-3 border-b-2 border-card-border pb-4">
                <div className="w-10 h-10 rounded-xl bg-red-500/20 text-red-500 flex items-center justify-center">
                  <Trash2 className="w-6 h-6" />
                </div>
                <h2 className="text-2xl font-black font-display text-white">Delete Players</h2>
              </div>

              <div className="flex flex-col gap-4 h-full">
                <div className="flex flex-col gap-2">
                  <label className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Select Players</label>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search players..."
                      value={deletePlayerSearch}
                      onChange={e => setDeletePlayerSearch(e.target.value)}
                      className="pl-9 h-12 rounded-xl bg-input border-card-border font-bold"
                    />
                  </div>
                  <ScrollArea className="h-64 bg-input border border-card-border rounded-xl">
                    <div className="p-2 flex flex-col gap-1">
                      {filteredDeletePlayers.map(p => {
                        const isSelected = selectedDeletePlayers.includes(p.username);
                        return (
                          <button
                            key={p.username}
                            onClick={() => toggleDeletePlayer(p.username)}
                            className={`flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors ${isSelected ? 'bg-red-500/20 border-red-500/50 border text-red-400 font-bold' : 'hover:bg-secondary text-muted-foreground hover:text-white font-bold border border-transparent'}`}
                          >
                            <span>{p.username}</span>
                            {isSelected && <Check className="w-4 h-4 text-red-400" />}
                          </button>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>

                <Button
                  onClick={() => setDeleteConfirmOpen(true)}
                  disabled={selectedDeletePlayers.length === 0}
                  className="h-14 w-full mt-auto font-black font-display text-lg uppercase tracking-wide bg-red-600 hover:bg-red-500 text-white rounded-xl"
                >
                  Delete Selected ({selectedDeletePlayers.length})
                </Button>
              </div>
            </div>
          )}

          {/* Maintenance Section */}
          <div className="bg-secondary/30 border-2 border-card-border rounded-2xl p-6 flex flex-col gap-6 xl:col-span-1">
            <div className="flex items-center gap-3 border-b-2 border-card-border pb-4">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 text-red-500 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-black font-display text-white">Maintenance</h2>
            </div>
            <div className="flex flex-col gap-4">
              <p className="text-sm font-semibold text-muted-foreground">
                Cleanup tools. Wiping all chat or bazaar data lives on the owner panel.
              </p>
              <Button
                onClick={handlePurgeLinks}
                disabled={purgeLinksMutation.isPending}
                className="h-14 w-full font-black font-display text-lg uppercase tracking-wide bg-orange-600 hover:bg-orange-500 text-white rounded-xl"
              >
                Delete All Messages With Links
              </Button>
              <Button
                onClick={handleCleanupCatalog}
                disabled={cleanupCatalogMutation.isPending}
                className="h-14 w-full font-black font-display text-lg uppercase tracking-wide bg-orange-600 hover:bg-orange-500 text-white rounded-xl"
              >
                {cleanupCatalogMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Clean Up Old Blooks"}
              </Button>
            </div>
          </div>

          {/* IP Bans Section */}
          <IpBansPanel password={password} />

          {/* Community Link Section */}
          <DiscordLinkPanel password={password} />

          {/* Cloaket AI Section */}
          <CloaketAiPanel password={password} allowDelete={allowDelete} className="xl:col-span-3" />

        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-md border-red-500/20 bg-background">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-500">
              <AlertTriangle className="w-5 h-5" /> Confirm Deletion
            </DialogTitle>
            <DialogDescription className="font-semibold pt-2 text-muted-foreground">
              Are you sure you want to permanently delete these {selectedDeletePlayers.length} players?
              <br /><br />
              This will permanently remove their accounts, blooks, trades, chat messages, and marketplace listings.
              <strong className="text-white block mt-2">This action cannot be undone.</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="bg-secondary/50 p-3 rounded-lg max-h-32 overflow-y-auto mb-4 font-bold text-sm">
            {selectedDeletePlayers.join(", ")}
          </div>
          <DialogFooter className="flex gap-2 sm:justify-between">
            <Button type="button" variant="outline" onClick={() => setDeleteConfirmOpen(false)} disabled={deletePlayersMutation.isPending}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeletePlayers}
              disabled={deletePlayersMutation.isPending}
              className="font-bold"
            >
              {deletePlayersMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Delete {selectedDeletePlayers.length} Players
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});

export function IpBansPanel({ password }: { password: string }) {
  const listMutation = useAdminListIpBans();
  const banMutation = useAdminIpBan();
  const unbanMutation = useAdminIpUnban();
  const [bans, setBans] = useState<AdminIpBanInfo[]>([]);
  const [banName, setBanName] = useState("");

  const refresh = () => {
    listMutation.mutate({ data: { password } }, { onSuccess: (res) => setBans(res.bans) });
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBan = (e: React.FormEvent) => {
    e.preventDefault();
    const username = banName.trim();
    if (!username) return;
    banMutation.mutate(
      { data: { password, username } },
      {
        onSuccess: (res) => {
          setBans(res.bans);
          setBanName("");
          toast({ title: "IP banned", description: `${username}'s account is banned and no new accounts can be made from their IP.` });
        },
        onError: (err) => {
          toast({ title: "Failed", description: (err.data as any)?.message || "Could not IP ban", variant: "destructive" });
        },
      },
    );
  };

  const handleUnban = (username: string) => {
    unbanMutation.mutate(
      { data: { password, username } },
      {
        onSuccess: (res) => {
          setBans(res.bans);
          toast({ title: "IP ban removed", description: "New accounts can be created from that IP again." });
        },
        onError: (err) => {
          toast({ title: "Failed", description: (err.data as any)?.message || "Could not remove IP ban", variant: "destructive" });
        },
      },
    );
  };

  return (
    <div className="bg-secondary/30 border-2 border-card-border rounded-2xl p-6 flex flex-col gap-4 xl:col-span-3">
      <div className="flex items-center justify-between border-b-2 border-card-border pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-500/20 text-red-500 flex items-center justify-center">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-black font-display text-white">IP Bans</h2>
          <span className="text-xs font-black uppercase text-muted-foreground">{bans.length} active</span>
        </div>
        <Button variant="outline" onClick={refresh} disabled={listMutation.isPending} className="font-bold">
          {listMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Refresh
        </Button>
      </div>
      <p className="text-sm font-semibold text-muted-foreground">
        IP-banning a player bans their account AND blocks new account signups from their last IP. Players who already
        have accounts on that IP (like classmates on a shared school network) are NOT affected and keep playing — the
        list below shows who shares each banned IP so you can double-check.
        <span className="text-amber-400"> Raw IP addresses are only shown with the owner password.</span>
      </p>
      <form className="flex gap-2 max-md:flex-wrap" onSubmit={handleBan}>
        <Input
          value={banName}
          onChange={(e) => setBanName(e.target.value)}
          placeholder="Username to IP ban"
          className="font-bold"
        />
        <Button
          type="submit"
          disabled={!banName.trim() || banMutation.isPending}
          className="font-bold shrink-0 bg-red-600 hover:bg-red-500 text-white"
        >
          {banMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldAlert className="w-4 h-4 mr-2" />}
          IP Ban
        </Button>
      </form>
      <div className="max-h-96 overflow-y-auto custom-scrollbar bg-input border border-card-border rounded-xl">
        <div className="p-2 flex flex-col gap-1">
          {bans.length === 0 && (
            <div className="px-3 py-6 text-center font-bold text-muted-foreground text-sm">No IP bans yet.</div>
          )}
          {bans.map((b) => (
            <div key={b.id} className="flex flex-col gap-1 px-3 py-2 rounded-lg hover:bg-secondary">
              <div className="flex items-center gap-3 max-md:flex-wrap">
                <span className="font-mono font-bold text-white">{b.ip ?? "IP hidden"}</span>
                <span className="text-xs font-bold text-muted-foreground">
                  banned via <span className="text-red-400">{b.bannedUsername}</span> · {new Date(b.createdAt).toLocaleDateString()}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-red-400 hover:text-red-300 font-bold shrink-0"
                  disabled={unbanMutation.isPending}
                  onClick={() => handleUnban(b.bannedUsername)}
                >
                  Unban
                </Button>
              </div>
              {b.sharedAccounts.length > 0 && (
                <div className="text-xs font-bold text-muted-foreground flex flex-wrap gap-1 items-center">
                  <span className="uppercase tracking-wider">On this IP:</span>
                  {b.sharedAccounts.map((s) => (
                    <span
                      key={s.username}
                      className={`px-1.5 py-0.5 rounded ${s.banned ? "bg-red-500/20 text-red-300" : "bg-secondary text-white"}`}
                      title={s.banned ? "Banned account" : "Not banned — still plays normally"}
                    >
                      {s.username}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
