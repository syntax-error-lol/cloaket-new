import { useState, useRef, useEffect } from "react";
import { TokenIcon } from "@/components/token-icon";
import { Layout } from "@/components/layout/layout";
import { useGetPacks, useOpenPack, useGetRarities, getGetMeQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/utils";
import { blookImageAnimation } from "@/lib/rarity";
import { Loader2, Info } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader } from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import type { PackOpenResult, Pack } from "@workspace/api-client-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function Market() {
  const { data: packs, isLoading: isLoadingPacks } = useGetPacks();
  const { data: rarities } = useGetRarities();
  const openPackMutation = useOpenPack();
  const queryClient = useQueryClient();

  const [selectedPack, setSelectedPack] = useState<string | null>(null);
  const [openingResult, setOpeningResult] = useState<PackOpenResult | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  const [infoPack, setInfoPack] = useState<Pack | null>(null);

  const pendingResultRef = useRef<PackOpenResult | null>(null);
  const revealTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (revealTimerRef.current !== null) window.clearTimeout(revealTimerRef.current);
  }, []);

  const reveal = (data: PackOpenResult) => {
    if (revealTimerRef.current !== null) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    pendingResultRef.current = null;
    revealedAtRef.current = Date.now();
    setOpeningResult(data);
    setIsAnimating(false);
    queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
  };

  const skipRequestedRef = useRef(false);
  const revealedAtRef = useRef(0);

  // While the opening animation plays, a click anywhere skips the delay.
  useEffect(() => {
    if (!isAnimating) return;
    const onAnyClick = () => {
      if (pendingResultRef.current) {
        reveal(pendingResultRef.current);
      } else {
        skipRequestedRef.current = true;
      }
    };
    window.addEventListener("pointerdown", onAnyClick);
    return () => window.removeEventListener("pointerdown", onAnyClick);
  }, [isAnimating]);

  const handleOpenPack = (packName: string) => {
    setIsAnimating(true);
    setSelectedPack(packName);
    pendingResultRef.current = null;
    skipRequestedRef.current = false;
    openPackMutation.mutate({ name: packName }, {
      onSuccess: (data) => {
        if (skipRequestedRef.current) {
          reveal(data);
          return;
        }
        // Add a slight delay for dramatic effect (click skips it)
        pendingResultRef.current = data;
        revealTimerRef.current = window.setTimeout(() => reveal(data), 1000);
      },
      onError: (err) => {
        setIsAnimating(false);
        setSelectedPack(null);
        toast({
          title: "Failed to open pack",
          description: err.data?.message || "Unknown error",
          variant: "destructive"
        });
      }
    });
  };

  const closeResult = () => {
    setOpeningResult(null);
    setSelectedPack(null);
  };

  // Once the result is shown, a click anywhere dismisses it (no Continue button needed).
  useEffect(() => {
    if (!openingResult) return;
    const onAnyClick = () => {
      // Ignore the same press that skipped the animation (and its trailing
      // click/pointerup) so the blook doesn't flash and instantly vanish.
      if (Date.now() - revealedAtRef.current < 400) return;
      closeResult();
    };
    window.addEventListener("pointerdown", onAnyClick);
    return () => window.removeEventListener("pointerdown", onAnyClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openingResult]);

  if (isLoadingPacks || !packs || !rarities) {
    return <Layout title="Market"><div className="flex h-full items-center justify-center"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div></Layout>;
  }

  const resultRarity = openingResult?.blook ? rarities.find(r => r.name === openingResult.blook!.rarity) : null;
  const isHighTier = resultRarity && ['Legendary', 'Chroma', 'Supreme', 'Unique', 'Mystical', 'Iridescent'].includes(resultRarity.name);

  return (
    <Layout title="Market">
      <div className="flex flex-col gap-8 max-w-6xl mx-auto">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white mb-2">
              Market
            </h1>
            <p className="text-lg text-muted-foreground font-medium">
              Spend your tokens on packs to unlock rare blooks.
            </p>
          </div>
        </header>

        <div className="grid grid-cols-2 max-md:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 sm:gap-6 select-none">
          {packs.filter((pack) => pack.name !== "Miscellaneous").map((pack) => (
            <Card
              key={pack.name}
              className={`overflow-hidden border-2 group hover:border-primary transition-all duration-300 ${isAnimating ? '' : 'cursor-pointer'}`}
              onClick={() => !isAnimating && handleOpenPack(pack.name)}
            >
              <div 
                className="h-40 max-md:h-24 w-full relative flex items-center justify-center overflow-hidden"
                style={{ background: `linear-gradient(135deg, ${pack.color1}, ${pack.color2})` }}
              >
                <div className="absolute inset-0 bg-black/20" />
                <img 
                  src={pack.image} 
                  alt={pack.name} 
                  className="h-32 w-32 max-md:h-20 max-md:w-20 object-contain relative z-10 drop-shadow-xl group-hover:scale-110 transition-transform duration-300"
                />
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="absolute top-2 right-2 z-20 bg-black/40 hover:bg-black/60 text-white rounded-full w-8 h-8 opacity-0 group-hover:opacity-100 max-md:opacity-100 transition-opacity"
                  onClick={(e) => { e.stopPropagation(); setInfoPack(pack); }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <Info className="w-5 h-5 max-md:w-4 max-md:h-4" />
                </Button>
              </div>
              <CardContent className="p-5 max-md:p-3 flex flex-col gap-4 max-md:gap-2">
                <div className="flex flex-col items-center text-center">
                  <h3 className="text-xl max-md:text-sm font-black text-white">{pack.name === "1k" ? `${pack.remaining ?? 0} Left` : `${pack.name} Pack`}</h3>
                </div>
                <Button 
                  className="w-full font-black text-lg max-md:text-sm h-12 max-md:h-8 flex items-center gap-2 max-md:gap-1"
                  onClick={(e) => { e.stopPropagation(); handleOpenPack(pack.name); }}
                  disabled={isAnimating}
                >
                  <TokenIcon className="w-5 h-5 max-md:w-4 max-md:h-4" />
                  {formatNumber(pack.price)}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Dialog open={!!selectedPack && (isAnimating || !!openingResult)} onOpenChange={(open) => !open && !isAnimating && Date.now() - revealedAtRef.current >= 400 && closeResult()}>
        <DialogContent className="sm:max-w-md border-0 bg-transparent shadow-none p-0 overflow-visible flex flex-col items-center justify-center max-md:w-[90vw] select-none">
          <DialogTitle className="sr-only">Pack Opening</DialogTitle>
          <DialogDescription className="sr-only">Pack opening result</DialogDescription>
          
          {isAnimating ? (
            <div className="flex flex-col items-center justify-center animate-pulse">
              <div className="w-48 h-48 max-md:w-32 max-md:h-32 animate-bounce mb-8 drop-shadow-2xl">
                {packs.find(p => p.name === selectedPack)?.image && (
                  <img src={packs.find(p => p.name === selectedPack)?.image} alt="Pack" className="w-full h-full object-contain" />
                )}
              </div>
              <h2 className="text-3xl max-md:text-2xl font-black text-white text-glow">Opening...</h2>
            </div>
          ) : openingResult && !openingResult.blook ? (
            <div className="flex flex-col items-center text-center w-full animate-in zoom-in duration-500">
              <h2 className="text-5xl max-md:text-3xl font-black text-white mb-2 tracking-tight text-glow">
                Nothing!
              </h2>
              <p className="font-bold text-muted-foreground mt-2 max-md:text-sm">
                The pack was empty... better luck next time.
              </p>
              <div className="mt-10 max-md:mt-6 font-bold text-muted-foreground/70 text-sm uppercase tracking-widest animate-pulse">
                Click anywhere to continue
              </div>
            </div>
          ) : openingResult?.blook ? (
            <div className="flex flex-col items-center text-center w-full animate-in zoom-in duration-500">
              <div 
                className="w-[120%] h-[120%] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -z-10 rounded-full blur-[100px] opacity-50"
                style={{ backgroundColor: resultRarity?.color || '#fff' }}
              />
              
              <div className="text-2xl max-md:text-xl font-black mb-8 max-md:mb-4 uppercase tracking-widest text-glow" style={{ color: resultRarity?.color }}>
                {openingResult.blook.rarity}
              </div>

              <div className="w-64 h-64 max-md:w-40 max-md:h-40 relative mb-8 max-md:mb-4 group">
                <img 
                  src={openingResult.blook.image} 
                  alt={openingResult.blook.name} 
                  className={`w-full h-full object-contain drop-shadow-[0_0_30px_currentColor] ${isHighTier ? 'animate-pulse-glow' : ''} ${blookImageAnimation(openingResult.blook.name)}`}
                  style={{ color: resultRarity?.color }}
                />
              </div>

              <h2 className="text-5xl max-md:text-3xl font-black text-white mb-2 tracking-tight text-glow">
                {openingResult.blook.name}
              </h2>

              <div className="flex items-center gap-4 mt-6 max-md:mt-3">
                {openingResult.isNew && (
                  <span className="px-4 py-1 rounded-full bg-yellow-500 text-yellow-950 font-black text-sm max-md:text-xs uppercase tracking-wide">
                    New!
                  </span>
                )}
                <span className="font-bold text-muted-foreground bg-card/80 backdrop-blur px-4 py-1.5 rounded-full border border-card-border max-md:text-sm">
                  +{openingResult.experience} XP
                </span>
              </div>

              <div className="mt-10 max-md:mt-6 font-bold text-muted-foreground/70 text-sm uppercase tracking-widest animate-pulse">
                Click anywhere to continue
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={!!infoPack} onOpenChange={(open) => !open && setInfoPack(null)}>
        <DialogContent className="sm:max-w-md max-md:w-[95vw] max-md:p-4 max-md:rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl max-md:text-xl font-black">{infoPack?.name === "1k" ? `${infoPack.remaining ?? 0} Left` : `${infoPack?.name} Pack`} - Drop Rates</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4 mt-2">
            <div className="flex flex-col gap-2">
              {infoPack?.name === "1k" && (
                <div className="flex items-center justify-between p-2 rounded-lg bg-secondary border border-card-border">
                  <div className="flex flex-col">
                    <span className="font-bold text-white text-sm">Nothing</span>
                    <span className="text-[10px] font-bold uppercase text-muted-foreground">Empty</span>
                  </div>
                  <span className="font-black font-display text-lg text-muted-foreground">
                    99.5%
                  </span>
                </div>
              )}
              {infoPack?.blooks.map((blook) => {
                const rarityColor = rarities?.find(r => r.name === blook.rarity)?.color || '#ffffff';
                return (
                  <div key={blook.name} className="flex items-center justify-between p-2 rounded-lg bg-secondary border border-card-border">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 shrink-0">
                        <img src={blook.image} alt={blook.name} className={`w-full h-full object-contain drop-shadow-md ${blookImageAnimation(blook.name)}`} style={{ filter: `drop-shadow(0 0 5px ${rarityColor}80)` }} />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-bold text-white text-sm">{blook.name}</span>
                        <span className="text-[10px] font-bold uppercase" style={{ color: rarityColor }}>{blook.rarity}</span>
                      </div>
                    </div>
                    <span className="font-black font-display text-lg" style={{ color: rarityColor }}>
                      {infoPack?.name === "1k" ? "0.5" : Number(blook.chance).toString()}%
                    </span>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}