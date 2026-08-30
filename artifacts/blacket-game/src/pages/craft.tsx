import { useEffect, useMemo, useRef, useState } from "react";
import {
  useGetMyBlooks,
  useGetRarities,
  useCraftPreview,
  useCraftBlooks,
  getGetMyBlooksQueryKey,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import type { OwnedBlook, CraftOutcome, CraftResult } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { Loader2, Hammer, Search, X } from "lucide-react";
import cloverImg from "@/assets/clover.png";
import { blookImageAnimation, isHighTierRarity } from "@/lib/rarity";
import { Layout } from "@/components/layout/layout";

const MAX_SLOTS = 5;

export default function CraftPage() {
  const queryClient = useQueryClient();
  const { data: myBlooks, isLoading } = useGetMyBlooks();
  const { data: rarities } = useGetRarities();
  const previewMutation = useCraftPreview();
  const craftMutation = useCraftBlooks();

  const [slots, setSlots] = useState<string[]>([]);
  const [useLuck, setUseLuck] = useState(false);
  const [search, setSearch] = useState("");
  const [outcomes, setOutcomes] = useState<CraftOutcome[]>([]);
  const [luckItems, setLuckItems] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [result, setResult] = useState<CraftResult | null>(null);
  const revealedAtRef = useRef(0);

  const rarityColor = (rarity: string) => rarities?.find((r) => r.name === rarity)?.color ?? "#fff";

  // How many of each blook are already placed in slots.
  const usedCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of slots) m.set(s, (m.get(s) ?? 0) + 1);
    return m;
  }, [slots]);

  const blookByName = useMemo(() => {
    const m = new Map<string, OwnedBlook>();
    myBlooks?.forEach((b) => m.set(b.name, b));
    return m;
  }, [myBlooks]);

  // Refresh the outcome preview whenever the combo changes. Responses are
  // tagged with a request generation so a slow, older response can never
  // overwrite a newer one; outcomes are cleared immediately on edit so the
  // panel never shows chances for a stale combo.
  const previewGenRef = useRef(0);
  const [previewReady, setPreviewReady] = useState(false);
  useEffect(() => {
    const gen = ++previewGenRef.current;
    setOutcomes([]);
    setPreviewReady(false);
    if (slots.length === 0) return;
    previewMutation.mutate(
      { data: { blooks: slots } },
      {
        onSuccess: (r) => {
          if (gen !== previewGenRef.current) return; // stale response
          setOutcomes(r.outcomes);
          setLuckItems(r.luckItems);
          setPreviewReady(true);
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots]);

  const addBlook = (b: OwnedBlook) => {
    if (slots.length >= MAX_SLOTS) return;
    if ((usedCounts.get(b.name) ?? 0) >= b.quantity) return;
    setSlots((s) => [...s, b.name]);
  };

  const removeSlot = (i: number) => setSlots((s) => s.filter((_, idx) => idx !== i));

  const handleCraft = () => {
    if (slots.length < 2 || isAnimating || craftMutation.isPending) return;
    setIsAnimating(true);
    craftMutation.mutate(
      { data: { blooks: slots, useLuck } },
      {
        onSuccess: (r) => {
          setTimeout(() => {
            setResult(r);
            setLuckItems(r.luckItemsLeft);
            setIsAnimating(false);
            revealedAtRef.current = Date.now();
            // Refresh only after the reveal — otherwise the blooks grid
            // updates behind the dialog and spoils the result.
            queryClient.invalidateQueries({ queryKey: getGetMyBlooksQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          }, 1600);
        },
        onError: (err) => {
          setIsAnimating(false);
          toast({
            title: "Craft failed",
            description: (err as any)?.data?.message || "Try again.",
            variant: "destructive",
          });
          queryClient.invalidateQueries({ queryKey: getGetMyBlooksQueryKey() });
        },
      },
    );
  };

  const closeResult = () => {
    setResult(null);
    setSlots([]);
    setUseLuck(false);
  };

  const filteredBlooks = useMemo(() => {
    const list = (myBlooks ?? []).filter((b) => b.quantity > 0);
    if (!search) return list;
    return list.filter((b) => b.name.toLowerCase().includes(search.toLowerCase()));
  }, [myBlooks, search]);

  const resultColor = result ? rarityColor(result.blook.rarity) : "#fff";

  return (
    <Layout title="Craft">
    <div className="flex flex-col h-full min-h-0 gap-3 max-md:gap-2">
      <div className="flex items-center gap-3">
        <h1 className="text-3xl max-md:text-2xl font-black font-display tracking-tight text-white flex items-center gap-2">
          <Hammer className="w-7 h-7 max-md:w-6 max-md:h-6 text-orange-400" /> Craft
        </h1>
        <span className="text-sm max-md:text-xs font-bold text-muted-foreground">
          Put in 2 to 5 blooks — get back 1 of 5 possible blooks. Risky.
        </span>
      </div>

      <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3 flex-1 min-h-0">
        {/* Left: slots + owned blooks picker */}
        <div className="flex flex-col gap-3 min-h-0">
          <div className="bg-card border-2 border-card-border rounded-2xl p-4 max-md:p-3">
            <div className="flex items-center justify-between mb-3">
              <span className="font-black uppercase tracking-wider text-xs text-muted-foreground">
                Ingredients ({slots.length}/{MAX_SLOTS})
              </span>
              {slots.length > 0 && (
                <button onClick={() => setSlots([])} className="text-xs font-bold text-muted-foreground hover:text-white">
                  Clear all
                </button>
              )}
            </div>
            <div className="flex gap-2 justify-center">
              {Array.from({ length: MAX_SLOTS }).map((_, i) => {
                const name = slots[i];
                const def = name ? blookByName.get(name) : null;
                const slotColor = def ? rarityColor(def.rarity) : null;
                return (
                  <button
                    key={i}
                    onClick={() => name && removeSlot(i)}
                    className={`w-14 h-14 max-md:w-12 max-md:h-12 rounded-xl border-2 flex items-center justify-center relative group ${
                      name ? "" : "border-dashed border-card-border bg-secondary/40"
                    }`}
                    style={slotColor ? { borderColor: `${slotColor}99`, backgroundColor: `${slotColor}1a` } : undefined}
                    title={name ? `Remove ${name}` : "Empty slot"}
                  >
                    {def ? (
                      <>
                        <img src={def.image} alt={def.name} className="w-10 h-10 object-contain" />
                        <span className="absolute -top-1.5 -right-1.5 bg-destructive text-white rounded-full w-4 h-4 hidden group-hover:flex items-center justify-center">
                          <X className="w-3 h-3" />
                        </span>
                      </>
                    ) : (
                      <span className="text-2xl text-muted-foreground/40 font-black">+</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-card border-2 border-card-border rounded-2xl p-4 max-md:p-3 flex-1 min-h-0 flex flex-col">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search your blooks..."
                className="pl-9 h-9"
              />
            </div>
            {isLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <ScrollArea className="flex-1 min-h-0 max-h-[300px] max-md:max-h-[240px]">
                <div className="grid grid-cols-5 max-md:grid-cols-4 gap-2 pr-3">
                  {filteredBlooks.map((b) => {
                    const used = usedCounts.get(b.name) ?? 0;
                    const left = b.quantity - used;
                    const disabled = left <= 0 || slots.length >= MAX_SLOTS;
                    return (
                      <button
                        key={b.name}
                        onClick={() => addBlook(b)}
                        disabled={disabled}
                        className={`relative rounded-xl border-2 border-card-border bg-secondary/40 p-2 flex flex-col items-center gap-1 transition-all ${
                          disabled ? "opacity-40" : "hover:border-orange-400/60 hover:bg-orange-400/10"
                        }`}
                        title={`${b.name} (${b.rarity})`}
                      >
                        <img src={b.image} alt={b.name} className={`w-10 h-10 object-contain ${blookImageAnimation(b.name)}`} />
                        <span className="text-[9px] font-bold text-muted-foreground truncate w-full text-center">{b.name}</span>
                        <span className="absolute top-1 right-1 text-[9px] font-black bg-black/60 rounded-full px-1.5" style={{ color: rarityColor(b.rarity) }}>
                          x{left}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {filteredBlooks.length === 0 && (
                  <p className="text-center text-sm font-bold text-muted-foreground py-8">No blooks found</p>
                )}
              </ScrollArea>
            )}
          </div>
        </div>

        {/* Right: outcomes + craft button */}
        <div className="flex flex-col gap-3 min-h-0">
          <div className="bg-card border-2 border-card-border rounded-2xl p-4 max-md:p-3 flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <span className="font-black uppercase tracking-wider text-xs text-muted-foreground">Possible results</span>
              {previewMutation.isPending && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            </div>
            {outcomes.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 text-muted-foreground">
                <Hammer className="w-10 h-10 opacity-30" />
                <p className="font-bold text-sm">Add blooks to see what you could craft.<br />Every combo has its own 5 outcomes and chances.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 flex-1 min-h-0 overflow-y-auto">
                {outcomes.map((o) => {
                  const color = rarityColor(o.rarity);
                  const pct = useLuck ? o.luckChance : o.chance;
                  return (
                    <div key={o.name} className="flex items-center gap-2.5 p-1.5 rounded-xl bg-secondary/50 border border-card-border relative overflow-hidden shrink-0">
                      <div className="absolute inset-y-0 left-0 opacity-10" style={{ width: `${pct}%`, backgroundColor: color }} />
                      <img src={o.image} alt={o.name} className={`w-11 h-11 object-contain relative z-10 ${blookImageAnimation(o.name)}`} style={{ filter: `drop-shadow(0 0 5px ${color}80)` }} />
                      <div className="flex flex-col relative z-10 min-w-0 flex-1">
                        <span className="font-bold text-white text-sm truncate">{o.name}</span>
                        <span className="text-[10px] font-bold uppercase" style={{ color }}>{o.rarity}</span>
                      </div>
                      <span className="font-black font-display text-base relative z-10" style={{ color }}>
                        {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-card border-2 border-card-border rounded-2xl p-3 flex flex-col gap-2">
            <button
              onClick={() => luckItems > 0 && setUseLuck((v) => !v)}
              disabled={luckItems === 0}
              className={`flex items-center justify-between gap-2 max-md:flex-col max-md:items-center max-md:gap-1 px-3 py-1.5 rounded-xl border-2 font-black text-sm transition-all ${
                useLuck
                  ? "border-green-400 bg-green-400/15 text-green-300"
                  : luckItems > 0
                    ? "border-card-border bg-secondary/40 text-muted-foreground hover:border-green-400/50"
                    : "border-card-border bg-secondary/20 text-muted-foreground/50"
              }`}
            >
              <span className="flex items-center gap-2 whitespace-nowrap">
                <img src={cloverImg} alt="Clover" className="w-4 h-4 object-contain" /> 2.5x Craft Luck
              </span>
              <span className="text-[10px] uppercase tracking-wider text-center">
                {luckItems === 0 ? "None — get it from the Starter Bundle" : useLuck ? `ON • ${luckItems} left` : `${luckItems} available`}
              </span>
            </button>
            <Button
              onClick={handleCraft}
              disabled={slots.length < 2 || !previewReady || isAnimating || craftMutation.isPending}
              className="w-full h-10 text-base font-black font-display tracking-wider bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white"
            >
              {isAnimating || craftMutation.isPending ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                <span className="flex items-center gap-2"><Hammer className="w-5 h-5" /> CRAFT — 50 tokens</span>
              )}
            </Button>
            <p className="text-[9px] font-bold text-muted-foreground text-center uppercase tracking-wider">
              Costs 50 tokens per craft. Your ingredient blooks are consumed — win big or lose them!
            </p>
          </div>
        </div>
      </div>

      {/* Craft animation + reveal (pack-opening style) */}
      <Dialog
        open={isAnimating || !!result}
        onOpenChange={(open) => !open && !isAnimating && Date.now() - revealedAtRef.current >= 400 && closeResult()}
      >
        <DialogContent className="sm:max-w-md border-0 bg-transparent shadow-none p-0 overflow-visible flex flex-col items-center justify-center max-md:w-[90vw] [&>button]:hidden">
          <DialogTitle className="sr-only">Crafting</DialogTitle>
          <DialogDescription className="sr-only">Craft result</DialogDescription>
          {isAnimating ? (
            <div className="flex flex-col items-center justify-center">
              <div className="flex items-center justify-center gap-3 max-md:gap-2 mb-8 max-md:mb-5">
                {slots.map((name, i) => {
                  const def = blookByName.get(name);
                  return def ? (
                    <img
                      key={i}
                      src={def.image}
                      alt={def.name}
                      className="w-20 h-20 max-md:w-14 max-md:h-14 object-contain animate-bounce"
                      style={{
                        animationDelay: `${i * 120}ms`,
                        filter: `drop-shadow(0 0 18px ${rarityColor(def.rarity)})`,
                      }}
                    />
                  ) : null;
                })}
              </div>
              <h2 className="text-3xl max-md:text-2xl font-black text-white text-glow animate-pulse">Crafting...</h2>
            </div>
          ) : result ? (
            <div className="flex flex-col items-center text-center w-full animate-in zoom-in duration-500">
              <div
                className="w-[120%] h-[120%] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -z-10 rounded-full blur-[100px] opacity-50"
                style={{ backgroundColor: resultColor }}
              />
              <div className="text-2xl max-md:text-xl font-black mb-8 max-md:mb-4 uppercase tracking-widest text-glow" style={{ color: resultColor }}>
                {result.blook.rarity}
              </div>
              <div className="w-64 h-64 max-md:w-40 max-md:h-40 relative mb-8 max-md:mb-4">
                <img
                  src={result.blook.image}
                  alt={result.blook.name}
                  className={`w-full h-full object-contain drop-shadow-[0_0_30px_currentColor] ${isHighTierRarity(result.blook.rarity) ? "animate-pulse-glow" : ""} ${blookImageAnimation(result.blook.name)}`}
                  style={{ color: resultColor }}
                />
              </div>
              <h2 className="text-5xl max-md:text-3xl font-black text-white mb-2 tracking-tight text-glow">
                {result.blook.name}
              </h2>
              <div className="flex items-center gap-4 mt-6 max-md:mt-3">
                {result.isNew && (
                  <span className="px-4 py-1 rounded-full bg-yellow-500 text-yellow-950 font-black text-sm max-md:text-xs uppercase tracking-wide">
                    New!
                  </span>
                )}
                {result.usedLuck && (
                  <span className="px-4 py-1 rounded-full bg-green-500/20 text-green-300 font-black text-sm max-md:text-xs uppercase tracking-wide flex items-center gap-1">
                    <img src={cloverImg} alt="Clover" className="w-4 h-4 object-contain" /> Lucky Craft
                  </span>
                )}
              </div>
              <div className="mt-10 max-md:mt-6 font-bold text-muted-foreground/70 text-sm uppercase tracking-widest animate-pulse">
                Click anywhere to continue
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
    </Layout>
  );
}
