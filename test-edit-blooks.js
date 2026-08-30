const fs = require('fs');

const code = `import { Layout } from "@/components/layout/layout";
import { useGetMyBlooks, useGetPacks, useGetRarities, useSellBlooks, useUpdateMe, useCreateBazaarListing, getGetMyBlooksQueryKey, getGetMeQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useMemo } from "react";
import { formatNumber } from "@/lib/utils";
import { Coins, User, Search, PackageOpen, Store, Lock } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Link } from "wouter";
import type { OwnedBlook, Pack, BlookDef } from "@workspace/api-client-react";

export default function MyBlooks() {
  const { data: myBlooks, isLoading: isLoadingBlooks } = useGetMyBlooks();
  const { data: packs, isLoading: isLoadingPacks } = useGetPacks();
  const { data: rarities } = useGetRarities();
  
  const sellMutation = useSellBlooks();
  const updateMeMutation = useUpdateMe();
  const createListingMutation = useCreateBazaarListing();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [selectedBlook, setSelectedBlook] = useState<OwnedBlook | null>(null);
  const [sellQuantity, setSellQuantity] = useState<number>(1);
  const [listPrice, setListPrice] = useState<number | "">("");

  const ownedMap = useMemo(() => {
    const map = new Map<string, OwnedBlook>();
    if (myBlooks) {
      myBlooks.forEach(b => map.set(b.name, b));
    }
    return map;
  }, [myBlooks]);

  const blooksByPack = useMemo(() => {
    if (!packs) return [];
    
    return packs.map((pack: Pack) => {
      const blooksInPack = pack.blooks.map((def: BlookDef) => {
        const owned = ownedMap.get(def.name);
        return {
          def,
          owned,
          isOwned: !!owned,
        };
      }).filter(b => {
        if (!search) return true;
        return b.def.name.toLowerCase().includes(search.toLowerCase());
      });
      
      return {
        pack,
        blooks: blooksInPack
      };
    }).filter(p => p.blooks.length > 0);
  }, [packs, ownedMap, search]);

  const handleSell = () => {
    if (!selectedBlook) return;
    sellMutation.mutate({ data: { name: selectedBlook.name, quantity: sellQuantity } }, {
      onSuccess: (res) => {
        toast({
          title: "Blooks Sold!",
          description: \`You earned \${formatNumber(res.tokensEarned)} tokens.\`,
        });
        queryClient.invalidateQueries({ queryKey: getGetMyBlooksQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        setSelectedBlook(null);
      },
      onError: (err) => {
        toast({
          title: "Failed to sell",
          description: (err.data as any)?.message || "Unknown error",
          variant: "destructive"
        });
      }
    });
  };

  const handleListOnBazaar = () => {
    if (!selectedBlook || typeof listPrice !== 'number' || listPrice <= 0) return;
    createListingMutation.mutate({ data: { blookName: selectedBlook.name, price: listPrice } }, {
      onSuccess: () => {
        toast({
          title: "Listed on Bazaar!",
          description: "Your blook is now for sale.",
          action: (
            <Button variant="outline" size="sm" asChild>
              <Link href="/bazaar">View Bazaar</Link>
            </Button>
          ),
        });
        queryClient.invalidateQueries({ queryKey: getGetMyBlooksQueryKey() });
        setSelectedBlook(null);
      },
      onError: (err) => {
        toast({
          title: "Failed to list",
          description: (err.data as any)?.message || "Unknown error",
          variant: "destructive"
        });
      }
    });
  };

  const handleSetAvatar = () => {
    if (!selectedBlook) return;
    updateMeMutation.mutate({ data: { avatarBlook: selectedBlook.name } }, {
      onSuccess: () => {
        toast({
          title: "Avatar Updated",
          description: "Your profile picture has been changed.",
        });
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      }
    });
  };

  const totalOwned = myBlooks?.reduce((acc, b) => acc + b.quantity, 0) || 0;

  const pageHeader = (
    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white mb-2">My Collection</h1>
        <p className="text-lg text-muted-foreground font-medium">
          You own {formatNumber(totalOwned)} blooks.
        </p>
      </div>
      <div className="relative w-full md:w-72">
        <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input 
          placeholder="Search blooks..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-12 h-14 rounded-2xl bg-card border-2 border-card-border font-bold text-lg shadow-lg"
        />
      </div>
    </div>
  );

  return (
    <Layout title="Blooks" hidePanel pageHeader={pageHeader}>
      <div className="flex flex-col gap-8">
        {(isLoadingBlooks || isLoadingPacks) ? (
          <div className="flex h-64 items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        ) : (
          blooksByPack.map(({ pack, blooks }) => (
            <div key={pack.name} className="flex flex-col gap-4">
              <div className="flex items-center gap-3 border-b-2 border-card-border pb-2 ml-2">
                <div 
                  className="w-8 h-8 rounded-lg shadow-inner flex items-center justify-center text-white"
                  style={{ background: \`linear-gradient(135deg, \${pack.color1}, \${pack.color2})\` }}
                >
                  <PackageOpen className="w-4 h-4" />
                </div>
                <h2 className="text-2xl font-black font-display text-white">{pack.name} Pack</h2>
              </div>
              
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                {blooks.map(({ def, owned, isOwned }) => {
                  const r = rarities?.find(r => r.name === def.rarity);
                  
                  if (!isOwned) {
                    return (
                      <div 
                        key={def.name} 
                        className="flex flex-col items-center p-3 bg-card border border-card-border rounded-xl opacity-60 relative group overflow-hidden"
                      >
                        <div className="absolute inset-0 bg-black/40 z-10 flex items-center justify-center">
                          <Lock className="w-6 h-6 text-white/50" />
                        </div>
                        <div className="w-16 h-16 relative mb-2">
                          <img src={def.image} alt={def.name} className="w-full h-full object-contain brightness-0 opacity-50" />
                        </div>
                        <span className="font-bold text-sm text-center truncate w-full text-muted-foreground">{def.name}</span>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">{def.rarity}</span>
                      </div>
                    );
                  }

                  return (
                    <div 
                      key={def.name} 
                      className="flex flex-col items-center p-3 bg-card border border-card-border rounded-xl hover:scale-105 transition-all cursor-pointer relative group"
                      onClick={() => { setSelectedBlook(owned!); setSellQuantity(1); setListPrice(""); }}
                      style={{ borderColor: \`\${r?.color}40\` }}
                    >
                      <div 
                        className="absolute -top-2 -right-2 text-white text-xs font-black w-6 h-6 rounded-full flex items-center justify-center shadow-md"
                        style={{ backgroundColor: r?.color || 'var(--primary)' }}
                      >
                        {owned!.quantity}
                      </div>
                      <div className="w-16 h-16 relative mb-2" style={{ filter: \`drop-shadow(0 0 10px \${r?.color}40)\` }}>
                        <img src={def.image} alt={def.name} className="w-full h-full object-contain drop-shadow-xl group-hover:scale-110 transition-transform" />
                      </div>
                      <span className="font-bold text-white text-sm text-center truncate w-full group-hover:text-primary transition-colors">{def.name}</span>
                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: r?.color }}>{def.rarity}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog open={!!selectedBlook} onOpenChange={(open) => !open && setSelectedBlook(null)}>
        {(() => {
          if (!selectedBlook) return null;
          const r = rarities?.find(r => r.name === selectedBlook.rarity);
          return (
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-2xl font-black text-center">{selectedBlook.name}</DialogTitle>
                <DialogDescription className="text-center font-bold uppercase tracking-widest" style={{ color: r?.color }}>
                  {selectedBlook.rarity}
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-col items-center py-6">
                <div className="w-40 h-40 relative group">
                  <div className="absolute inset-0 rounded-full animate-pulse-glow opacity-20 group-hover:opacity-40 transition-opacity" style={{ color: r?.color }} />
                  <img src={selectedBlook.image} alt={selectedBlook.name} className="w-full h-full object-contain relative z-10 drop-shadow-2xl hover:scale-110 transition-transform duration-500" />
                </div>
                
                <div className="mt-6 flex items-center gap-2 px-4 py-2 bg-secondary/50 rounded-full border border-card-border">
                  <span className="font-bold text-muted-foreground uppercase tracking-widest text-xs">Quantity Owned</span>
                  <span className="font-black text-white text-lg">{formatNumber(selectedBlook.quantity)}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-card-border">
                {/* Use Section */}
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <h4 className="font-display text-lg font-black text-white flex items-center gap-2"><User className="w-5 h-5"/> Profile</h4>
                    <p className="text-xs text-muted-foreground font-bold">Set this blook as your profile picture across the game.</p>
                  </div>
                  <Button 
                    variant="outline" 
                    className="w-full font-bold h-12"
                    onClick={handleSetAvatar}
                    disabled={updateMeMutation.isPending}
                  >
                    Set as Avatar
                  </Button>
                </div>

                {/* Sell/Trade Section */}
                <div className="flex flex-col gap-4">
                  {/* Sell Section */}
                  <div className="flex flex-col gap-4 bg-secondary/30 p-4 rounded-xl border border-card-border">
                    <h4 className="font-display text-lg font-black text-white flex items-center gap-2"><Coins className="w-5 h-5"/> Sell for Tokens</h4>
                    <div className="flex items-center gap-2">
                      <Input 
                        type="number" 
                        min={1} 
                        max={selectedBlook.quantity} 
                        value={sellQuantity} 
                        onChange={(e) => setSellQuantity(Math.min(selectedBlook.quantity, Math.max(1, parseInt(e.target.value) || 1)))}
                        className="font-bold h-10"
                      />
                      <Button variant="outline" size="sm" onClick={() => setSellQuantity(selectedBlook.quantity)}>Max</Button>
                    </div>

                    <Button 
                      className="w-full font-black text-lg h-12 bg-red-600 hover:bg-red-500 text-white mt-auto"
                      onClick={handleSell}
                      disabled={sellMutation.isPending || sellQuantity < 1 || sellQuantity > selectedBlook.quantity}
                    >
                      Sell for {formatNumber(selectedBlook.price * sellQuantity)}
                    </Button>
                  </div>

                  {/* List on Bazaar Section */}
                  <div className="flex flex-col gap-4 bg-secondary/30 p-4 rounded-xl border border-card-border">
                    <h4 className="font-display text-lg font-black text-white flex items-center gap-2"><Store className="w-5 h-5"/> List on Bazaar</h4>
                    <p className="text-xs text-muted-foreground font-bold">
                      List one copy for other players to buy.
                    </p>

                    <div className="flex flex-col gap-2 mt-auto">
                      <div className="flex items-center gap-2">
                        <Coins className="w-5 h-5 text-yellow-400" />
                        <Input 
                          type="number"
                          placeholder="Price..."
                          value={listPrice}
                          onChange={(e) => setListPrice(e.target.value === "" ? "" : Math.max(1, parseInt(e.target.value) || 0))}
                          className="font-bold h-10"
                          min={1}
                        />
                      </div>
                      
                      <Button 
                        className="w-full font-black text-lg h-12 bg-primary hover:bg-primary/90 text-primary-foreground"
                        onClick={handleListOnBazaar}
                        disabled={createListingMutation.isPending || typeof listPrice !== 'number' || listPrice <= 0 || selectedBlook.quantity < 1}
                      >
                        {createListingMutation.isPending ? "Listing..." : "List Item"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </DialogContent>
          );
        })()}
      </Dialog>
    </Layout>
  );
}
`

fs.writeFileSync('artifacts/blacket-game/src/pages/blooks.tsx', code);
