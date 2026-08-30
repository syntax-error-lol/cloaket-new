const fs = require('fs');

const code = `import { Layout } from "@/components/layout/layout";
import { 
  useGetBazaarListings, useBuyBazaarListing, useGetMe, useGetPacks, useCancelBazaarListing,
  getGetBazaarListingsQueryKey, getGetMeQueryKey, getGetMyBlooksQueryKey 
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatNumber } from "@/lib/utils";
import { Coins, Loader2, Store, Search, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

export default function Bazaar() {
  const { data: listings, isLoading } = useGetBazaarListings();
  const { data: me } = useGetMe();
  const { data: packs } = useGetPacks();
  
  const buyMutation = useBuyBazaarListing();
  const cancelMutation = useCancelBazaarListing();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"blooks" | "listings">("blooks");
  
  const [selectedPackName, setSelectedPackName] = useState<string | null>(null);
  const [selectedBlookName, setSelectedBlookName] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [confirmBuyId, setConfirmBuyId] = useState<number | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<number | null>(null);

  const filteredListings = useMemo(() => {
    if (!listings) return [];
    let result = listings.filter(l => !l.isMine);
    
    if (selectedPackName) {
      result = result.filter(l => l.pack === selectedPackName);
    }
    if (selectedBlookName) {
      result = result.filter(l => l.blookName === selectedBlookName);
    }
    if (search.trim()) {
      result = result.filter(l => l.blookName.toLowerCase().includes(search.toLowerCase()) || l.sellerName.toLowerCase().includes(search.toLowerCase()));
    }

    return result;
  }, [listings, selectedPackName, selectedBlookName, search]);

  const myListings = useMemo(() => {
    if (!listings) return [];
    return listings.filter(l => l.isMine);
  }, [listings]);

  const handleBuy = (id: number) => {
    buyMutation.mutate({ id }, {
      onSuccess: (data) => {
        toast({
          title: "Blook Purchased!",
          description: \`You bought \${data.blookName} for \${formatNumber(data.price)} tokens.\`,
        });
        queryClient.invalidateQueries({ queryKey: getGetBazaarListingsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMyBlooksQueryKey() });
        setConfirmBuyId(null);
      },
      onError: (err) => {
        toast({
          title: "Failed to buy",
          description: (err.data as any)?.message || "Unknown error",
          variant: "destructive"
        });
      }
    });
  };

  const handleCancel = (id: number) => {
    cancelMutation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Listing Canceled" });
        queryClient.invalidateQueries({ queryKey: getGetBazaarListingsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMyBlooksQueryKey() });
        setConfirmCancelId(null);
      },
      onError: (err) => {
        toast({
          title: "Failed to cancel",
          description: (err.data as any)?.message || "Unknown error",
          variant: "destructive"
        });
      }
    });
  };

  if (isLoading || !listings || !me || !packs) {
    return <Layout title="Bazaar" fixedHeight><div className="flex h-full items-center justify-center"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div></Layout>;
  }

  const selectedListingToBuy = listings.find(l => l.id === confirmBuyId);
  const selectedListingToCancel = listings.find(l => l.id === confirmCancelId);

  const selectedPack = packs.find(p => p.name === selectedPackName);

  return (
    <Layout title="Bazaar" fixedHeight>
      <div className="flex flex-col h-full max-w-7xl mx-auto overflow-hidden">
        
        {/* TOP SECTION */}
        <div className="flex flex-col md:flex-row items-start gap-4 shrink-0 mb-4">
          
          {/* Top-Left: Title, Tabs, Tokens */}
          <div className="flex flex-col gap-3 w-full md:w-56 shrink-0">
            <h1 className="text-5xl font-black font-display tracking-tight text-white ml-2">Bazaar</h1>
            <div className="flex flex-col gap-2">
              <Button 
                variant={activeTab === "blooks" ? "default" : "secondary"} 
                className="font-black w-full justify-start px-4 h-11 text-lg"
                onClick={() => setActiveTab("blooks")}
              >
                Blooks
              </Button>
              <Button 
                variant={activeTab === "listings" ? "default" : "secondary"} 
                className="font-black w-full justify-start px-4 h-11 text-lg"
                onClick={() => setActiveTab("listings")}
              >
                My Listings ({myListings.length})
              </Button>
            </div>
            
            <div className="flex flex-col bg-card border border-card-border p-3 rounded-xl shadow-md mt-1">
              <span className="text-[10px] font-bold text-muted-foreground uppercase leading-none mb-1">Your Tokens</span>
              <div className="flex items-center gap-1.5">
                <Coins className="w-5 h-5 text-yellow-400" />
                <span className="text-xl font-black font-display text-yellow-400 leading-none">{formatNumber(me.tokens)}</span>
              </div>
            </div>
          </div>

          {/* Top-Center/Right Area */}
          {activeTab === "blooks" ? (
            <>
              {/* Top-Center: Horizontal Pack Strip */}
              <div className="flex-1 min-w-0 bg-card border border-card-border rounded-xl p-3 shadow-md">
                <ScrollArea className="w-full whitespace-nowrap">
                  <div className="flex w-max space-x-3">
                    {packs.map(pack => (
                      <div 
                        key={pack.name}
                        className={\`w-20 h-24 rounded-lg overflow-hidden cursor-pointer transition-all border-2 relative flex flex-col items-center justify-center group \${selectedPackName === pack.name ? 'border-primary scale-105 shadow-[0_0_15px_rgba(107,59,227,0.5)]' : 'border-transparent hover:border-primary/50'}\`}
                        style={{ background: \`linear-gradient(135deg, \${pack.color1}, \${pack.color2})\` }}
                        onClick={() => {
                          if (selectedPackName === pack.name) {
                            setSelectedPackName(null);
                            setSelectedBlookName(null);
                          } else {
                            setSelectedPackName(pack.name);
                            setSelectedBlookName(null);
                          }
                        }}
                      >
                        <div className="absolute inset-0 bg-black/20" />
                        <img src={pack.image} alt={pack.name} className="w-14 h-14 object-contain relative z-10 group-hover:scale-110 transition-transform" />
                      </div>
                    ))}
                  </div>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              </div>

              {/* Top-Right: Search Input and Clear */}
              <div className="flex flex-col gap-2 w-full md:w-56 shrink-0 bg-card border border-card-border p-3 rounded-xl shadow-md">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input 
                    placeholder="Search listings..." 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 h-10 font-bold bg-secondary/50 border-card-border focus-visible:ring-1"
                  />
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => { setSelectedPackName(null); setSelectedBlookName(null); setSearch(""); }}
                  className="font-bold w-full"
                  disabled={!selectedPackName && !selectedBlookName && !search}
                >
                  <X className="w-4 h-4 mr-2" /> Clear Filters
                </Button>
              </div>
            </>
          ) : (
            <div className="flex-1"></div>
          )}
        </div>

        {/* MIDDLE SECTION: Blooks Filter Grid (Only if Pack is selected) */}
        {activeTab === "blooks" && selectedPack && (
          <div className="bg-secondary/30 border border-card-border rounded-xl p-4 mb-4 shrink-0 shadow-inner w-full">
            <div className="flex flex-wrap justify-center gap-2">
              {selectedPack.blooks.map(blook => (
                <div 
                  key={blook.name}
                  className={\`w-14 h-14 bg-card rounded-lg overflow-hidden cursor-pointer transition-all border relative flex items-center justify-center group \${selectedBlookName === blook.name ? 'border-primary scale-105 bg-primary/20 shadow-[0_0_10px_rgba(107,59,227,0.3)]' : 'border-card-border hover:border-primary/50'}\`}
                  onClick={() => setSelectedBlookName(selectedBlookName === blook.name ? null : blook.name)}
                >
                  <img src={blook.image} alt={blook.name} className="w-10 h-10 object-contain group-hover:scale-110 transition-transform" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* BOTTOM SECTION: Results Panel */}
        {activeTab === "blooks" ? (
          <div className="flex flex-col flex-1 min-h-0 bg-card border border-card-border rounded-xl shadow-md overflow-hidden">
            <div className="p-3 bg-secondary/50 border-b border-card-border shrink-0 flex justify-center items-center">
              <h2 className="text-xl font-black font-display m-0">Results: {filteredListings.length}</h2>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
              {filteredListings.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Store className="w-16 h-16 text-muted-foreground/30 mb-4" />
                  <h2 className="text-2xl font-black text-white mb-2">No listings found</h2>
                  <p className="text-muted-foreground font-bold">Try adjusting your filters.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 pb-4">
                  {filteredListings.map(listing => (
                    <Card key={listing.id} className="overflow-hidden border group bg-secondary/20 hover:border-primary transition-colors cursor-pointer" onClick={() => setConfirmBuyId(listing.id)}>
                      <div className="h-32 bg-secondary/50 relative flex items-center justify-center p-4">
                        <img src={listing.image} alt={listing.blookName} className="h-full w-full object-contain group-hover:scale-110 transition-transform" />
                        <div className="absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] font-black uppercase bg-black/60 text-white backdrop-blur">
                          {listing.rarity}
                        </div>
                      </div>
                      <CardContent className="p-3 flex flex-col gap-2">
                        <div className="flex flex-col">
                          <span className="font-black text-sm text-white truncate">{listing.blookName}</span>
                          <span className="text-[10px] font-bold text-muted-foreground truncate">{listing.sellerName}</span>
                        </div>
                        <div className="font-black text-yellow-400 flex items-center gap-1">
                          <Coins className="w-3.5 h-3.5" /> {formatNumber(listing.price)}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0 bg-card border border-card-border rounded-xl shadow-md overflow-hidden">
            <div className="p-3 bg-secondary/50 border-b border-card-border shrink-0 flex justify-center items-center">
              <h2 className="text-xl font-black font-display m-0">Your Active Listings</h2>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
              {myListings.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Store className="w-16 h-16 text-muted-foreground/30 mb-4" />
                  <h2 className="text-2xl font-black text-white mb-2">No active listings</h2>
                  <p className="text-muted-foreground font-bold">List blooks from your collection to sell them here.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 pb-8">
                  {myListings.map(listing => (
                    <Card key={listing.id} className="overflow-hidden border group bg-secondary/20 hover:border-destructive transition-colors cursor-pointer" onClick={() => setConfirmCancelId(listing.id)}>
                      <div className="h-32 bg-secondary/50 relative flex items-center justify-center p-4">
                        <img src={listing.image} alt={listing.blookName} className="h-full w-full object-contain group-hover:scale-110 transition-transform" />
                        <div className="absolute inset-0 bg-destructive/80 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity backdrop-blur-[2px]">
                          <span className="font-black text-white text-lg drop-shadow-md">Cancel</span>
                        </div>
                      </div>
                      <CardContent className="p-3 flex flex-col gap-2">
                        <div className="flex flex-col">
                          <span className="font-black text-sm text-white truncate">{listing.blookName}</span>
                        </div>
                        <div className="font-black text-yellow-400 flex items-center gap-1">
                          <Coins className="w-3.5 h-3.5" /> {formatNumber(listing.price)}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <Dialog open={!!confirmBuyId} onOpenChange={(open) => !open && setConfirmBuyId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Confirm Purchase</DialogTitle>
          </DialogHeader>
          {selectedListingToBuy && (
            <div className="flex flex-col items-center py-6">
              <img src={selectedListingToBuy.image} alt={selectedListingToBuy.blookName} className="w-32 h-32 object-contain mb-4" />
              <h3 className="text-2xl font-black mb-1 text-white">{selectedListingToBuy.blookName}</h3>
              <p className="text-muted-foreground font-bold mb-6">Buy from {selectedListingToBuy.sellerName}?</p>
              
              <div className="flex items-center justify-center gap-2 text-3xl font-black font-display text-yellow-400 mb-8">
                <Coins className="w-8 h-8" /> {formatNumber(selectedListingToBuy.price)}
              </div>

              <div className="flex gap-4 w-full">
                <Button variant="outline" className="flex-1 font-bold h-12" onClick={() => setConfirmBuyId(null)}>Cancel</Button>
                <Button 
                  className="flex-1 font-black h-12" 
                  onClick={() => handleBuy(selectedListingToBuy.id)}
                  disabled={buyMutation.isPending || me.tokens < selectedListingToBuy.price}
                >
                  {buyMutation.isPending ? "Purchasing..." : "Confirm Buy"}
                </Button>
              </div>
              {me.tokens < selectedListingToBuy.price && (
                <p className="text-red-500 text-sm font-bold mt-4 text-center">You don't have enough tokens.</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmCancelId} onOpenChange={(open) => !open && setConfirmCancelId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Cancel Listing</DialogTitle>
          </DialogHeader>
          {selectedListingToCancel && (
            <div className="flex flex-col items-center py-6">
              <img src={selectedListingToCancel.image} alt={selectedListingToCancel.blookName} className="w-32 h-32 object-contain mb-4" />
              <h3 className="text-2xl font-black mb-1 text-white">{selectedListingToCancel.blookName}</h3>
              <p className="text-muted-foreground font-bold mb-6">Remove this listing and return the blook to your collection?</p>

              <div className="flex gap-4 w-full mt-4">
                <Button variant="outline" className="flex-1 font-bold h-12" onClick={() => setConfirmCancelId(null)}>Keep Listing</Button>
                <Button 
                  variant="destructive"
                  className="flex-1 font-black h-12" 
                  onClick={() => handleCancel(selectedListingToCancel.id)}
                  disabled={cancelMutation.isPending}
                >
                  {cancelMutation.isPending ? "Canceling..." : "Cancel Listing"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
`;
fs.writeFileSync('artifacts/blacket-game/src/pages/bazaar.tsx', code);
