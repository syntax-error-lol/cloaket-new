const fs = require('fs');

const code = `import { useState, useMemo, useEffect } from "react";
import { useAdminLookup, useAdminGrantBlook, useAdminSetNameEffect, useAdminUpdateBadges } from "@workspace/api-client-react";
import type { AdminLookup, Badge } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Loader2, ShieldAlert, Award, PackageOpen, Search, Sparkles, Check, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import logoImg from "@/assets/logo.png";

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [data, setData] = useState<AdminLookup | null>(null);

  const lookupMutation = useAdminLookup();
  const updateBadgesMutation = useAdminUpdateBadges();
  const grantBlookMutation = useAdminGrantBlook();
  const setNameEffectMutation = useAdminSetNameEffect();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    lookupMutation.mutate({ data: { password } }, {
      onSuccess: (res) => {
        setData(res);
        setIsAuthenticated(true);
        toast({ title: "Authenticated", description: "Welcome to the admin panel." });
      },
      onError: (err) => {
        toast({ title: "Error", description: (err.data as any)?.message || "Wrong admin password", variant: "destructive" });
      }
    });
  };

  const refreshData = () => {
    lookupMutation.mutate({ data: { password } }, {
      onSuccess: (res) => {
        setData(res);
      }
    });
  };

  // Badge Grant State
  const [badgePlayer, setBadgePlayer] = useState("");
  const [badgePlayerSearch, setBadgePlayerSearch] = useState("");
  const [selectedAddBadges, setSelectedAddBadges] = useState<string[]>([]);
  const [selectedRemoveBadges, setSelectedRemoveBadges] = useState<string[]>([]);

  // Reset selections when player changes
  useEffect(() => {
    setSelectedAddBadges([]);
    setSelectedRemoveBadges([]);
  }, [badgePlayer]);

  const handleUpdateBadges = () => {
    if (!badgePlayer) return;
    if (selectedAddBadges.length === 0 && selectedRemoveBadges.length === 0) return;
    
    updateBadgesMutation.mutate({ 
      data: { 
        password, 
        username: badgePlayer, 
        add: selectedAddBadges,
        remove: selectedRemoveBadges
      } 
    }, {
      onSuccess: () => {
        toast({ title: "Success", description: \`Updated badges for \${badgePlayer}.\` });
        setSelectedAddBadges([]);
        setSelectedRemoveBadges([]);
        refreshData();
      },
      onError: (err) => {
        toast({ title: "Failed", description: (err.data as any)?.message || "Error updating badges", variant: "destructive" });
      }
    });
  };

  const toggleAddBadge = (name: string) => {
    setSelectedAddBadges(prev => 
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
    // Remove from remove list if it's there
    setSelectedRemoveBadges(prev => prev.filter(n => n !== name));
  };

  const toggleRemoveBadge = (name: string) => {
    setSelectedRemoveBadges(prev => 
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
    // Remove from add list if it's there
    setSelectedAddBadges(prev => prev.filter(n => n !== name));
  };

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
        toast({ title: "Success", description: \`Granted \${qty}x \${blookSelected} to \${blookPlayer}.\` });
        setBlookPlayer("");
        setBlookSelected("");
        setBlookQuantity("1");
      },
      onError: (err) => {
        toast({ title: "Failed", description: (err.data as any)?.message || "Error granting blook", variant: "destructive" });
      }
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
        toast({ title: "Success", description: \`Set name effect for \${effectPlayer}.\` });
        setEffectPlayer("");
        setEffectSelected("none");
        refreshData();
      },
      onError: (err) => {
        toast({ title: "Failed", description: (err.data as any)?.message || "Error setting effect", variant: "destructive" });
      }
    });
  };

  // Filters
  const filteredBadgePlayers = useMemo(() => {
    if (!data) return [];
    return data.players.filter(p => p.username.toLowerCase().includes(badgePlayerSearch.toLowerCase()));
  }, [data, badgePlayerSearch]);

  const filteredBlookPlayers = useMemo(() => {
    if (!data) return [];
    return data.players.filter(p => p.username.toLowerCase().includes(blookPlayerSearch.toLowerCase()));
  }, [data, blookPlayerSearch]);

  const filteredEffectPlayers = useMemo(() => {
    if (!data) return [];
    return data.players.filter(p => p.username.toLowerCase().includes(effectPlayerSearch.toLowerCase()));
  }, [data, effectPlayerSearch]);

  const filteredBlooks = useMemo(() => {
    if (!data) return [];
    return data.blooks.filter(b => b.name.toLowerCase().includes(blookSearch.toLowerCase()));
  }, [data, blookSearch]);

  const selectedPlayerForBadges = useMemo(() => {
    if (!data || !badgePlayer) return null;
    return data.players.find(p => p.username === badgePlayer) || null;
  }, [data, badgePlayer]);

  if (!isAuthenticated || !data) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-checkerboard opacity-20 pointer-events-none" />
        <div className="w-full max-w-md bg-card border-2 border-primary/50 shadow-[0_0_50px_rgba(139,92,246,0.15)] rounded-3xl p-8 relative z-10">
          <div className="flex flex-col items-center gap-4 mb-8">
            <div className="w-20 h-20 rounded-2xl bg-secondary border-2 border-primary overflow-hidden shadow-xl p-2 flex items-center justify-center">
              <img src={logoImg} alt="Logo" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-3xl font-black font-display text-white text-center">
              Admin Gateway
            </h1>
          </div>
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="font-bold text-sm text-muted-foreground uppercase tracking-wider">Access Code</label>
              <Input 
                type="password" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password..."
                className="h-14 bg-input border-card-border rounded-xl font-bold text-lg"
              />
            </div>
            <Button 
              type="submit" 
              disabled={lookupMutation.isPending || !password}
              className="h-14 font-black font-display tracking-widest text-lg uppercase rounded-xl shadow-lg mt-2"
            >
              {lookupMutation.isPending ? <Loader2 className="w-6 h-6 animate-spin" /> : "Authenticate"}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col relative overflow-hidden">
      <div className="absolute inset-0 bg-checkerboard opacity-20 pointer-events-none fixed" />
      
      <header className="bg-card border-b-2 border-card-border p-6 relative z-10 sticky top-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-secondary border border-primary flex items-center justify-center overflow-hidden">
              <img src={logoImg} alt="Logo" className="w-8 h-8 object-contain" />
            </div>
            <h1 className="text-2xl font-black font-display text-white">System Admin</h1>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={refreshData} disabled={lookupMutation.isPending} className="font-bold">
              {lookupMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Refresh Data
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6 md:p-8 relative z-10">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col gap-8">
            <div className="bg-card border-2 border-card-border rounded-3xl p-6 shadow-2xl">
              <h2 className="text-2xl font-black font-display text-white mb-6 flex items-center gap-3">
                <ShieldAlert className="w-6 h-6 text-primary" /> Management Console
              </h2>
              
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                
                {/* Badges Section */}
                <div className="bg-secondary/30 border-2 border-card-border rounded-2xl p-6 flex flex-col gap-6 xl:col-span-1">
                  <div className="flex items-center gap-3 border-b-2 border-card-border pb-4">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center">
                      <Award className="w-6 h-6" />
                    </div>
                    <h2 className="text-2xl font-black font-display text-white">Badges</h2>
                  </div>

                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <label className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Select Player</label>
                      <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input 
                          placeholder="Search players..." 
                          value={badgePlayerSearch}
                          onChange={e => setBadgePlayerSearch(e.target.value)}
                          className="pl-9 h-12 rounded-xl bg-input border-card-border font-bold"
                        />
                      </div>
                      <ScrollArea className="h-40 bg-input border border-card-border rounded-xl">
                        <div className="p-2 flex flex-col gap-1">
                          {filteredBadgePlayers.map(p => (
                            <button
                              key={p.username}
                              onClick={() => setBadgePlayer(p.username)}
                              className={\`flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors \${badgePlayer === p.username ? 'bg-primary text-white' : 'hover:bg-secondary text-muted-foreground hover:text-white'}\`}
                            >
                              <span className="font-bold">{p.username}</span>
                              {p.badges.length > 0 && <span className="text-[10px] uppercase font-black opacity-80">{p.badges.length} badges</span>}
                            </button>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>

                    {badgePlayer && selectedPlayerForBadges && (
                      <div className="flex flex-col gap-2">
                        <label className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Manage Badges</label>
                        <ScrollArea className="h-64 bg-input border border-card-border rounded-xl">
                          <div className="p-2 flex flex-col gap-1">
                            {data.badges.map(badge => {
                              const hasBadge = selectedPlayerForBadges.badges.includes(badge.name);
                              const isAdding = selectedAddBadges.includes(badge.name);
                              const isRemoving = selectedRemoveBadges.includes(badge.name);
                              
                              let stateText = "";
                              let stateClasses = "";
                              
                              if (isAdding) {
                                stateText = "WILL ADD";
                                stateClasses = "border-green-500 bg-green-500/10 text-green-400";
                              } else if (isRemoving) {
                                stateText = "WILL REMOVE";
                                stateClasses = "border-red-500 bg-red-500/10 text-red-400";
                              } else if (hasBadge) {
                                stateText = "OWNED";
                                stateClasses = "border-primary bg-primary/20 text-white";
                              } else {
                                stateText = "UNOWNED";
                                stateClasses = "border-transparent hover:bg-secondary text-muted-foreground";
                              }
                              
                              return (
                                <div key={badge.name} className={\`flex items-center justify-between p-2 rounded-lg border-2 transition-all \${stateClasses}\`}>
                                  <div className="flex items-center gap-3">
                                    <img src={badge.image} alt={badge.name} className="w-8 h-8 object-contain" />
                                    <span className="font-bold text-sm">{badge.name}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] uppercase font-black opacity-80 mr-2">{stateText}</span>
                                    {!hasBadge && !isAdding && (
                                      <Button size="icon" variant="ghost" className="w-8 h-8 bg-green-500/20 text-green-400 hover:bg-green-500 hover:text-white" onClick={() => toggleAddBadge(badge.name)}>
                                        <Check className="w-4 h-4" />
                                      </Button>
                                    )}
                                    {isAdding && (
                                      <Button size="icon" variant="ghost" className="w-8 h-8 bg-muted text-muted-foreground hover:bg-secondary" onClick={() => toggleAddBadge(badge.name)}>
                                        <X className="w-4 h-4" />
                                      </Button>
                                    )}
                                    {hasBadge && !isRemoving && (
                                      <Button size="icon" variant="ghost" className="w-8 h-8 bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white" onClick={() => toggleRemoveBadge(badge.name)}>
                                        <X className="w-4 h-4" />
                                      </Button>
                                    )}
                                    {isRemoving && (
                                      <Button size="icon" variant="ghost" className="w-8 h-8 bg-muted text-muted-foreground hover:bg-secondary" onClick={() => toggleRemoveBadge(badge.name)}>
                                        <Check className="w-4 h-4 text-green-400" />
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </ScrollArea>
                      </div>
                    )}

                    <Button 
                      onClick={handleUpdateBadges}
                      disabled={!badgePlayer || (selectedAddBadges.length === 0 && selectedRemoveBadges.length === 0) || updateBadgesMutation.isPending}
                      className="h-14 w-full mt-2 font-black font-display text-lg uppercase tracking-wide bg-blue-600 hover:bg-blue-500 rounded-xl"
                    >
                      {updateBadgesMutation.isPending ? <Loader2 className="w-6 h-6 animate-spin" /> : "Apply Changes"}
                    </Button>
                  </div>
                </div>

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
                              className={\`px-3 py-2 rounded-lg text-left transition-colors font-bold \${blookPlayer === p.username ? 'bg-primary text-white' : 'hover:bg-secondary text-muted-foreground hover:text-white'}\`}
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
                              className={\`flex items-center gap-3 p-2 rounded-lg border-2 transition-all text-left \${blookSelected === blook.name ? 'border-primary bg-primary/20' : 'border-transparent hover:bg-secondary'}\`}
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
                      {grantBlookMutation.isPending ? <Loader2 className="w-6 h-6 animate-spin" /> : "Grant Blook"}
                    </Button>
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
                              className={\`flex items-center justify-between p-2 rounded-lg text-left transition-colors \${effectPlayer === p.username ? 'bg-primary text-white' : 'hover:bg-secondary text-muted-foreground hover:text-white'}\`}
                            >
                              <span className={\`font-bold \${p.nameEffect === 'rainbow' ? 'text-rainbow' : ''}\`}>{p.username}</span>
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
                          className={\`p-3 rounded-xl border-2 font-bold transition-all \${effectSelected === "none" ? 'border-primary bg-primary/20 text-white' : 'border-card-border bg-input text-muted-foreground hover:border-muted-foreground'}\`}
                        >
                          None
                        </button>
                        <button
                          onClick={() => setEffectSelected("rainbow")}
                          className={\`p-3 rounded-xl border-2 font-bold transition-all \${effectSelected === "rainbow" ? 'border-primary bg-primary/20 text-rainbow' : 'border-card-border bg-input text-rainbow hover:border-muted-foreground'}\`}
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

              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
`;

fs.writeFileSync('artifacts/blacket-game/src/pages/admin.tsx', code);
