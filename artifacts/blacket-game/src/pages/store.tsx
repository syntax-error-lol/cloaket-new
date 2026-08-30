import { TokenIcon } from "@/components/token-icon";
import { Button } from "@/components/ui/button";
import {
  useGetStoreOffer,
  useCreateStoreCheckout,
  useClaimStorePurchase,
  useClaimFreeStoreBundle,
  getGetStoreOfferQueryKey,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { Loader2, Crown, ShieldCheck, Sparkles, ChevronsUp, Paintbrush, IdCard } from "lucide-react";
import cloverImg from "@/assets/clover.png";
import { formatNumber } from "@/lib/utils";

export default function StorePage() {
  const queryClient = useQueryClient();
  const checkoutMutation = useCreateStoreCheckout();
  const claimMutation = useClaimStorePurchase();
  const freeClaimMutation = useClaimFreeStoreBundle();
  const [claimedBlooks, setClaimedBlooks] = useState<
    { name: string; rarity: string; image: string | null }[]
  >([]);
  const claimAttempted = useRef(false);

  const { data: offer, isLoading } = useGetStoreOffer({
    query: { queryKey: getGetStoreOfferQueryKey() },
  });

  // A random Chroma is previewed each time the store is opened — it's an
  // example of what you COULD get, not necessarily the one you'll receive.
  const previewChroma = useMemo(() => {
    const list = offer?.chromaBlooks ?? [];
    if (list.length === 0) return null;
    return list[Math.floor(Math.random() * list.length)]!;
  }, [offer?.chromaBlooks]);

  // Returning from Stripe: ?session_id=... means the payment finished —
  // verify it with the server and grant the rewards.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    if (params.get("cancelled")) {
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }
    if (!sessionId || claimAttempted.current) return;
    claimAttempted.current = true;
    claimMutation.mutate(
      { data: { sessionId } },
      {
        onSuccess: (result) => {
          window.history.replaceState({}, "", window.location.pathname);
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetStoreOfferQueryKey() });
          if (!result.alreadyClaimed) {
            setClaimedBlooks(result.blooks);
            const names = result.blooks.map((b) => `${b.name} (${b.rarity})`).join(" + ");
            toast({
              title: "Purchase complete!",
              description: `+${formatNumber(result.tokens)} tokens, golden username, Cloaket+ badge${names ? `, and ${names}!` : "!"}`,
            });
          }
        },
        onError: (err) => {
          window.history.replaceState({}, "", window.location.pathname);
          toast({
            title: "Couldn't verify purchase",
            description: (err as any)?.data?.message || "Please contact support.",
            variant: "destructive",
          });
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBuy = () => {
    if (offer?.freeForYou) {
      freeClaimMutation.mutate(undefined, {
        onSuccess: (result) => {
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetStoreOfferQueryKey() });
          setClaimedBlooks(result.blooks);
          const names = result.blooks.map((b) => `${b.name} (${b.rarity})`).join(" + ");
          toast({
            title: "Bundle claimed!",
              description: `+${formatNumber(result.tokens)} tokens, golden username, Cloaket+ badge${names ? `, and ${names}!` : "!"}`,
          });
        },
        onError: (err) => {
          toast({ title: "Claim failed", description: (err as any)?.data?.message || "Try again later.", variant: "destructive" });
        },
      });
      return;
    }
    checkoutMutation.mutate(undefined, {
      onSuccess: (result) => {
        if (result.url) window.location.href = result.url;
        else toast({ title: "Checkout failed", description: "Try again later.", variant: "destructive" });
      },
      onError: (err) => {
        toast({ title: "Checkout failed", description: (err as any)?.data?.message || "Try again later.", variant: "destructive" });
      },
    });
  };


  const priceLabel =
    offer?.priceAmount != null
      ? `$${(offer.priceAmount / 100).toFixed(2)}`
      : "$4.99";

  return (
    <div className="h-[100dvh] w-full bg-background relative flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 flex items-center justify-center px-4 py-14 max-md:py-4">
        {isLoading ? (
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        ) : (
          <div className="w-full max-w-2xl relative max-h-full">
            <div className="absolute -inset-8 bg-gradient-to-br from-blue-600/20 via-cyan-400/10 to-purple-600/20 blur-3xl rounded-full pointer-events-none" />

            <div className="relative bg-card border-2 border-blue-400/40 rounded-3xl px-8 py-6 max-md:px-3 max-md:py-3 shadow-[0_0_50px_rgba(59,130,246,0.25)] text-center">
              <div className="inline-flex items-center bg-blue-500/20 text-blue-300 font-black uppercase tracking-widest text-[10px] px-3 py-1 rounded-full mb-3 max-md:mb-1.5">
                Limited Starter Bundle
              </div>

              <h1 className="text-3xl max-md:text-xl font-black font-display tracking-wide mb-1 bg-gradient-to-r from-blue-300 via-cyan-200 to-blue-400 bg-clip-text text-transparent">
                CLOAKET STARTER BUNDLE
              </h1>
              <p className="text-muted-foreground font-bold text-sm max-md:text-xs mb-4 max-md:mb-2">
                One purchase. Nine permanent rewards.
              </p>

              <div className="grid grid-cols-4 gap-2 max-md:gap-1.5 mb-4 max-md:mb-2">
                <div className="bg-secondary/60 border border-card-border rounded-2xl p-2.5 max-md:p-1.5 flex flex-col items-center justify-center">
                  <TokenIcon className="w-6 h-6 max-md:w-5 max-md:h-5 text-yellow-400 mb-1" />
                  <span className="text-sm max-md:text-xs font-black">{formatNumber(offer?.tokens ?? 75000)}</span>
                  <span className="text-[9px] max-md:text-[8px] font-bold text-muted-foreground uppercase tracking-wider">Tokens</span>
                </div>
                <div className="bg-secondary/60 border border-yellow-400/30 rounded-2xl p-2.5 max-md:p-1.5 flex flex-col items-center justify-center">
                  <Crown className="w-6 h-6 max-md:w-5 max-md:h-5 text-yellow-300 mb-1" />
                  <span className="text-sm max-md:text-xs font-black text-golden">Golden Name</span>
                  <span className="text-[9px] max-md:text-[8px] font-bold text-muted-foreground uppercase tracking-wider">Username Effect</span>
                </div>
                <div className="bg-secondary/60 border border-[#00ccff]/30 rounded-2xl p-2.5 max-md:p-1.5 flex flex-col items-center justify-center">
                  {previewChroma?.image ? (
                    <img
                      src={previewChroma.image}
                      alt={previewChroma.name}
                      className="w-6 h-6 max-md:w-5 max-md:h-5 object-contain mb-1"
                      style={{ filter: "drop-shadow(0 0 10px #00ccffb3)" }}
                    />
                  ) : (
                    <Sparkles className="w-6 h-6 max-md:w-5 max-md:h-5 text-[#00ccff] mb-1" />
                  )}
                  <span className="text-sm max-md:text-xs font-black">2 Random Chromas</span>
                  <span className="text-[9px] max-md:text-[8px] font-bold text-muted-foreground uppercase tracking-wider">
                    3% chance each to be a Mystical
                  </span>
                </div>
                <div className="bg-secondary/60 border border-red-400/30 rounded-2xl p-2.5 max-md:p-1.5 flex flex-col items-center justify-center">
                  <Paintbrush className="w-6 h-6 max-md:w-5 max-md:h-5 text-red-400 mb-1" />
                  <span className="text-sm max-md:text-xs font-black text-red-500">Text Colors</span>
                  <span className="text-[9px] max-md:text-[8px] font-bold text-muted-foreground uppercase tracking-wider">Any Color You Want</span>
                </div>
              </div>

              <div className="grid grid-cols-5 gap-1.5 max-md:gap-1 mb-4 max-md:mb-2">
                <div className="min-w-0 bg-secondary/60 border border-cyan-400/30 rounded-2xl p-2 max-md:p-1.5 flex flex-col items-center justify-center">
                  <IdCard className="w-5 h-5 max-md:w-4 max-md:h-4 text-cyan-300 mb-1" />
                  <span className="text-xs max-md:text-[10px] leading-tight font-black text-cyan-300">Name Colors</span>
                  <span className="text-[8px] max-md:text-[7px] leading-tight font-bold text-muted-foreground uppercase tracking-wider">Color Your Username</span>
                </div>
                <div className="min-w-0 bg-secondary/60 border border-green-400/30 rounded-2xl p-2 max-md:p-1.5 flex flex-col items-center justify-center">
                  <img src={cloverImg} alt="Clover" className="w-5 h-5 max-md:w-4 max-md:h-4 object-contain mb-1" />
                  <span className="text-xs max-md:text-[10px] leading-tight font-black text-green-300">2.5x Craft Luck</span>
                  <span className="text-[8px] max-md:text-[7px] leading-tight font-bold text-muted-foreground uppercase tracking-wider">One Use • Bundle Exclusive</span>
                </div>
                <div className="min-w-0 bg-secondary/60 border border-amber-400/30 rounded-2xl p-2 max-md:p-1.5 flex flex-col items-center justify-center">
                  <ChevronsUp className="w-5 h-5 max-md:w-4 max-md:h-4 text-amber-400 mb-1" />
                  <span className="text-xs max-md:text-[10px] leading-tight font-black">2 Clan Boosts</span>
                  <span className="text-[8px] max-md:text-[7px] leading-tight font-bold text-muted-foreground uppercase tracking-wider">+10 Clan Levels</span>
                </div>
                <div className="min-w-0 bg-secondary/60 border border-purple-400/30 rounded-2xl p-2 max-md:p-1.5 flex flex-col items-center justify-center">
                  {/* Filled palette; paint-dot holes filled with the moving rainbow gradient */}
                  <svg viewBox="0 0 24 24" className="w-6 h-6 max-md:w-5 max-md:h-5 mb-1" aria-hidden="true">
                    <defs>
                      <mask id="palette-holes">
                        <path fill="white" d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
                        <circle cx="13.5" cy="6.5" r="1.5" fill="black" />
                        <circle cx="17.5" cy="10.5" r="1.5" fill="black" />
                        <circle cx="8.5" cy="7.5" r="1.5" fill="black" />
                        <circle cx="6.5" cy="12" r="1.5" fill="black" />
                      </mask>
                    </defs>
                    <g className="animate-rainbow">
                      <circle cx="13.5" cy="6.5" r="1.5" fill="#ff0000" />
                      <circle cx="17.5" cy="10.5" r="1.5" fill="#ff0000" />
                      <circle cx="8.5" cy="7.5" r="1.5" fill="#ff0000" />
                      <circle cx="6.5" cy="12" r="1.5" fill="#ff0000" />
                    </g>
                    <rect width="24" height="24" fill="white" mask="url(#palette-holes)" />
                  </svg>
                  <span className="text-xs max-md:text-[10px] leading-tight font-black text-rainbow">Rainbow Clan Name</span>
                  <span className="text-[8px] max-md:text-[7px] leading-tight font-bold text-muted-foreground uppercase tracking-wider">Movable • Owner Only</span>
                </div>
                <div className="min-w-0 bg-secondary/60 border border-cyan-300/40 rounded-2xl p-2 max-md:p-1.5 flex flex-col items-center justify-center">
                  <img
                    src="/api/content/badges/badge_cloaket_plus.png?v=2"
                    alt="Cloaket+ badge"
                    className="w-5 h-5 max-md:w-4 max-md:h-4 object-contain mb-1 drop-shadow-[0_0_8px_rgba(103,232,249,0.65)]"
                  />
                  <span className="text-xs max-md:text-[10px] leading-tight font-black text-cyan-200">Cloaket+ Badge</span>
                  <span className="text-[8px] max-md:text-[7px] leading-tight font-bold text-muted-foreground uppercase tracking-wider">Starter Bundle Exclusive</span>
                </div>
              </div>

              {claimedBlooks.length > 0 && (
                <div className="mb-3 bg-[#00ccff]/10 border border-[#00ccff]/40 rounded-2xl p-3 font-black text-[#00ccff] text-sm flex flex-col items-center justify-center gap-2">
                  {claimedBlooks.map((b, i) => (
                    <div key={i} className="flex items-center justify-center gap-3">
                      {b.image && (
                        <img
                          src={b.image}
                          alt={b.name}
                          className="w-12 h-12 object-contain"
                          style={{ filter: "drop-shadow(0 0 10px #00ccffb3)" }}
                        />
                      )}
                      <span>
                        You unlocked <span className="text-white">{b.name}</span> ({b.rarity})!
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {claimMutation.isPending ? (
                <div className="flex items-center justify-center gap-3 h-12 text-base font-black text-blue-300">
                  <Loader2 className="w-5 h-5 animate-spin" /> Verifying your purchase...
                </div>
              ) : (
                <Button
                  onClick={handleBuy}
                  disabled={checkoutMutation.isPending || freeClaimMutation.isPending || (!offer?.available && !offer?.freeForYou)}
                  className="w-full max-w-sm h-12 max-md:h-10 text-lg max-md:text-base font-black font-display tracking-wider rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white shadow-[0_4px_0_rgb(29,78,216),0_0_25px_rgba(59,130,246,0.4)] hover:translate-y-0.5 transition-all"
                >
                  {checkoutMutation.isPending || freeClaimMutation.isPending ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : offer?.freeForYou ? (
                    <>CLAIM FREE</>
                  ) : (
                    <>BUY NOW — {priceLabel}</>
                  )}
                </Button>
              )}

              {!offer?.available && !isLoading && (
                <p className="mt-2 text-xs font-bold text-muted-foreground">The store is being set up — check back soon.</p>
              )}

              <div className="mt-3 flex items-center justify-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                <ShieldCheck className="w-3.5 h-3.5" /> Secure checkout powered by Stripe
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
