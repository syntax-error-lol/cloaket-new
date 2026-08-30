const fs = require('fs');

let content = fs.readFileSync('artifacts/blacket-game/src/pages/admin.tsx', 'utf8');

// 1. Imports
content = content.replace(
  /import \{ Loader2, ShieldAlert, Award, PackageOpen, Search, Sparkles, Check, X \} from "lucide-react";/,
  'import { Loader2, ShieldAlert, Award, PackageOpen, Search, Sparkles, Check, X, Gift, Trash2, AlertTriangle } from "lucide-react";\nimport { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter, DialogHeader } from "@/components/ui/dialog";'
);

const mutations_str = `  const lookupMutation = useAdminLookup();
  const updateBadgesMutation = useAdminUpdateBadges();
  const grantBlookMutation = useAdminGrantBlook();
  const setNameEffectMutation = useAdminSetNameEffect();`;

const new_mutations = mutations_str + `
  const giftAllMutation = useAdminGiftAllBlooks();
  const deletePlayersMutation = useAdminDeletePlayers();`;

content = content.replace(mutations_str, new_mutations);

const effect_state_end = `    });
  };

  // Filters`;

const new_state = `    });
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
        toast({ title: "Success", description: \`Gifted \${qty}x of every blook (\${data?.blooks.length || 0} blooks) to \${giftAllPlayer}.\` });
        setGiftAllPlayer("");
        setGiftAllQuantity("10");
      },
      onError: (err) => {
        toast({ title: "Failed", description: (err?.data as any)?.message || "Error gifting blooks", variant: "destructive" });
      }
    });
  };

  // Delete Players State
  const [deletePlayerSearch, setDeletePlayerSearch] = useState("");
  const [selectedDeletePlayers, setSelectedDeletePlayers] = useState<string[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const toggleDeletePlayer = (username) => {
    setSelectedDeletePlayers(prev => 
      prev.includes(username) ? prev.filter(u => u !== username) : [...prev, username]
    );
  };

  const handleDeletePlayers = () => {
    if (selectedDeletePlayers.length === 0) return;
    deletePlayersMutation.mutate({ data: { password, usernames: selectedDeletePlayers } }, {
      onSuccess: () => {
        toast({ title: "Success", description: \`Deleted players: \${selectedDeletePlayers.join(", ")}\` });
        setSelectedDeletePlayers([]);
        setDeleteConfirmOpen(false);
        refreshData();
      },
      onError: (err) => {
        toast({ title: "Failed", description: (err?.data as any)?.message || "Error deleting players", variant: "destructive" });
      }
    });
  };

  // Filters`;

content = content.replace(effect_state_end, new_state);

const filters_end = `  const filteredEffectPlayers = useMemo(() => {
    if (!data) return [];
    return data.players.filter(p => p.username.toLowerCase().includes(effectPlayerSearch.toLowerCase()));
  }, [data, effectPlayerSearch]);`;

const new_filters = filters_end + `

  const filteredGiftAllPlayers = useMemo(() => {
    if (!data) return [];
    return data.players.filter(p => p.username.toLowerCase().includes(giftAllPlayerSearch.toLowerCase()));
  }, [data, giftAllPlayerSearch]);

  const filteredDeletePlayers = useMemo(() => {
    if (!data) return [];
    return data.players.filter(p => p.username.toLowerCase().includes(deletePlayerSearch.toLowerCase()));
  }, [data, deletePlayerSearch]);`;

content = content.replace(filters_end, new_filters);

const name_effect_section = `                    </Button>
                  </div>
                </div>`;

const new_sections = `                {/* Gift All Blooks Section */}
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
                              className={\`px-3 py-2 rounded-lg text-left transition-colors font-bold \${giftAllPlayer === p.username ? 'bg-primary text-white' : 'hover:bg-secondary text-muted-foreground hover:text-white'}\`}
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

                {/* Delete Players Section */}
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
                                className={\`flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors \${isSelected ? 'bg-red-500/20 border-red-500/50 border text-red-400 font-bold' : 'hover:bg-secondary text-muted-foreground hover:text-white font-bold border border-transparent'}\`}
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
                </div>`;

const parts = content.split(name_effect_section);
if (parts.length >= 2) {
  const lastIndex = parts.length - 1;
  const newContent = parts.slice(0, lastIndex).join(name_effect_section) + name_effect_section + "\n\n" + new_sections + parts[lastIndex];
  content = newContent;
}

const dialog_html = `      {/* Delete Confirmation Dialog */}
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
`;

content = content.replace("      </main>", dialog_html + "      </main>");

fs.writeFileSync('artifacts/blacket-game/src/pages/admin.tsx', content);
console.log("done");
