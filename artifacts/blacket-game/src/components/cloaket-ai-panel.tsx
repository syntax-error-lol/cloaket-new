import { useState } from "react";
import { useAdminAiScan, useAdminAiScanApply } from "@workspace/api-client-react";
import type { AiFlaggedItem } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Check, Trash2, AlertTriangle } from "lucide-react";

type ScanResult = {
  items: AiFlaggedItem[];
  scannedPlayers: number;
  scannedClans: number;
  scannedMessages: number;
};

/**
 * Cloaket AI moderation panel — shared between the admin and mod pages.
 * `password` is whichever panel password the page is authenticated with
 * (the backend accepts both).
 */
export function CloaketAiPanel({
  password,
  className = "",
  allowDelete = false,
}: {
  password: string;
  className?: string;
  /** Only the owner panel can delete whole accounts; admin/mod get ban + rename. */
  allowDelete?: boolean;
}) {
  const { toast } = useToast();
  const scanMutation = useAdminAiScan();
  const applyMutation = useAdminAiScanApply();
  const [result, setResult] = useState<ScanResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [instructions, setInstructions] = useState("");
  type AccountAction = "ban" | "delete" | "rename";
  // Per-account overrides of the punishment.
  const [accountAction, setAccountAction] = useState<Record<string, AccountAction>>({});
  // Default punishment mode for all flagged accounts. "smart" = Cloaket AI
  // weighs the severity of what each account did and picks the punishment.
  const [punishMode, setPunishMode] = useState<"smart" | AccountAction>("smart");

  const keyOf = (it: { kind: string; id: string }) => `${it.kind}:${it.id}`;

  const actionFor = (it: AiFlaggedItem): AccountAction => {
    const override = accountAction[keyOf(it)];
    const action =
      override ??
      (punishMode === "smart"
        ? ((it.punishment as AccountAction | undefined) ?? (it.kind === "username" ? "rename" : "ban"))
        : punishMode);
    // Delete is owner-only — everywhere else it downgrades to ban.
    return action === "delete" && !allowDelete ? "ban" : action;
  };

  const handleScan = () => {
    setResult(null);
    scanMutation.mutate(
      { data: { password, ...(instructions.trim() ? { instructions: instructions.trim() } : {}) } },
      {
        onSuccess: (res) => {
          setResult(res);
          setSelected(new Set(res.items.map(keyOf)));
          setAccountAction({});
          toast({
            title: "Scan complete",
            description:
              res.items.length === 0
                ? "Nothing inappropriate found. Cloaket is clean!"
                : `${res.items.length} item(s) flagged for review.`,
          });
        },
        onError: (err) => {
          toast({ title: "Scan failed", description: (err.data as any)?.message || "Error", variant: "destructive" });
        },
      },
    );
  };

  const toggleItem = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleApply = () => {
    if (!result) return;
    const items = result.items
      .filter((it) => selected.has(keyOf(it)))
      .map((it) => {
        if (it.kind === "player" || it.kind === "username") {
          const action = actionFor(it);
          // "rename" reuses the existing username-rename cleanup.
          const kind =
            action === "ban"
              ? ("ban_player" as const)
              : action === "rename"
                ? ("username" as const)
                : ("player" as const);
          return { kind, id: it.id };
        }
        return { kind: it.kind, id: it.id };
      });
    applyMutation.mutate(
      { data: { password, items } },
      {
        onSuccess: (res) => {
          setConfirmOpen(false);
          setResult((prev) => (prev ? { ...prev, items: prev.items.filter((it) => !selected.has(keyOf(it))) } : prev));
          setSelected(new Set());
          toast({ title: "Cleanup complete", description: `${res.applied} item(s) handled.` });
        },
        onError: (err) => {
          toast({ title: "Cleanup failed", description: (err.data as any)?.message || "Error", variant: "destructive" });
        },
      },
    );
  };

  return (
    <div className={`bg-secondary/30 border-2 border-card-border rounded-2xl p-6 flex flex-col gap-6 ${className}`}>
      <div className="flex items-center gap-3 border-b-2 border-card-border pb-4">
        <div className="flex-1">
          <h2 className="text-2xl font-black font-display text-white">Cloaket AI</h2>
          <p className="text-sm font-semibold text-muted-foreground">
            Scan all of Cloaket for racism, NSFW, and other inappropriate content — usernames, clan names, and every
            chat. Review what it found, then approve the cleanup.
          </p>
        </div>
        <Button
          onClick={handleScan}
          disabled={scanMutation.isPending}
          className="h-12 px-6 font-black font-display text-lg uppercase tracking-wide bg-purple-600 hover:bg-purple-500 text-white rounded-xl shrink-0"
        >
          {scanMutation.isPending ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Scanning...
            </>
          ) : (
            "Run Scan"
          )}
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-black text-white uppercase tracking-wide">Suggestions for Cloaket AI (optional)</label>
        <Input
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          maxLength={1000}
          placeholder='e.g. "also flag anyone talking about scamming or sharing personal info"'
          className="h-12 rounded-xl bg-input border-card-border font-bold"
        />
        <p className="text-xs font-semibold text-muted-foreground">
          Cloaket AI always checks for racism, NSFW, hate, and bullying — your suggestions get added on top for this
          scan. It only acts on clearly malicious content, never normal chatter.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-black text-white uppercase tracking-wide">Punishment for flagged accounts</label>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { value: "smart", label: "Smart", cls: "bg-purple-600 text-white" },
              { value: "ban", label: "Ban", cls: "bg-orange-500 text-white" },
              { value: "rename", label: "Rename", cls: "bg-sky-600 text-white" },
              ...(allowDelete ? [{ value: "delete", label: "Delete", cls: "bg-red-600 text-white" }] as const : []),
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                setPunishMode(opt.value);
                setAccountAction({});
              }}
              className={`px-4 py-2 rounded-xl text-sm font-black uppercase tracking-wide ${
                punishMode === opt.value ? opt.cls : "bg-secondary text-muted-foreground hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-xs font-semibold text-muted-foreground">
          {punishMode === "smart"
            ? `Smart: Cloaket AI weighs how bad each account's behavior was and picks ${allowDelete ? "rename, ban, or delete" : "rename or ban"}. You can still override each one below.`
            : `Every flagged account defaults to ${punishMode} — you can still override each one below.`}
        </p>
      </div>
      {scanMutation.isPending && (
        <p className="text-sm font-bold text-muted-foreground">Cloaket AI is reading everything... this can take a minute.</p>
      )}
      {result && (
        <div className="flex flex-col gap-4">
          <p className="text-sm font-bold text-muted-foreground">
            Scanned {result.scannedPlayers} usernames, {result.scannedClans} clans, and {result.scannedMessages} recent
            messages.
            {result.items.length === 0
              ? " Nothing inappropriate found."
              : ` ${result.items.length} item(s) flagged — untick anything you want to keep.`}
          </p>
          {result.items.length > 0 && (
            <>
              <div className="max-h-96 overflow-y-auto custom-scrollbar bg-input border border-card-border rounded-xl">
                <div className="p-2 flex flex-col gap-1">
                  {result.items.map((it) => {
                    const key = keyOf(it);
                    const isSelected = selected.has(key);
                    const action = actionFor(it);
                    return (
                      <div
                        key={key}
                        className={`flex items-start gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                          isSelected ? "bg-red-500/20 border-red-500/50 border" : "hover:bg-secondary border border-transparent opacity-60"
                        }`}
                      >
                        <button onClick={() => toggleItem(key)} className="flex items-start gap-3 min-w-0 flex-1 text-left">
                          <div
                            className={`mt-1 w-4 h-4 rounded shrink-0 border flex items-center justify-center ${
                              isSelected ? "bg-red-500 border-red-500" : "border-muted-foreground"
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <div className="min-w-0">
                            <div className="font-black text-white text-sm">{it.label}</div>
                            <div className="font-bold text-sm text-red-300 break-words">"{it.text}"</div>
                            <div className="text-xs font-semibold text-muted-foreground">
                              {it.reason} —{" "}
                              <span className="text-orange-400">
                                {it.kind === "player" || it.kind === "username"
                                  ? action === "ban"
                                    ? "Ban this account (they can't log in anymore)"
                                    : action === "rename"
                                      ? "Rename this account's username (keeps the account)"
                                      : "Delete this account and EVERYTHING it owns"
                                  : it.action}
                              </span>
                            </div>
                          </div>
                        </button>
                        {(it.kind === "player" || it.kind === "username") && isSelected && (
                          <div className="flex gap-1 shrink-0 mt-1">
                            <button
                              onClick={() => setAccountAction((prev) => ({ ...prev, [key]: "ban" }))}
                              className={`px-2.5 py-1 rounded-md text-xs font-black uppercase ${
                                action === "ban" ? "bg-orange-500 text-white" : "bg-secondary text-muted-foreground hover:text-white"
                              }`}
                            >
                              Ban
                            </button>
                            <button
                              onClick={() => setAccountAction((prev) => ({ ...prev, [key]: "rename" }))}
                              className={`px-2.5 py-1 rounded-md text-xs font-black uppercase ${
                                action === "rename" ? "bg-sky-600 text-white" : "bg-secondary text-muted-foreground hover:text-white"
                              }`}
                            >
                              Rename
                            </button>
                            {allowDelete && (
                              <button
                                onClick={() => setAccountAction((prev) => ({ ...prev, [key]: "delete" }))}
                                className={`px-2.5 py-1 rounded-md text-xs font-black uppercase ${
                                  action === "delete" ? "bg-red-600 text-white" : "bg-secondary text-muted-foreground hover:text-white"
                                }`}
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={selected.size === 0 || applyMutation.isPending}
                className="h-14 w-full font-black font-display text-lg uppercase tracking-wide bg-red-600 hover:bg-red-500 text-white rounded-xl"
              >
                <Trash2 className="w-5 h-5 mr-2" /> Approve & Clean Up ({selected.size})
              </Button>
            </>
          )}
        </div>
      )}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md border-red-500/20 bg-background">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-500">
              <AlertTriangle className="w-5 h-5" /> Confirm Cleanup
            </DialogTitle>
            <DialogDescription className="font-semibold pt-2 text-muted-foreground">
              Cloaket AI will handle {selected.size} flagged item(s): offensive messages get deleted, flagged clans get
              disbanded, flagged usernames get renamed, and flagged accounts get banned or deleted (whichever you
              picked for each one).
              <strong className="text-white block mt-2">This action cannot be undone.</strong>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:justify-between">
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)} disabled={applyMutation.isPending}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleApply} disabled={applyMutation.isPending} className="font-bold">
              {applyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Clean Up {selected.size} Item(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
