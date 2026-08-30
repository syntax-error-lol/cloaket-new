import { useEffect, useState } from "react";
import { HardHat, Sparkles } from "lucide-react";
import { FaBriefcase } from "react-icons/fa6";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useGetUpdateMessage, getGetUpdateMessageQueryKey } from "@workspace/api-client-react";

// Bump the suffix whenever the announcement content changes so everyone sees
// the new one exactly once. The owner panel's "Update Message" switch hides
// it for everyone regardless of this local flag.
const UPDATE_KEY = "cloaket-progression-update-v2";

export function ProgressionUpdateDialog() {
  const [open, setOpen] = useState(false);
  const { data: status } = useGetUpdateMessage({
    query: { queryKey: getGetUpdateMessageQueryKey() },
  });

  useEffect(() => {
    if (!status) return;
    if (!status.enabled) {
      setOpen(false);
      return;
    }
    if (window.localStorage.getItem(UPDATE_KEY) !== "seen") setOpen(true);
  }, [status]);

  const close = () => {
    window.localStorage.setItem(UPDATE_KEY, "seen");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogContent
        className="max-w-lg overflow-hidden rounded-3xl border-2 border-card-border bg-card p-0"
        data-testid="dialog-update-message"
      >
        <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 px-6 pb-6 pt-7">
          <div className="pointer-events-none absolute inset-0 bg-checkerboard opacity-10" />
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
          <Sparkles className="absolute right-6 top-6 h-6 w-6 animate-pulse text-yellow-300" />
          <span className="inline-flex items-center rounded-full border border-white/25 bg-black/25 px-3 py-1 text-[10px] font-black uppercase tracking-[0.25em] text-yellow-200">
            What's New
          </span>
          <DialogTitle className="mt-3 font-display text-4xl font-black uppercase leading-none tracking-wide text-white drop-shadow-[0_3px_0_rgba(0,0,0,0.3)] max-md:text-3xl">
            Clans Got Stronger
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm font-bold text-indigo-100">
            Clan powers and the Token Mine just landed.
          </DialogDescription>
        </div>

        <div className="flex flex-col gap-3 p-5">
          <div className="flex items-start gap-3.5 rounded-2xl border-2 border-card-border bg-secondary/40 p-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-violet-400/30 bg-violet-500/15">
              <FaBriefcase className="h-5 w-5 text-violet-300" />
            </div>
            <div className="min-w-0">
              <h3 className="font-display text-sm font-black uppercase tracking-wider text-white">
                Clan Held Blooks
              </h3>
              <p className="mt-1 text-xs font-bold leading-relaxed text-muted-foreground">
                Commit blooks to your clan's vault. Most pay every member tokens each hour,
                Mysticals beam one-of-a-kind clan-wide auras, and every Uncommon stacks
                +0.001x pack luck for the whole clan.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5 rounded-2xl border-2 border-card-border bg-secondary/40 p-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-yellow-400/30 bg-yellow-400/10">
              <HardHat className="h-5 w-5 text-yellow-400" />
            </div>
            <div className="min-w-0">
              <h3 className="font-display text-sm font-black uppercase tracking-wider text-white">
                The Token Mine
              </h3>
              <p className="mt-1 text-xs font-bold leading-relaxed text-muted-foreground">
                Unlock your Mine at level 5 and send blooks down the shaft as permanent
                miners. Rarer miners dig faster — and you can buy extra slots with tokens
                once your crew is full.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={close}
            className="mt-1 h-12 w-full rounded-xl border-2 border-yellow-600 bg-yellow-400 font-display text-sm font-black uppercase tracking-widest text-yellow-950 shadow-[0_4px_0_rgb(161,98,7)] transition-all hover:bg-yellow-300 active:translate-y-1 active:shadow-none"
            data-testid="button-close-update"
          >
            Let's Go
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
