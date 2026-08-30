import { Layout } from "@/components/layout/layout";
import { TokenIcon } from "@/components/token-icon";
import { useGetMyBlooks, useGetPacks, useGetRarities, useSellBlooks, useUpdateMe, useCreateBazaarListing, getGetMyBlooksQueryKey, getGetMeQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useMemo } from "react";
import { blookImageAnimation } from "@/lib/rarity";
import { formatNumber } from "@/lib/utils";
import { User, Search, PackageOpen, Store, Lock } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
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
    
    // The 1k gamble pack's only blook (1k) already shows under Miscellaneous,
    // so skip it entirely here to avoid a duplicate/locked section.
    return packs.filter((pack: Pack) => pack.name !== "1k").map((pack: Pack) => {
      // The Miscellaneous "pack" only shows blooks you actually own — its
      // blooks never appear as locked and the section hides when empty.
      const isMisc = pack.name === "Miscellaneous";
      const blooksInPack = pack.blooks.map((def: BlookDef) => {
        const owned = ownedMap.get(def.name);
        return {
          def,
          owned,
          isOwned: !!owned,
        };
      }).filter(b => {
        if (isMisc && !b.isOwned) return false;
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
          description: `You earned ${formatNumber(res.tokensEarned)} tokens.`,
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
    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6 max-md:mb-3">
      <div>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white mb-2 max-md:mb-0 max-md:text-3xl">My Collection</h1>
        <p className="text-lg max-md:text-sm text-muted-foreground font-medium">
          You own {formatNumber(totalOwned)} blooks.
        </p>
      </div>
      <div className="relative w-full md:w-72">
        <Search className="w-5 h-5 max-md:w-4 max-md:h-4 absolute left-4 max-md:left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input 
          placeholder="Search blooks..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-12 max-md:pl-9 h-14 max-md:h-10 rounded-2xl max-md:rounded-xl bg-card border-2 border-card-border font-bold text-lg max-md:text-base shadow-lg"
        />
      </div>
    </div>
  );

  return (
    <Layout title="Blooks" pageHeader={pageHeader}>
      <div className="flex flex-col gap-8">
        {(isLoadingBlooks || isLoadingPacks) ? (
          <div className="flex h-64 items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        ) : (
          blooksByPack.map(({ pack, blooks }) => (
            <div key={pack.name} className="flex flex-col gap-4">
              <div className="flex items-center gap-3 border-b-2 border-card-border pb-2 ml-2">
                <h2 className="text-2xl font-black font-display text-white">{pack.name === "Miscellaneous" ? "Miscellaneous" : `${pack.name} Pack`}</h2>
              </div>
              
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-7 lg:grid-cols-8 xl:grid-cols-10 gap-3 max-md:gap-2">
                {blooks.map(({ def, owned, isOwned }) => {
                  const r = rarities?.find(r => r.name === def.rarity);
                  
                  if (!isOwned) {
                    return (
                      <div 
                        key={def.name} 
                        className="aspect-square rounded-xl bg-black relative overflow-hidden"
                        title="Locked"
                      >
                        <img src={def.image} alt="" className="w-full h-full object-contain brightness-0" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Lock className="w-6 h-6 max-md:w-5 max-md:h-5 text-white/40" />
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div 
                      key={def.name} 
                      className="aspect-square rounded-xl relative overflow-hidden cursor-pointer hover:scale-105 active:scale-95 transition-transform shadow-md"
                      onClick={() => { setSelectedBlook(owned!); setSellQuantity(1); setListPrice(""); }}
                    >
                      <img src={def.image} alt={def.name} className={`w-full h-full object-contain ${blookImageAnimation(def.name)}`} />
                      <div 
                        className="absolute bottom-1 left-1 text-white text-[11px] max-md:text-[10px] font-black min-w-5 h-5 max-md:min-w-4 max-md:h-4 px-1 rounded-full flex items-center justify-center shadow-md border border-black/20 z-10"
                        style={{ backgroundColor: (!r?.color || r.color.toLowerCase() === '#ffffff') ? '#22c55e' : r.color }}
                      >
                        {owned!.quantity}
                      </div>
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
            <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
              <div className="p-6 pb-2 shrink-0">
                <DialogHeader>
                  <DialogTitle className="text-3xl font-black text-center">{selectedBlook.name}</DialogTitle>
                  <DialogDescription className="text-center font-bold uppercase tracking-widest text-sm" style={{ color: r?.color }}>
                    {selectedBlook.rarity}
                  </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col items-center pt-2 pb-6">
                  <div className="w-32 h-32 relative group">
                    <div className="absolute inset-0 rounded-full animate-pulse-glow opacity-20 group-hover:opacity-40 transition-opacity" style={{ color: r?.color }} />
                    <img src={selectedBlook.image} alt={selectedBlook.name} className={`w-full h-full object-contain relative z-10 drop-shadow-2xl hover:scale-110 transition-transform duration-500 ${blookImageAnimation(selectedBlook.name)}`} />
                  </div>
                  
                  <div className="mt-4 flex items-center gap-2 px-4 py-2 bg-secondary/50 rounded-full border border-card-border">
                    <span className="font-bold text-muted-foreground uppercase tracking-widest text-xs">Quantity Owned</span>
                    <span className="font-black text-white text-lg">{formatNumber(selectedBlook.quantity)}</span>
                  </div>
                </div>
              </div>

              <ScrollArea className="flex-1 px-6 pb-6 overflow-y-auto">
                <div className="flex flex-col gap-6">
                  {/* Use Section */}
                  <div className="flex flex-col sm:flex-row items-center gap-4 bg-secondary/20 p-4 rounded-xl border border-card-border">
                    <div className="flex flex-col gap-1 flex-1">
                      <h4 className="font-display text-lg font-black text-white flex items-center gap-2"><User className="w-5 h-5"/> Profile Avatar</h4>
                      <p className="text-xs text-muted-foreground font-bold">Set this blook as your profile picture.</p>
                    </div>
                    <Button 
                      variant="outline" 
                      className="w-full sm:w-auto font-bold h-12 px-8"
                      onClick={handleSetAvatar}
                      disabled={updateMeMutation.isPending}
                    >
                      Set as Avatar
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Sell Section */}
                    <div className="flex flex-col gap-4 bg-secondary/30 p-5 rounded-xl border border-card-border">
                      <div className="flex flex-col gap-1">
                        <h4 className="font-display text-lg font-black text-white flex items-center gap-2"><TokenIcon className="w-5 h-5"/> Sell for Tokens</h4>
                        <p className="text-xs text-muted-foreground font-bold">Instantly sell to the game for tokens.</p>
                      </div>
                      
                      <div className="flex items-center gap-2 w-full mt-2">
                        <Input 
                          type="number" 
                          min={1} 
                          max={selectedBlook.quantity} 
                          value={sellQuantity} 
                          onChange={(e) => setSellQuantity(Math.min(selectedBlook.quantity, Math.max(1, parseInt(e.target.value) || 1)))}
                          className="font-bold h-10 flex-1 min-w-0"
                        />
                        <Button variant="outline" size="sm" onClick={() => setSellQuantity(selectedBlook.quantity)} className="shrink-0 font-black h-10">Max</Button>
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
                    <div className="flex flex-col gap-4 bg-secondary/30 p-5 rounded-xl border border-card-border">
                      <div className="flex flex-col gap-1">
                        <h4 className="font-display text-lg font-black text-white flex items-center gap-2"><Store className="w-5 h-5"/> List on Bazaar</h4>
                        <p className="text-xs text-muted-foreground font-bold">
                          Sell to other players for your own price.
                        </p>
                      </div>

                      <div className="flex items-center gap-2 w-full mt-2">
                        <TokenIcon className="w-5 h-5 text-yellow-400 shrink-0" />
                        <Input 
                          type="number"
                          placeholder="Price..."
                          value={listPrice}
                          onChange={(e) => setListPrice(e.target.value === "" ? "" : Math.min(1000000000, Math.max(1, parseInt(e.target.value) || 0)))}
                          className="font-bold h-10 flex-1 min-w-0"
                          min={1}
                          max={1000000000}
                        />
                      </div>
                      
                      <Button 
                        className="w-full font-black text-lg h-12 bg-primary hover:bg-primary/90 text-primary-foreground mt-auto"
                        onClick={handleListOnBazaar}
                        disabled={createListingMutation.isPending || typeof listPrice !== 'number' || listPrice <= 0 || selectedBlook.quantity < 1}
                      >
                        {createListingMutation.isPending ? "Listing..." : "List Item"}
                      </Button>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </DialogContent>
          );
        })()}
      </Dialog>
    </Layout>
  );
}
