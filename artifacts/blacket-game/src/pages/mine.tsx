import { Layout } from "@/components/layout/layout";
import { useGetMe, useGetBase, getGetBaseQueryKey, useAssignBaseWorker, useClaimBaseTokens, useDismissBaseWorker, useBuyBaseSlot, useGetMyBlooks, useGetRarities, getGetMyBlooksQueryKey, getGetMeQueryKey } from "@workspace/api-client-react";
import { Loader2, Plus, AlertTriangle, Lock, Pickaxe, HardHat, X } from "lucide-react";
import { GiMining } from "react-icons/gi";
import { TokenIcon } from "@/components/token-icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useState, useEffect, useMemo, useRef } from "react";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const RATE_BY_RARITY: Record<string, number> = {
  Common: 1,
  Uncommon: 2,
  Rare: 3,
  Epic: 5,
  Legendary: 8,
  Chroma: 20,
  Unique: 6,
  Mystical: 250,
};

/** Dig rate expressed per second, compact: 4 decimals under 1/s, 2 above. */
function formatPerSecond(ratePerHour: number): string {
  const perSec = ratePerHour / 3600;
  if (perSec >= 1) return perSec.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return perSec.toFixed(4);
}

type MinerInfo = { id: number; blookName: string; rarity: string; image: string; tokenRatePerHour: number; sellValue: number };

/** One hired miner in the crew roster. */
function MinerCard({ worker, color, rateUnit, onDismiss }: { worker: MinerInfo; color?: string; rateUnit: "hr" | "sec"; onDismiss: (worker: MinerInfo) => void }) {
  return (
    <div
      className="relative group bg-card border-2 border-card-border rounded-xl p-2.5 pt-3 flex flex-col items-center gap-1.5 hover:border-primary/50 transition-colors"
      data-testid={`base-worker-${worker.id}`}
    >
      <button
        type="button"
        onClick={() => onDismiss(worker)}
        className="absolute top-1.5 right-1.5 z-10 w-5 h-5 rounded-md bg-black/50 hover:bg-red-600 border border-white/10 flex items-center justify-center transition-opacity opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-100"
        title={`Dismiss for ${(worker.sellValue ?? 0).toLocaleString()} Tokens`}
        data-testid={`button-dismiss-${worker.id}`}
      >
        <X className="w-3 h-3 text-white/80" />
      </button>

      <div className="w-14 h-14 max-md:w-12 max-md:h-12 flex items-center justify-center">
        <img src={worker.image} alt={worker.blookName} className="w-full h-full object-contain drop-shadow-md" />
      </div>
      <div className="w-full flex flex-col items-center gap-0.5 min-w-0">
        <span className="max-w-full truncate text-[10px] font-black text-white uppercase tracking-wider" title={worker.blookName}>
          {worker.blookName}
        </span>
        <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground" style={color ? { color } : undefined}>
          {worker.rarity}
        </span>
      </div>
      <div className="w-full flex items-center justify-center gap-1 bg-secondary/60 border border-card-border rounded-lg px-1.5 py-1">
        <TokenIcon className="w-3 h-3 text-yellow-400" />
        <span className="text-[9px] font-black text-yellow-400 tracking-wider">
          +{rateUnit === "hr" ? `${worker.tokenRatePerHour}/h` : `${formatPerSecond(worker.tokenRatePerHour)}/s`}
        </span>
      </div>
    </div>
  );
}

export default function MinePage() {
  const queryClient = useQueryClient();
  const { data: me, isLoading: meLoading } = useGetMe();
  const { data: base, isLoading: baseLoading } = useGetBase({
    query: {
      queryKey: getGetBaseQueryKey(),
      refetchInterval: 10000, // Sync every 10s
    }
  });

  const [assignOpen, setAssignOpen] = useState(false);
  // Batch selection: blook name -> how many copies to send down this round.
  const [selectedBlooks, setSelectedBlooks] = useState<Record<string, number>>({});

  const { data: myBlooks, isLoading: blooksLoading } = useGetMyBlooks({
    query: { 
      queryKey: getGetMyBlooksQueryKey(),
      enabled: assignOpen
    }
  });

  const { data: rarities } = useGetRarities();
  const rarityColor = (name: string) => {
    const c = rarities?.find((r) => r.name === name)?.color;
    return !c || c.toLowerCase() === "#ffffff" ? undefined : c;
  };

  const claimMutation = useClaimBaseTokens();
  const assignMutation = useAssignBaseWorker();
  const dismissMutation = useDismissBaseWorker();
  const buySlotMutation = useBuyBaseSlot();
  const [dismissTarget, setDismissTarget] = useState<MinerInfo | null>(null);
  const [rateUnit, setRateUnit] = useState<"hr" | "sec">(() =>
    localStorage.getItem("base-rate-unit") === "sec" ? "sec" : "hr",
  );
  const switchRateUnit = (unit: "hr" | "sec") => {
    setRateUnit(unit);
    try { localStorage.setItem("base-rate-unit", unit); } catch { /* display pref only */ }
  };

  // Browser tab reads "Token Mine" while on this page.
  useEffect(() => {
    document.title = "Token Mine";
    return () => { document.title = "Cloaket"; };
  }, []);

  // Live token counter
  const [displayTokens, setDisplayTokens] = useState<number>(0);
  const lastBaseTokensRef = useRef<number>(0);
  const lastUpdateRef = useRef<number>(Date.now());

  useEffect(() => {
    if (base) {
      setDisplayTokens(base.tokensReady);
      lastBaseTokensRef.current = base.tokensReady;
      lastUpdateRef.current = Date.now();
    }
  }, [base]);

  useEffect(() => {
    if (!base || base.tokenRatePerHour === 0) return;
    
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsedMs = now - lastUpdateRef.current;
      const tokensPerMs = base.tokenRatePerHour / (60 * 60 * 1000);
      const earned = elapsedMs * tokensPerMs;
      
      setDisplayTokens(lastBaseTokensRef.current + earned);
    }, 100);
    
    return () => clearInterval(interval);
  }, [base]);

  const handleClaim = () => {
    if (claimMutation.isPending || !base || displayTokens < 1) return;
    
    claimMutation.mutate(undefined, {
      onSuccess: (res) => {
        toast({ title: "Haul Collected", description: `+${Math.floor(res.tokensAwarded)} Tokens hauled up the shaft.` });
        queryClient.setQueryData(getGetBaseQueryKey(), res.base);
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      },
      onError: (err: any) => {
        toast({ title: "Haul failed", description: err?.data?.message || "Failed to collect tokens", variant: "destructive" });
      }
    });
  };

  const handleAssign = () => {
    if (selectedTotal === 0 || assignMutation.isPending) return;
    const blookNames = Object.entries(selectedBlooks).flatMap(([name, count]) => Array(count).fill(name) as string[]);
    assignMutation.mutate({ data: { blookNames } }, {
      onSuccess: (res) => {
        const parts: string[] = [];
        if (res.deployedCount > 0) parts.push(`${res.deployedCount} miner${res.deployedCount === 1 ? " is" : "s are"} now working in the mine`);
        if (res.skippedCount > 0) parts.push(`${res.skippedCount} skipped (not owned)`);
        toast({ title: res.deployedCount > 0 ? "Miners Deployed" : "Nothing deployed", description: `${parts.join(", ")}.` });
        setAssignOpen(false);
        setSelectedBlooks({});
        queryClient.setQueryData(getGetBaseQueryKey(), res.base);
        queryClient.invalidateQueries({ queryKey: getGetMyBlooksQueryKey() });
      },
      onError: (err: any) => {
        toast({ title: "Deployment failed", description: err?.data?.message || "Failed to send the miners down", variant: "destructive" });
      }
    });
  };

  const handleDismiss = () => {
    if (!dismissTarget || dismissMutation.isPending) return;

    dismissMutation.mutate({ workerId: dismissTarget.id }, {
      onSuccess: (res) => {
        toast({ title: "Miner Dismissed", description: `${dismissTarget.blookName} cashed out for ${res.tokensAwarded.toLocaleString()} Tokens.` });
        setDismissTarget(null);
        queryClient.setQueryData(getGetBaseQueryKey(), res.base);
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      },
      onError: (err: any) => {
        toast({ title: "Dismissal failed", description: err?.data?.message || "Failed to dismiss the miner", variant: "destructive" });
      }
    });
  };

  const handleBuySlot = () => {
    if (buySlotMutation.isPending) return;
    buySlotMutation.mutate(undefined, {
      onSuccess: (res) => {
        toast({ title: "Slot purchased!", description: "Your mine can hold one more miner." });
        queryClient.setQueryData(getGetBaseQueryKey(), res.base);
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      },
      onError: (err: any) => {
        toast({ title: "Purchase failed", description: err?.data?.message || "Not enough tokens", variant: "destructive" });
      }
    });
  };

  const availableBlooks = useMemo(() => {
    // Miscellaneous trophies and the 1k gamble blook can't mine (server enforces too).
    return (myBlooks || [])
      .filter(b => b.quantity > 0 && !["Miscellaneous", "1k", "Top"].includes(b.pack ?? ""))
      .sort((a, b) => b.price - a.price);
  }, [myBlooks]);

  const freeSlots = base ? Math.max(0, base.maxWorkers - base.workers.length) : 0;

  const selectedTotal = useMemo(
    () => Object.values(selectedBlooks).reduce((sum, n) => sum + n, 0),
    [selectedBlooks],
  );

  const addBlook = (b: { name: string; quantity: number }) => {
    const current = selectedBlooks[b.name] ?? 0;
    if (current >= b.quantity) return;
    if (selectedTotal >= freeSlots) {
      toast({ title: "No slots left", description: `Only ${freeSlots} miner slot${freeSlots === 1 ? "" : "s"} free — buy a slot to expand.`, variant: "destructive" });
      return;
    }
    setSelectedBlooks({ ...selectedBlooks, [b.name]: current + 1 });
  };

  const removeBlook = (name: string) => {
    setSelectedBlooks((prev) => {
      const current = prev[name] ?? 0;
      if (current <= 1) {
        const { [name]: _gone, ...rest } = prev;
        return rest;
      }
      return { ...prev, [name]: current - 1 };
    });
  };

  if (meLoading || baseLoading) {
    return (
      <Layout title="Mine" fixedHeight="desktop">
        <div className="flex-1 flex items-center justify-center h-full">
          <div className="flex flex-col items-center gap-3">
             <Loader2 className="w-8 h-8 animate-spin text-primary" />
             <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Heading down the shaft...</span>
          </div>
        </div>
      </Layout>
    );
  }

  if (!base?.unlocked) {
    return (
      <Layout title="Mine" fixedHeight="desktop">
        <div className="flex-1 flex items-center justify-center p-6 h-full">
          <div className="max-w-md w-full border-2 border-card-border bg-secondary/40 rounded-2xl p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-secondary border-2 border-card-border rounded-xl flex items-center justify-center mb-6">
               <Lock className="w-8 h-8 text-muted-foreground" />
            </div>
            <h1 className="text-2xl font-black font-display text-white tracking-widest mb-2 uppercase">Mine Sealed</h1>
            <p className="text-sm text-muted-foreground font-bold mb-6">
              The mine entrance is boarded up. It opens at <span className="text-white">Level {base?.levelRequired || 5}</span>.
            </p>
            <div className="w-full bg-card border-2 border-card-border rounded-xl p-4">
              <div className="flex justify-between text-xs font-bold text-muted-foreground mb-2 uppercase tracking-widest">
                <span>Current: Lv {me?.level || 0}</span>
                <span>Required: Lv {base?.levelRequired || 5}</span>
              </div>
              <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary rounded-full transition-all duration-1000"
                  style={{ width: `${Math.min(100, ((me?.level || 0) / (base?.levelRequired || 5)) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Mine" fixedHeight="desktop">
      <div className="flex-1 flex flex-col min-h-0">
        {/* Page header row */}
        <div className="shrink-0 flex items-center justify-between gap-3 pb-3 max-md:pb-2 border-b-2 border-card-border">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 max-md:w-9 max-md:h-9 rounded-xl bg-secondary border-2 border-card-border flex items-center justify-center shrink-0">
              <HardHat className="w-5 h-5 text-yellow-400" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-display font-black text-white uppercase tracking-wider leading-none truncate">Token Mine</span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1 leading-none">Shaft Lv {base.level}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground bg-secondary border-2 border-card-border px-2.5 py-1.5 rounded-lg shrink-0">
              {base.workers.length}/{base.maxWorkers} Miners
            </div>
            <div className="flex items-center bg-secondary border-2 border-card-border rounded-lg overflow-hidden shrink-0" data-testid="toggle-rate-unit">
              <button
                type="button"
                onClick={() => switchRateUnit("hr")}
                className={`px-2 py-1.5 text-[10px] font-black uppercase tracking-wider transition-colors ${rateUnit === "hr" ? "bg-yellow-400 text-yellow-950" : "text-muted-foreground hover:text-white"}`}
                data-testid="button-rate-hr"
              >
                /hr
              </button>
              <button
                type="button"
                onClick={() => switchRateUnit("sec")}
                className={`px-2 py-1.5 text-[10px] font-black uppercase tracking-wider transition-colors ${rateUnit === "sec" ? "bg-yellow-400 text-yellow-950" : "text-muted-foreground hover:text-white"}`}
                data-testid="button-rate-sec"
              >
                /sec
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 flex max-md:flex-col gap-4 max-md:gap-3 min-h-0 mt-4 max-md:mt-3">
          {/* LEFT: production + collected */}
          <div className="w-[300px] max-md:w-full flex flex-col gap-4 max-md:gap-3 shrink-0">
            <div className="relative overflow-hidden bg-secondary/40 border-2 border-card-border rounded-2xl p-4">
              <div className="absolute inset-0 bg-gradient-to-br from-yellow-400/[0.08] to-transparent pointer-events-none" />
              <div className="relative flex items-center gap-3">
                <div className="w-11 h-11 bg-yellow-400/10 border-2 border-yellow-400/25 rounded-xl flex items-center justify-center shrink-0">
                  <GiMining className="w-6 h-6 text-yellow-400" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">Dig Rate</span>
                  <div className="text-3xl max-md:text-2xl font-black text-white font-display truncate leading-none mt-1" data-testid="text-dig-rate">
                    {rateUnit === "hr" ? base.tokenRatePerHour.toLocaleString() : formatPerSecond(base.tokenRatePerHour)}
                    <span className="text-xs text-muted-foreground ml-1.5 uppercase font-sans tracking-widest">{rateUnit === "hr" ? "/ hr" : "/ sec"}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-secondary/40 border-2 border-card-border rounded-2xl p-4 max-md:p-3.5 flex flex-col gap-3 flex-1 max-md:flex-none min-h-[220px] max-md:min-h-[180px]">
              <span className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">Ore Hopper</span>
              <div className="flex-1 bg-black/30 border-2 border-card-border rounded-xl flex flex-col items-center justify-center px-3 py-6 max-md:py-4">
                <div className="flex items-center gap-2.5">
                  <TokenIcon className="w-8 h-8 max-md:w-6 max-md:h-6 text-yellow-400" />
                  <div className="text-4xl max-md:text-3xl font-black font-display text-white tracking-wider flex items-baseline">
                    {Math.floor(displayTokens).toLocaleString()}
                    <span className="text-lg max-md:text-base text-muted-foreground font-sans tracking-normal ml-1">.{(displayTokens % 1).toFixed(2).substring(2)}</span>
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-2.5">Tokens dug up</span>
              </div>
              <Button
                onClick={handleClaim}
                disabled={claimMutation.isPending || displayTokens < 1}
                className="w-full h-12 text-sm font-black uppercase tracking-widest rounded-xl bg-yellow-400 hover:bg-yellow-300 text-yellow-950 border-2 border-yellow-600 shadow-[0_4px_0_rgb(161,98,7)] active:translate-y-1 active:shadow-none transition-all disabled:opacity-50 disabled:shadow-none"
                data-testid="button-claim-base"
              >
                {claimMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Haul Tokens Up"}
              </Button>
            </div>
          </div>

          {/* RIGHT: mining crew roster */}
          <div className="flex-1 bg-secondary/40 border-2 border-card-border rounded-2xl flex flex-col md:min-h-0 md:overflow-hidden">
            <div className="shrink-0 px-4 py-3 max-md:px-3 max-md:py-2.5 border-b-2 border-card-border flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <HardHat className="w-4 h-4 text-yellow-400" />
                <span className="text-xs font-black uppercase tracking-widest text-white">Mining Crew</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  {base.workers.length}/{base.maxWorkers} Hired
                </span>
                <button
                  type="button"
                  onClick={handleBuySlot}
                  disabled={buySlotMutation.isPending || (me?.tokens ?? 0) < base.nextSlotCost}
                  className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-yellow-400/10 border-2 border-yellow-400/30 hover:border-yellow-400 text-[10px] font-black uppercase tracking-wider text-yellow-400 transition-colors disabled:opacity-50 disabled:hover:border-yellow-400/30"
                  title={`Buy one extra miner slot for ${base.nextSlotCost.toLocaleString()} tokens`}
                  data-testid="button-buy-slot"
                >
                  {buySlotMutation.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <>
                      <Plus className="w-3 h-3" />
                      <span>Slot</span>
                      <span className="flex items-center gap-0.5 text-white/80"><TokenIcon className="w-3 h-3" /> {base.nextSlotCost.toLocaleString()}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {base.workers.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-10 px-3">
                <div className="w-16 h-16 rounded-full border-2 border-dashed border-card-border flex items-center justify-center mb-4">
                  <Pickaxe className="w-7 h-7 text-muted-foreground opacity-60" />
                </div>
                <span className="text-sm font-black text-white uppercase tracking-widest mb-1">The Mine Is Silent</span>
                <span className="text-xs font-bold text-muted-foreground max-w-[220px]">Send your first miner down to start digging tokens.</span>
                <Button
                  type="button"
                  onClick={() => setAssignOpen(true)}
                  className="mt-5 h-10 px-5 font-black text-xs uppercase tracking-widest"
                  data-testid="button-first-miner"
                >
                  <Plus className="w-4 h-4 mr-2" /> Send First Miner
                </Button>
              </div>
            ) : (
              <div className="flex-1 md:min-h-0 md:overflow-y-auto custom-scrollbar p-3 max-md:p-2.5">
                <div className="grid grid-cols-[repeat(auto-fill,minmax(126px,1fr))] max-md:grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2.5 max-md:gap-2">
                  {base.workers.map((worker) => (
                    <MinerCard key={worker.id} worker={worker} color={rarityColor(worker.rarity)} rateUnit={rateUnit} onDismiss={setDismissTarget} />
                  ))}

                  {base.workers.length < base.maxWorkers && (
                    <button
                      onClick={() => setAssignOpen(true)}
                      className="min-h-[128px] rounded-xl border-2 border-dashed border-yellow-400/30 hover:border-yellow-400 hover:bg-yellow-400/5 transition-colors flex flex-col items-center justify-center gap-2 group"
                      data-testid="button-add-miner"
                    >
                      <div className="w-9 h-9 rounded-full bg-yellow-400/10 border-2 border-yellow-400/30 group-hover:border-yellow-400 flex items-center justify-center transition-colors">
                        <Plus className="w-4 h-4 text-yellow-400" />
                      </div>
                      <span className="text-[9px] font-black uppercase tracking-widest text-yellow-400/90">Hire Miner</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={!!dismissTarget} onOpenChange={(open) => { if (!open) setDismissTarget(null); }}>
        <DialogContent className="max-w-sm p-0 overflow-hidden">
          <div className="p-4 border-b-2 border-card-border">
            <DialogTitle className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2">
              <Pickaxe className="w-4 h-4 text-yellow-400" /> Dismiss Miner
            </DialogTitle>
          </div>
          <div className="p-4 text-sm font-bold text-muted-foreground leading-relaxed">
            Send <span className="text-white">{dismissTarget?.blookName}</span> home for good? The tunnel closes and you get paid the blook's sell value:
            <span className="inline-flex items-center gap-1 text-yellow-400 font-black ml-1.5 align-middle">
              <TokenIcon className="w-4 h-4" /> {(dismissTarget?.sellValue ?? 0).toLocaleString()}
            </span>
          </div>
          <div className="p-3 border-t-2 border-card-border flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDismissTarget(null)} className="h-9 px-4 text-xs font-black uppercase tracking-wider">Cancel</Button>
            <Button
              onClick={handleDismiss}
              disabled={dismissMutation.isPending}
              className="h-9 px-4 text-xs font-black uppercase tracking-wider bg-red-600 hover:bg-red-500 text-white"
              data-testid="button-confirm-dismiss"
            >
              {dismissMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : null}
              {dismissMutation.isPending ? "Dismissing" : `Dismiss for ${(dismissTarget?.sellValue ?? 0).toLocaleString()}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={assignOpen} onOpenChange={(open) => { if (!open) { setAssignOpen(false); setSelectedBlooks({}); } }}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col max-md:w-[95%] p-0 overflow-hidden">
          <div className="p-4 border-b-2 border-card-border shrink-0">
            <DialogTitle className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2">
               <HardHat className="w-4 h-4 text-yellow-400" /> Send a Miner Down
            </DialogTitle>
            <div className="mt-3 bg-secondary/40 border border-card-border rounded-lg p-3 flex gap-3 items-start">
              <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-black text-white block mb-0.5 uppercase tracking-wider">Miners never return</span>
                <span className="text-muted-foreground font-bold leading-relaxed">Blooks sent into the mine are permanently bound to it and removed from your inventory. They cannot be retrieved.</span>
              </div>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 max-md:p-2 custom-scrollbar">
            {blooksLoading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : availableBlooks.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-60 py-8">
                <span className="font-black text-sm text-white uppercase tracking-widest mb-1">Inventory Empty</span>
                <span className="text-xs font-bold text-muted-foreground">Acquire more blooks from packs.</span>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-2">
                {availableBlooks.map(b => {
                  const count = selectedBlooks[b.name] ?? 0;
                  return (
                    <div
                      key={b.name}
                      className={`relative rounded-xl border-2 transition-all ${count > 0 ? 'border-primary bg-primary/10 z-10' : 'border-card-border bg-secondary/40 hover:border-primary/50'}`}
                    >
                      <button
                        onClick={() => addBlook(b)}
                        className="w-full p-2 flex flex-col items-center gap-1"
                        data-testid={`button-pick-miner-${b.name}`}
                      >
                        <div className="absolute top-1 right-1 bg-card border border-card-border rounded px-1 text-[8px] font-black text-white">x{b.quantity}</div>
                        <div className="w-10 h-10 my-2">
                          <img src={b.image} alt={b.name} className="w-full h-full object-contain" />
                        </div>
                        <div className="w-full flex flex-col text-center">
                          <span className="text-[9px] font-black text-white truncate w-full uppercase tracking-wider" title={b.name}>{b.name}</span>
                          <span className="text-[9px] font-black text-yellow-400 mt-0.5 tracking-widest">
                            +{rateUnit === "hr" ? `${RATE_BY_RARITY[b.rarity] ?? 1}/h` : `${formatPerSecond(RATE_BY_RARITY[b.rarity] ?? 1)}/s`}
                          </span>
                        </div>
                      </button>
                      {count > 0 && (
                        <>
                          <div className="absolute top-1 left-1 bg-primary text-primary-foreground rounded px-1 text-[8px] font-black">{count}×</div>
                          <button
                            onClick={() => removeBlook(b.name)}
                            className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-destructive text-white text-[10px] font-black leading-none flex items-center justify-center"
                            data-testid={`button-unpick-miner-${b.name}`}
                            aria-label={`Remove one ${b.name}`}
                          >−</button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          
          <div className="p-3 border-t-2 border-card-border shrink-0 flex items-center justify-end gap-2">
            {selectedTotal > 0 && (
              <span className="mr-auto text-xs font-bold text-white/70 truncate" data-testid="text-selected-miner-count">
                {selectedTotal} selected · {freeSlots} slot{freeSlots === 1 ? "" : "s"} free
              </span>
            )}
            <Button variant="outline" onClick={() => { setAssignOpen(false); setSelectedBlooks({}); }} className="h-9 px-4 text-xs font-black uppercase tracking-wider">Cancel</Button>
            <Button 
              disabled={selectedTotal === 0 || assignMutation.isPending} 
              onClick={handleAssign}
              className="h-9 px-4 text-xs font-black uppercase tracking-wider bg-red-600 hover:bg-red-500 text-white"
              data-testid="button-confirm-miner"
            >
              {assignMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : null}
              {assignMutation.isPending ? "Sending Down" : selectedTotal > 1 ? `Send Down ${selectedTotal} (Permanent)` : "Send Down (Permanent)"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
