import { useState, useMemo, useEffect, useRef } from "react";
import {
  useOwnerGetSettings,
  useOwnerSetSettings,
  useOwnerGetPackOrder,
  useOwnerSetPackOrder,
  useOwnerListClans,
  useOwnerSetClanLevel,
  useOwnerListPurchases,
  useOwnerListPanelAccess,
  useOwnerSetPanelAccess,
  useOwnerListModBadges,
  useOwnerUnlockAccount,
  useOwnerSetModBadge,
  useOwnerSetPlayerPfp,
  useOwnerRemovePlayerPfp,
  useAdminLookup,
  useAdminListGrants,
  useAdminUpdateBadges,
  useAdminClearChat,
  useAdminClearBazaar,
  useOwnerListGrantRequests,
  useOwnerApproveGrantRequest,
  useOwnerRejectGrantRequest,
} from "@workspace/api-client-react";
import type { AdminLookup, OwnerSettings, OwnerClanInfo, OwnerPurchaseInfo, AdminGrantInfo, OwnerPanelAccount, GrantRequest } from "@workspace/api-client-react";
import { AdminTools } from "@/components/admin-tools";
import { ModTools } from "@/components/mod-tools";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { Loader2, Crown, Award, Search, Check, X, Trash2, AlertTriangle, RefreshCw, Users, ShoppingCart, Shield, Gift, KeyRound, ImagePlus, ChevronUp, ChevronDown, ListOrdered } from "lucide-react";
import { useUpload } from "@workspace/object-storage-web";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StaffGateway } from "@/components/staff-gateway";

export default function OwnerPage() {
  return <OwnerControlPanel variant="owner" />;
}

// The co-owner panel is the owner panel minus two owner-only powers: the
// Market Pack Order card and re-enabling the 1k Pack. /coowner renders this
// same component with variant="coowner".
export function OwnerControlPanel({ variant }: { variant: "owner" | "coowner" }) {
  const isOwner = variant === "owner";
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [settings, setSettings] = useState<OwnerSettings | null>(null);
  const [data, setData] = useState<AdminLookup | null>(null);
  const [packOrder, setPackOrder] = useState<string[] | null>(null);
  const [savedOrder, setSavedOrder] = useState<string[] | null>(null);
  const [packOrderError, setPackOrderError] = useState(false);

  const getSettingsMutation = useOwnerGetSettings();
  const setSettingsMutation = useOwnerSetSettings();
  const getPackOrderMutation = useOwnerGetPackOrder();
  const setPackOrderMutation = useOwnerSetPackOrder();
  const lookupMutation = useAdminLookup();
  const updateBadgesMutation = useAdminUpdateBadges();
  const clearChatMutation = useAdminClearChat();
  const clearBazaarMutation = useAdminClearBazaar();

  const refreshData = () => {
    lookupMutation.mutate({ data: { password } }, { onSuccess: setData });
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    getSettingsMutation.mutate({ data: { password } }, {
      onSuccess: (res) => {
        setSettings(res);
        setIsAuthenticated(true);
        lookupMutation.mutate({ data: { password } }, { onSuccess: setData });
        if (isOwner) loadPackOrder(password);
        toast({ title: "Authenticated", description: isOwner ? "Welcome to the owner panel." : "Welcome to the co-owner panel." });
      },
      onError: (err) => {
        toast({ title: "Error", description: (err.data as any)?.message || "Wrong password", variant: "destructive" });
      },
    });
  };

  const setFlag = (patch: Partial<Pick<OwnerSettings, "adminPanelDisabled" | "linksAllowed" | "panelApprovalEnabled" | "topPackEnabled" | "updateMessageEnabled" | "extravextrasBaseLevel3Enabled">>) => {
    setSettingsMutation.mutate({ data: { password, ...patch } }, {
      onSuccess: (res) => setSettings(res),
      onError: (err) => {
        toast({ title: "Failed", description: (err.data as any)?.message || "Could not update settings", variant: "destructive" });
      },
    });
  };

  const loadPackOrder = (pw: string) => {
    setPackOrderError(false);
    getPackOrderMutation.mutate({ data: { password: pw } }, {
      onSuccess: (r) => { setPackOrder(r.order); setSavedOrder(r.order); },
      onError: (err) => {
        setPackOrderError(true);
        toast({ title: "Failed", description: (err.data as any)?.message || "Could not load pack order", variant: "destructive" });
      },
    });
  };

  const movePack = (index: number, delta: number) => {
    setPackOrder((prev) => {
      if (!prev) return prev;
      const j = index + delta;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[j]] = [next[j]!, next[index]!];
      return next;
    });
  };

  const packOrderDirty =
    !!packOrder && !!savedOrder && packOrder.join("\u0000") !== savedOrder.join("\u0000");

  const savePackOrder = () => {
    if (!packOrder) return;
    setPackOrderMutation.mutate({ data: { password, order: packOrder } }, {
      onSuccess: (r) => {
        setPackOrder(r.order);
        setSavedOrder(r.order);
        toast({ title: "Saved", description: "Market pack order updated." });
      },
      onError: (err) => {
        toast({ title: "Failed", description: (err.data as any)?.message || "Could not save pack order", variant: "destructive" });
      },
    });
  };

  // ---- Badges ----
  const [badgePlayer, setBadgePlayer] = useState("");
  const [badgePlayerSearch, setBadgePlayerSearch] = useState("");
  const [selectedAddBadges, setSelectedAddBadges] = useState<string[]>([]);
  const [selectedRemoveBadges, setSelectedRemoveBadges] = useState<string[]>([]);

  useEffect(() => {
    setSelectedAddBadges([]);
    setSelectedRemoveBadges([]);
  }, [badgePlayer]);

  const filteredBadgePlayers = useMemo(() => {
    if (!data) return [];
    return data.players.filter(p => p.username.toLowerCase().includes(badgePlayerSearch.toLowerCase()));
  }, [data, badgePlayerSearch]);

  const selectedPlayerForBadges = useMemo(
    () => data?.players.find(p => p.username === badgePlayer) ?? null,
    [data, badgePlayer],
  );

  const toggleAddBadge = (name: string) => {
    setSelectedAddBadges(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
    setSelectedRemoveBadges(prev => prev.filter(n => n !== name));
  };
  const toggleRemoveBadge = (name: string) => {
    setSelectedRemoveBadges(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
    setSelectedAddBadges(prev => prev.filter(n => n !== name));
  };

  const handleUpdateBadges = () => {
    if (!badgePlayer || (selectedAddBadges.length === 0 && selectedRemoveBadges.length === 0)) return;
    updateBadgesMutation.mutate(
      { data: { password, username: badgePlayer, add: selectedAddBadges, remove: selectedRemoveBadges } },
      {
        onSuccess: () => {
          toast({ title: "Success", description: `Updated badges for ${badgePlayer}.` });
          setSelectedAddBadges([]);
          setSelectedRemoveBadges([]);
          refreshData();
        },
        onError: (err) => {
          toast({ title: "Failed", description: (err.data as any)?.message || "Error updating badges", variant: "destructive" });
        },
      },
    );
  };

  // ---- Wipe data ----
  const [clearConfirm, setClearConfirm] = useState<"chat" | "bazaar" | null>(null);
  const handleClear = () => {
    if (!clearConfirm) return;
    const mutation = clearConfirm === "chat" ? clearChatMutation : clearBazaarMutation;
    const label = clearConfirm === "chat" ? "chat messages" : "bazaar listings";
    mutation.mutate({ data: { password } }, {
      onSuccess: (res) => {
        toast({ title: "Wiped", description: `Deleted ${res.deleted} ${label}.` });
        setClearConfirm(null);
      },
      onError: (err) => {
        toast({ title: "Failed", description: (err.data as any)?.message || `Could not clear ${label}`, variant: "destructive" });
        setClearConfirm(null);
      },
    });
  };

  // ---- Clan levels ----
  const listClansMutation = useOwnerListClans();
  const setClanLevelMutation = useOwnerSetClanLevel();
  const [clans, setClans] = useState<OwnerClanInfo[]>([]);
  const [clanSearch, setClanSearch] = useState("");
  const [clanLevelInputs, setClanLevelInputs] = useState<Record<number, string>>({});

  const refreshClans = () => {
    listClansMutation.mutate({ data: { password } }, { onSuccess: (res) => setClans(res.clans) });
  };

  useEffect(() => {
    if (isAuthenticated) refreshClans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const filteredClans = useMemo(
    () => clans.filter((c) => c.name.toLowerCase().includes(clanSearch.toLowerCase())),
    [clans, clanSearch],
  );

  const handleSetClanLevel = (clanId: number, level: number) => {
    if (!Number.isInteger(level) || level < 1 || level > 10000) {
      toast({ title: "Invalid level", description: "Level must be between 1 and 4,000.", variant: "destructive" });
      return;
    }
    setClanLevelMutation.mutate({ data: { password, clanId, level } }, {
      onSuccess: (res) => {
        toast({ title: "Success", description: `${res.name} is now level ${res.level}.` });
        setClans((prev) => prev.map((c) => (c.id === res.id ? res : c)));
        setClanLevelInputs((prev) => ({ ...prev, [clanId]: "" }));
      },
      onError: (err) => {
        toast({ title: "Failed", description: (err.data as any)?.message || "Could not update clan level", variant: "destructive" });
      },
    });
  };

  // ---- Store purchases ----
  const listPurchasesMutation = useOwnerListPurchases();
  const [purchases, setPurchases] = useState<OwnerPurchaseInfo[]>([]);

  const refreshPurchases = () => {
    listPurchasesMutation.mutate({ data: { password } }, { onSuccess: (res) => setPurchases(res.purchases) });
  };

  // ---- Given bundles (admin grants) ----
  const listGrantsMutation = useAdminListGrants();
  const [grants, setGrants] = useState<AdminGrantInfo[]>([]);

  const refreshGrants = () => {
    listGrantsMutation.mutate({ data: { password } }, { onSuccess: (res) => setGrants(res.grants) });
  };

  useEffect(() => {
    if (isAuthenticated) {
      refreshPurchases();
      refreshGrants();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // ---- Pending admin grant approvals ----
  const listGrantRequestsMutation = useOwnerListGrantRequests();
  const approveGrantRequestMutation = useOwnerApproveGrantRequest();
  const rejectGrantRequestMutation = useOwnerRejectGrantRequest();
  const [grantRequests, setGrantRequests] = useState<GrantRequest[]>([]);

  const refreshGrantRequests = () => {
    listGrantRequestsMutation.mutate(
      { data: { password } },
      {
        onSuccess: (res) => setGrantRequests(res.requests),
        onError: (err) => {
          toast({ title: "Couldn't load requests", description: (err.data as any)?.message || "Please try again.", variant: "destructive" });
        },
      },
    );
  };

  useEffect(() => {
    if (isAuthenticated) refreshGrantRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const decideGrantRequest = (request: GrantRequest, approved: boolean) => {
    const mutation = approved ? approveGrantRequestMutation : rejectGrantRequestMutation;
    mutation.mutate(
      { data: { password, requestId: request.id } },
      {
        onSuccess: (result) => {
          setGrantRequests((current) => current.filter((item) => item.id !== result.id));
          toast({
            title: approved ? "Request approved" : "Request rejected",
            description: approved
              ? `${result.targetUsername} received ${result.kind === "blook" ? `${result.quantity}x ${result.blook}` : "the Starter Bundle"}.`
              : `No rewards were given to ${result.targetUsername}.`,
          });
          if (approved && result.kind === "starter_bundle") refreshGrants();
        },
        onError: (err) => {
          toast({ title: "Couldn't update request", description: (err.data as any)?.message || "Refresh the queue and try again.", variant: "destructive" });
          refreshGrantRequests();
        },
      },
    );
  };

  // ---- Staff-panel access approvals ----
  const listPanelAccessMutation = useOwnerListPanelAccess();
  const setPanelAccessMutation = useOwnerSetPanelAccess();
  const [panelAccounts, setPanelAccounts] = useState<OwnerPanelAccount[]>([]);
  const [approveName, setApproveName] = useState("");
  const [unlockName, setUnlockName] = useState("");
  const unlockMutation = useOwnerUnlockAccount();
  const handleUnlock = () => {
    const username = unlockName.trim();
    if (!username) return;
    unlockMutation.mutate(
      { data: { password, username } },
      {
        onSuccess: (res) => {
          setUnlockName("");
          toast({ title: "Account unlocked", description: res.message });
        },
        onError: (err) => {
          toast({ title: "Failed", description: (err as any)?.data?.message || "Error", variant: "destructive" });
        },
      },
    );
  };
  // ---- Player PFP (owner-set custom avatars) ----
  const [pfpName, setPfpName] = useState("");
  const [pfpFile, setPfpFile] = useState<File | null>(null);
  const [pfpPreview, setPfpPreview] = useState<string | null>(null);
  const pfpFileRef = useRef<HTMLInputElement>(null);
  const setPfpMutation = useOwnerSetPlayerPfp();
  const removePfpMutation = useOwnerRemovePlayerPfp();
  const { uploadFile: uploadPfp, isUploading: isPfpUploading } = useUpload({
    onError: (err: Error) => toast({ title: "Upload Failed", description: err.message, variant: "destructive" }),
  });
  const handlePfpFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max image size is 5MB.", variant: "destructive" });
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Only images are allowed.", variant: "destructive" });
      return;
    }
    setPfpFile(file);
    setPfpPreview(URL.createObjectURL(file));
  };
  const clearPfpForm = () => {
    setPfpFile(null);
    setPfpPreview(null);
    if (pfpFileRef.current) pfpFileRef.current.value = "";
  };
  const handlePfpSet = async () => {
    const username = pfpName.trim();
    if (!username || !pfpFile) return;
    const uploadRes = await uploadPfp(pfpFile);
    if (!uploadRes) return;
    setPfpMutation.mutate(
      { data: { password, username, imagePath: uploadRes.objectPath } },
      {
        onSuccess: () => {
          toast({ title: "PFP set", description: `${username} now has a custom profile picture.` });
          setPfpName("");
          clearPfpForm();
        },
        onError: (err) => {
          toast({ title: "Failed", description: (err as any)?.data?.message || "Error", variant: "destructive" });
        },
      },
    );
  };
  const handlePfpRemove = () => {
    const username = pfpName.trim();
    if (!username) return;
    removePfpMutation.mutate(
      { data: { password, username } },
      {
        onSuccess: () => {
          toast({ title: "PFP removed", description: `${username} is back to their equipped blook.` });
        },
        onError: (err) => {
          toast({ title: "Failed", description: (err as any)?.data?.message || "Error", variant: "destructive" });
        },
      },
    );
  };

  const [approvePanel, setApprovePanel] = useState<"admin" | "mod" | "coowner" | "owner">("admin");

  const refreshPanelAccess = () => {
    listPanelAccessMutation.mutate({ data: { password } }, { onSuccess: (res) => setPanelAccounts(res.accounts) });
  };

  useEffect(() => {
    if (isAuthenticated) refreshPanelAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const setPanelAccess = (username: string, panel: "admin" | "mod" | "coowner" | "owner", granted: boolean) => {
    setPanelAccessMutation.mutate(
      { data: { password, username, panel, granted } },
      {
        onSuccess: (res) => {
          setPanelAccounts(res.accounts);
          refreshModBadges();
          setApproveName("");
          toast({
            title: granted ? "Access granted" : "Access removed",
            description: granted
              ? `${username} can now open the ${panel} panel.${panel === "mod" ? " Mod badge added." : ""}`
              : `${username} can no longer open the ${panel} panel.${panel === "mod" ? " Mod badge removed." : ""}`,
          });
        },
        onError: (err) => {
          toast({ title: "Failed", description: (err.data as any)?.message || "Could not update access", variant: "destructive" });
        },
      },
    );
  };

  // ---- Mod badge holders ----
  const listModBadgesMutation = useOwnerListModBadges();
  const setModBadgeMutation = useOwnerSetModBadge();
  const [modBadgeAccounts, setModBadgeAccounts] = useState<{ id: number; username: string; modPanel: boolean }[]>([]);

  const refreshModBadges = () => {
    listModBadgesMutation.mutate({ data: { password } }, { onSuccess: (res) => setModBadgeAccounts(res.accounts) });
  };

  useEffect(() => {
    if (isAuthenticated) refreshModBadges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const setModBadge = (username: string, approved: boolean) => {
    setModBadgeMutation.mutate(
      { data: { password, username, approved } },
      {
        onSuccess: (res) => {
          setModBadgeAccounts(res.accounts);
          refreshPanelAccess();
          toast({
            title: approved ? "Approved for mod panel" : "Declined",
            description: approved
              ? `${username} can now open the mod panel.`
              : `${username}'s Mod badge and mod-panel access were removed.`,
          });
        },
        onError: (err) => {
          toast({ title: "Failed", description: (err.data as any)?.message || "Could not update", variant: "destructive" });
        },
      },
    );
  };

  if (!isAuthenticated) {
    return (
      <StaffGateway
        title={isOwner ? "Owner Gateway" : "Co-owner Gateway"}
        description={isOwner ? "Enter the owner password to open the full control panel." : "Enter the co-owner password to open the control panel."}
        password={password}
        placeholder={isOwner ? "Enter owner password..." : "Enter co-owner password..."}
        icon={Crown}
        isPending={getSettingsMutation.isPending}
        onPasswordChange={setPassword}
        onSubmit={handleLogin}
      />
    );
  }

  return (
    <div className="min-h-full p-6 max-md:p-3">
      <div className="max-w-6xl mx-auto flex flex-col gap-6 max-md:gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl max-md:text-2xl font-black font-display text-white flex items-center gap-3">
            <Crown className="w-8 h-8 text-yellow-400" /> {isOwner ? "Owner Panel" : "Co-owner Panel"}
          </h1>
          <Button variant="outline" onClick={refreshData} disabled={lookupMutation.isPending} className="font-bold">
            {lookupMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Refresh
          </Button>
        </div>

        {/* Controls */}
        <div className="bg-card border-2 border-card-border rounded-3xl max-md:rounded-2xl p-6 max-md:p-4 shadow-2xl flex flex-col gap-4">
          <h2 className="text-2xl font-black font-display text-white">Controls</h2>
          <div className="grid grid-cols-2 max-md:grid-cols-1 gap-4">
            <div className="bg-secondary/30 border-2 border-card-border rounded-2xl p-4 flex items-center justify-between gap-4">
              <div>
                <div className="font-black text-white">Disable Admin Panel</div>
                <div className="text-sm font-semibold text-muted-foreground">
                  Blocks the admin password everywhere. Your owner password keeps working.
                </div>
              </div>
              <Switch
                checked={settings?.adminPanelDisabled === true}
                disabled={setSettingsMutation.isPending}
                onCheckedChange={(v) => setFlag({ adminPanelDisabled: v })}
              />
            </div>
            <div className="bg-secondary/30 border-2 border-card-border rounded-2xl p-4 flex items-center justify-between gap-4">
              <div>
                <div className="font-black text-white">Allow Links</div>
                <div className="text-sm font-semibold text-muted-foreground">
                  While on, players can send links in chat, trades, and clan chat.
                </div>
              </div>
              <Switch
                checked={settings?.linksAllowed === true}
                disabled={setSettingsMutation.isPending}
                onCheckedChange={(v) => setFlag({ linksAllowed: v })}
              />
            </div>
            <div className="bg-secondary/30 border-2 border-card-border rounded-2xl p-4 flex items-center justify-between gap-4">
              <div>
                <div className="font-black text-white">1k Pack</div>
                <div className="text-sm font-semibold text-muted-foreground">
                  While on, the 1k pack shows in the market and can be opened.
                  {!isOwner && settings?.topPackEnabled !== true && " Only the owner can turn it back on."}
                </div>
              </div>
              <Switch
                checked={settings?.topPackEnabled === true}
                disabled={setSettingsMutation.isPending || (!isOwner && settings?.topPackEnabled !== true)}
                onCheckedChange={(v) => setFlag({ topPackEnabled: v })}
              />
            </div>
            <div className="bg-secondary/30 border-2 border-card-border rounded-2xl p-4 flex items-center justify-between gap-4">
              <div>
                <div className="font-black text-white">Update Message</div>
                <div className="text-sm font-semibold text-muted-foreground">
                  While on, the what's-new popup shows to players who haven't dismissed it yet.
                </div>
              </div>
              <Switch
                checked={settings?.updateMessageEnabled === true}
                disabled={setSettingsMutation.isPending}
                onCheckedChange={(v) => setFlag({ updateMessageEnabled: v })}
                data-testid="switch-update-message"
              />
            </div>
            <div className="bg-secondary/30 border-2 border-card-border rounded-2xl p-4 flex items-center justify-between gap-4">
              <div>
                <div className="font-black text-white">extravextras Mine Access</div>
                <div className="text-sm font-semibold text-muted-foreground">
                  {settings?.extravextrasBaseLevel3Enabled
                    ? "Level 3 Mine access is active for this account."
                    : "Normal level 5 Mine access is restored for this account."}
                </div>
              </div>
              <Button
                type="button"
                variant={settings?.extravextrasBaseLevel3Enabled ? "destructive" : "outline"}
                disabled={setSettingsMutation.isPending}
                onClick={() => setFlag({ extravextrasBaseLevel3Enabled: !settings?.extravextrasBaseLevel3Enabled })}
                className="shrink-0 font-black"
              >
                {settings?.extravextrasBaseLevel3Enabled ? "Disable Level 3" : "Re-enable Level 3"}
              </Button>
            </div>
          </div>
        </div>

        {/* Pack order — owner-only power, hidden from the co-owner */}
        {isOwner && (
        <div className="bg-card border-2 border-card-border rounded-3xl max-md:rounded-2xl p-6 max-md:p-4 shadow-2xl flex flex-col gap-4">
          <h2 className="text-2xl font-black font-display text-white flex items-center gap-3">
            <ListOrdered className="w-6 h-6 text-blue-400" /> Market Pack Order
          </h2>
          <p className="text-sm font-semibold text-muted-foreground">
            Use the arrows to reorder, then save. The market shows packs in this order for everyone.
          </p>
          {!packOrder ? (
            packOrderError ? (
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-muted-foreground">Couldn't load the pack order.</span>
                <Button
                  variant="outline"
                  className="font-black"
                  disabled={getPackOrderMutation.isPending}
                  onClick={() => loadPackOrder(password)}
                  data-testid="button-retry-pack-order"
                >
                  Retry
                </Button>
              </div>
            ) : (
              <div className="flex justify-center py-6">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            )
          ) : (
            <>
              <div className="flex flex-col gap-2 max-w-md">
                {packOrder.map((name, i) => (
                  <div
                    key={name}
                    className="bg-secondary/30 border-2 border-card-border rounded-2xl px-4 py-2 flex items-center justify-between gap-3"
                    data-testid={`row-pack-order-${name}`}
                  >
                    <div className="font-black text-white truncate">
                      <span className="text-muted-foreground mr-2">{i + 1}.</span>
                      {name}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8"
                        disabled={i === 0 || setPackOrderMutation.isPending}
                        onClick={() => movePack(i, -1)}
                        data-testid={`button-pack-up-${name}`}
                      >
                        <ChevronUp className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8"
                        disabled={i === packOrder.length - 1 || setPackOrderMutation.isPending}
                        onClick={() => movePack(i, 1)}
                        data-testid={`button-pack-down-${name}`}
                      >
                        <ChevronDown className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <Button
                onClick={savePackOrder}
                disabled={!packOrderDirty || setPackOrderMutation.isPending}
                className="self-start font-black"
                data-testid="button-save-pack-order"
              >
                {setPackOrderMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Save Order
              </Button>
            </>
          )}
        </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 max-md:gap-4">
          {/* Badges */}
          <div className="bg-card border-2 border-card-border rounded-3xl max-md:rounded-2xl p-6 max-md:p-4 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center gap-3 border-b-2 border-card-border pb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center">
                <Award className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-black font-display text-white">Badges</h2>
            </div>
            <div className="flex flex-col gap-2">
              <label className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Select Player</label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search players..."
                  value={badgePlayerSearch}
                  onChange={e => setBadgePlayerSearch(e.target.value)}
                  className="pl-9 h-12 rounded-xl bg-input border-card-border font-bold"
                />
              </div>
              <ScrollArea className="h-40 bg-input border border-card-border rounded-xl">
                <div className="p-2 flex flex-col gap-1">
                  {filteredBadgePlayers.map(p => (
                    <button
                      key={p.username}
                      onClick={() => setBadgePlayer(p.username)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors ${badgePlayer === p.username ? 'bg-primary text-white' : 'hover:bg-secondary text-muted-foreground hover:text-white'}`}
                    >
                      <span className="font-bold">{p.username}</span>
                      {p.badges.length > 0 && <span className="text-[10px] uppercase font-black opacity-80">{p.badges.length} badges</span>}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {badgePlayer && selectedPlayerForBadges && data && (
              <div className="flex flex-col gap-2">
                <label className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Manage Badges</label>
                <ScrollArea className="h-64 bg-input border border-card-border rounded-xl">
                  <div className="p-2 flex flex-col gap-1">
                    {data.badges.map(badge => {
                      const hasBadge = selectedPlayerForBadges.badges.includes(badge.name);
                      const isAdding = selectedAddBadges.includes(badge.name);
                      const isRemoving = selectedRemoveBadges.includes(badge.name);

                      let stateText = "";
                      let stateClasses = "";
                      if (isAdding) {
                        stateText = "WILL ADD";
                        stateClasses = "border-green-500 bg-green-500/10 text-green-400";
                      } else if (isRemoving) {
                        stateText = "WILL REMOVE";
                        stateClasses = "border-red-500 bg-red-500/10 text-red-400";
                      } else if (hasBadge) {
                        stateText = "OWNED";
                        stateClasses = "border-primary bg-primary/20 text-white";
                      } else {
                        stateText = "UNOWNED";
                        stateClasses = "border-transparent hover:bg-secondary text-muted-foreground";
                      }

                      return (
                        <div key={badge.name} className={`flex items-center justify-between p-2 rounded-lg border-2 transition-all ${stateClasses}`}>
                          <div className="flex items-center gap-3">
                            <img src={badge.image} alt={badge.name} className="w-8 h-8 object-contain" />
                            <span className="font-bold text-sm">{badge.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] uppercase font-black opacity-80 mr-2">{stateText}</span>
                            {!hasBadge && !isAdding && (
                              <Button size="icon" variant="ghost" className="w-8 h-8 bg-green-500/20 text-green-400 hover:bg-green-500 hover:text-white" onClick={() => toggleAddBadge(badge.name)}>
                                <Check className="w-4 h-4" />
                              </Button>
                            )}
                            {isAdding && (
                              <Button size="icon" variant="ghost" className="w-8 h-8 bg-muted text-muted-foreground hover:bg-secondary" onClick={() => toggleAddBadge(badge.name)}>
                                <X className="w-4 h-4" />
                              </Button>
                            )}
                            {hasBadge && !isRemoving && (
                              <Button size="icon" variant="ghost" className="w-8 h-8 bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white" onClick={() => toggleRemoveBadge(badge.name)}>
                                <X className="w-4 h-4" />
                              </Button>
                            )}
                            {isRemoving && (
                              <Button size="icon" variant="ghost" className="w-8 h-8 bg-muted text-muted-foreground hover:bg-secondary" onClick={() => toggleRemoveBadge(badge.name)}>
                                <Check className="w-4 h-4 text-green-400" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            )}

            <Button
              onClick={handleUpdateBadges}
              disabled={!badgePlayer || (selectedAddBadges.length === 0 && selectedRemoveBadges.length === 0) || updateBadgesMutation.isPending}
              className="h-14 w-full mt-2 font-black font-display text-lg uppercase tracking-wide bg-blue-600 hover:bg-blue-500 rounded-xl"
            >
              {updateBadgesMutation.isPending ? <Loader2 className="w-6 h-6 animate-spin" /> : "Apply Changes"}
            </Button>
          </div>

          {/* Wipe Data */}
          <div className="bg-card border-2 border-card-border rounded-3xl max-md:rounded-2xl p-6 max-md:p-4 shadow-2xl flex flex-col gap-4 h-fit">
            <div className="flex items-center gap-3 border-b-2 border-card-border pb-4">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 text-red-500 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-black font-display text-white">Wipe Data</h2>
            </div>
            <p className="text-sm font-semibold text-muted-foreground">
              Delete all chat messages or all bazaar listings from every player. This cannot be undone.
            </p>
            <Button
              onClick={() => setClearConfirm("chat")}
              className="h-14 w-full font-black font-display text-lg uppercase tracking-wide bg-red-600 hover:bg-red-500 text-white rounded-xl"
            >
              Clear All Chat
            </Button>
            <Button
              onClick={() => setClearConfirm("bazaar")}
              className="h-14 w-full font-black font-display text-lg uppercase tracking-wide bg-red-600 hover:bg-red-500 text-white rounded-xl"
            >
              Clear All Bazaar Listings
            </Button>
          </div>
        </div>

        {/* Staff Panel Access */}
        <div className="bg-card border-2 border-card-border rounded-3xl max-md:rounded-2xl p-6 max-md:p-4 shadow-2xl flex flex-col gap-4">
          <div className="flex items-center justify-between border-b-2 border-card-border pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <Shield className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-black font-display text-white">Staff Panel Access</h2>
              <span className="text-xs font-black uppercase text-muted-foreground">{panelAccounts.length} approved</span>
            </div>
            <Button variant="outline" onClick={refreshPanelAccess} disabled={listPanelAccessMutation.isPending} className="font-bold">
              {listPanelAccessMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Refresh
            </Button>
          </div>
          <div className="flex items-center justify-between bg-input border border-card-border rounded-xl px-4 py-3">
            <div className="flex flex-col">
              <span className="font-black text-white">Require approval</span>
              <span className="text-xs font-bold text-muted-foreground">
                {settings?.panelApprovalEnabled
                  ? "ON — only approved accounts can open the staff panels."
                  : "OFF — anyone can still try panel passwords. Approve accounts, then turn this on."}
              </span>
            </div>
            <Switch
              checked={settings?.panelApprovalEnabled === true}
              disabled={setSettingsMutation.isPending}
              onCheckedChange={(checked) => setFlag({ panelApprovalEnabled: checked })}
            />
          </div>
          <p className="text-sm font-bold text-muted-foreground">
            While approval is on, each panel only lets in accounts approved for that panel — everyone else is blocked
            before a password is even checked. You can grant or remove access anytime, on or off. Approve your own
            account for the Owner panel before turning it on — the switch won't let you lock yourself out.
          </p>
          <form
            className="flex gap-2 max-md:flex-wrap"
            onSubmit={(e) => {
              e.preventDefault();
              if (approveName.trim()) setPanelAccess(approveName.trim(), approvePanel, true);
            }}
          >
            <Input
              value={approveName}
              onChange={(e) => setApproveName(e.target.value)}
              placeholder="Username to approve"
              className="font-bold"
            />
            <select
              value={approvePanel}
              onChange={(e) => setApprovePanel(e.target.value as "admin" | "mod" | "coowner" | "owner")}
              className="bg-input border border-card-border rounded-md px-3 font-bold text-white shrink-0 h-10"
            >
              <option value="admin">Admin panel</option>
              <option value="mod">Mod panel</option>
              <option value="coowner">Co-owner panel</option>
              <option value="owner">Owner panel</option>
            </select>
            <Button type="submit" disabled={!approveName.trim() || setPanelAccessMutation.isPending} className="font-bold shrink-0">
              {setPanelAccessMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
              Approve
            </Button>
          </form>
          <p className="text-xs font-bold text-muted-foreground -mt-2">
            Approving someone for the Mod panel automatically gives them the Mod badge (removed again if you revoke it).
          </p>
          <div className="max-h-96 overflow-y-auto custom-scrollbar bg-input border border-card-border rounded-xl">
            <div className="p-2 flex flex-col gap-1">
              {panelAccounts.length === 0 && (
                <div className="px-3 py-6 text-center font-bold text-muted-foreground text-sm">
                  No approved accounts yet — everyone can still try panel passwords until you approve the first account.
                </div>
              )}
              {panelAccounts.map((a) => (
                <div key={a.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-secondary max-md:flex-wrap">
                  <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="font-bold text-white truncate">{a.username}</span>
                  <div className="ml-auto flex items-center gap-1 shrink-0">
                    {(["admin", "mod", "coowner", "owner"] as const).map((p) => {
                      const has = a.panels.includes(p);
                      return (
                        <button
                          key={p}
                          type="button"
                          disabled={setPanelAccessMutation.isPending}
                          onClick={() => setPanelAccess(a.username, p, !has)}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border transition-colors ${
                            has
                              ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/50"
                              : "bg-transparent text-muted-foreground border-card-border hover:text-white hover:border-white/40"
                          }`}
                          title={has ? `Remove ${p} panel access` : `Grant ${p} panel access`}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="border-t-2 border-card-border pt-4 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-black font-display text-white">Mod Badge Holders</h3>
              <span className="text-xs font-black uppercase text-muted-foreground">{modBadgeAccounts.length}</span>
            </div>
            <p className="text-xs font-bold text-muted-foreground">
              Everyone who currently has the Mod badge. Approve them for the mod panel, or decline to remove the badge
              (and any mod-panel access).
            </p>
            <div className="max-h-72 overflow-y-auto custom-scrollbar bg-input border border-card-border rounded-xl">
              <div className="p-2 flex flex-col gap-1">
                {modBadgeAccounts.length === 0 && (
                  <div className="px-3 py-4 text-center font-bold text-muted-foreground text-sm">
                    Nobody has the Mod badge right now.
                  </div>
                )}
                {modBadgeAccounts.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-secondary max-md:flex-wrap">
                    <Shield className={`w-4 h-4 shrink-0 ${a.modPanel ? "text-emerald-400" : "text-amber-400"}`} />
                    <span className="font-bold text-white truncate">{a.username}</span>
                    <span className={`text-[10px] font-black uppercase tracking-wider ${a.modPanel ? "text-emerald-400" : "text-amber-400"}`}>
                      {a.modPanel ? "Mod panel OK" : "Not approved"}
                    </span>
                    <div className="ml-auto flex items-center gap-1 shrink-0">
                      {!a.modPanel && (
                        <Button
                          size="sm"
                          className="font-bold"
                          disabled={setModBadgeMutation.isPending}
                          onClick={() => setModBadge(a.username, true)}
                        >
                          <Check className="w-4 h-4 mr-1" /> Approve
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-400 hover:text-red-300 font-bold"
                        disabled={setModBadgeMutation.isPending}
                        onClick={() => setModBadge(a.username, false)}
                      >
                        <X className="w-4 h-4 mr-1" /> Decline
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Unlock Account (one-time password reset) */}
        <div className="bg-card border-2 border-card-border rounded-3xl max-md:rounded-2xl p-6 max-md:p-4 shadow-2xl flex flex-col gap-4">
          <div className="flex items-center gap-3 border-b-2 border-card-border pb-4">
            <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center">
              <KeyRound className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-black font-display text-white">Unlock Account</h2>
          </div>
          <p className="text-sm font-bold text-muted-foreground">
            For players who forgot their password. After you unlock an account, the NEXT time someone logs into it,
            whatever password they type (6+ characters) is accepted and becomes the account's new password. One use
            only — make sure the right player is the one logging in next.
          </p>
          <form
            className="flex gap-2 max-md:flex-wrap"
            onSubmit={(e) => {
              e.preventDefault();
              handleUnlock();
            }}
          >
            <Input
              value={unlockName}
              onChange={(e) => setUnlockName(e.target.value)}
              placeholder="Username to unlock"
              className="font-bold"
              data-testid="input-unlock-username"
            />
            <Button
              type="submit"
              disabled={!unlockName.trim() || unlockMutation.isPending}
              className="font-bold shrink-0"
              data-testid="button-unlock-account"
            >
              {unlockMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <KeyRound className="w-4 h-4 mr-2" />}
              Unlock
            </Button>
          </form>
        </div>

        {/* Player PFP (owner-set custom avatars) */}
        <div className="bg-card border-2 border-card-border rounded-3xl max-md:rounded-2xl p-6 max-md:p-4 shadow-2xl flex flex-col gap-4">
          <div className="flex items-center gap-3 border-b-2 border-card-border pb-4">
            <div className="w-10 h-10 rounded-xl bg-fuchsia-500/20 text-fuchsia-400 flex items-center justify-center">
              <ImagePlus className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-black font-display text-white">Player PFP</h2>
          </div>
          <p className="text-sm font-bold text-muted-foreground">
            Set a custom profile picture for any player — it overrides their equipped blook everywhere. Remove
            clears any custom pfp so their equipped blook shows again. Uploads are moderated like clan banners.
          </p>
          <div className="flex flex-col gap-3">
            <div className="flex gap-2 max-md:flex-wrap items-center">
              <Input
                value={pfpName}
                onChange={(e) => setPfpName(e.target.value)}
                placeholder="Username"
                className="font-bold max-w-[240px] max-md:max-w-full"
                data-testid="input-pfp-username"
              />
              <input
                ref={pfpFileRef}
                type="file"
                accept="image/*"
                onChange={handlePfpFileSelect}
                className="text-xs font-bold text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-xs file:font-black file:text-white file:cursor-pointer"
                data-testid="input-pfp-file"
              />
            </div>
            {pfpPreview && (
              <div className="flex items-center gap-3">
                <img src={pfpPreview} alt="PFP preview" className="w-16 h-16 rounded-xl border-2 border-card-border object-cover" />
                <span className="text-xs font-bold text-muted-foreground truncate">{pfpFile?.name}</span>
              </div>
            )}
            <div className="flex gap-2 max-md:flex-wrap">
              <Button
                onClick={handlePfpSet}
                disabled={!pfpName.trim() || !pfpFile || isPfpUploading || setPfpMutation.isPending}
                className="font-bold"
                data-testid="button-pfp-set"
              >
                {isPfpUploading || setPfpMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ImagePlus className="w-4 h-4 mr-2" />}
                Upload &amp; Set
              </Button>
              <Button
                variant="outline"
                onClick={handlePfpRemove}
                disabled={!pfpName.trim() || removePfpMutation.isPending}
                className="font-bold"
                data-testid="button-pfp-remove"
              >
                {removePfpMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                Remove PFP
              </Button>
            </div>
          </div>
        </div>

        {/* Store Purchases */}
        <div className="bg-card border-2 border-card-border rounded-3xl max-md:rounded-2xl p-6 max-md:p-4 shadow-2xl flex flex-col gap-4">
          <div className="flex items-center justify-between border-b-2 border-card-border pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <ShoppingCart className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-black font-display text-white">Store Purchases</h2>
              <span className="text-xs font-black uppercase text-muted-foreground">{purchases.length} total</span>
            </div>
            <Button variant="outline" onClick={refreshPurchases} disabled={listPurchasesMutation.isPending} className="font-bold">
              {listPurchasesMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Refresh
            </Button>
          </div>
          <div className="max-h-96 overflow-y-auto custom-scrollbar bg-input border border-card-border rounded-xl">
            <div className="p-2 flex flex-col gap-1">
              {purchases.length === 0 && (
                <div className="px-3 py-6 text-center font-bold text-muted-foreground text-sm">No purchases yet.</div>
              )}
              {purchases.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-secondary">
                  <span className="font-bold text-white truncate">{p.username ?? <span className="text-muted-foreground italic">deleted player</span>}</span>
                  <span className="text-xs font-black uppercase text-amber-400 shrink-0">{p.productKey.replace(/_/g, " ")}</span>
                  <span className="ml-auto text-xs font-bold text-muted-foreground shrink-0">{new Date(p.createdAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Pending grant approvals */}
        <div className="bg-card border-2 border-card-border rounded-3xl max-md:rounded-2xl p-6 max-md:p-4 shadow-2xl flex flex-col gap-4">
          <div className="flex items-center justify-between border-b-2 border-card-border pb-4 gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-500/20 text-violet-400 flex items-center justify-center">
                <Gift className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl font-black font-display text-white">Grant Requests</h2>
                <p className="text-xs font-black uppercase text-muted-foreground">{grantRequests.length} pending</p>
              </div>
            </div>
            <Button variant="outline" onClick={refreshGrantRequests} disabled={listGrantRequestsMutation.isPending} className="font-bold shrink-0">
              {listGrantRequestsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Refresh
            </Button>
          </div>
          <p className="text-sm font-bold text-muted-foreground">
            Blook and Starter Bundle requests from the Admin Panel wait here. Approving gives the reward once; rejecting leaves the player unchanged.
          </p>
          <div className="max-h-[32rem] overflow-y-auto custom-scrollbar bg-input border border-card-border rounded-xl">
            <div className="p-2 flex flex-col gap-2">
              {grantRequests.length === 0 && (
                <div className="px-3 py-8 text-center font-bold text-muted-foreground text-sm">
                  {listGrantRequestsMutation.isPending ? "Loading requests…" : "No grant requests are waiting."}
                </div>
              )}
              {grantRequests.map((request) => {
                const busy = approveGrantRequestMutation.isPending || rejectGrantRequestMutation.isPending;
                const isBlook = request.kind === "blook";
                return (
                  <div key={request.id} className="rounded-xl border border-card-border bg-secondary/30 p-3 flex items-center gap-3 max-md:flex-wrap">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isBlook ? "bg-purple-500/20 text-purple-300" : "bg-cyan-500/20 text-cyan-300"}`}>
                      {isBlook ? <Award className="w-5 h-5" /> : <Gift className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-black text-white truncate">
                        {isBlook ? `${request.quantity}x ${request.blook}` : "Starter Bundle"} <span className="font-bold text-muted-foreground">→</span> {request.targetUsername}
                      </div>
                      <div className="text-xs font-bold text-muted-foreground">
                        Requested by {request.requesterName ?? "an admin"} · {new Date(request.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0 max-md:w-full">
                      <Button
                        size="sm"
                        onClick={() => decideGrantRequest(request, true)}
                        disabled={busy}
                        className="font-bold bg-emerald-600 hover:bg-emerald-500 max-md:flex-1"
                      >
                        <Check className="w-4 h-4 mr-1" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => decideGrantRequest(request, false)}
                        disabled={busy}
                        className="font-bold max-md:flex-1"
                      >
                        <X className="w-4 h-4 mr-1" /> Reject
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Given Bundles */}
        <div className="bg-card border-2 border-card-border rounded-3xl max-md:rounded-2xl p-6 max-md:p-4 shadow-2xl flex flex-col gap-4">
          <div className="flex items-center justify-between border-b-2 border-card-border pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                <Gift className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-black font-display text-white">Given Bundles</h2>
              <span className="text-xs font-black uppercase text-muted-foreground">{grants.length} total</span>
            </div>
            <Button variant="outline" onClick={refreshGrants} disabled={listGrantsMutation.isPending} className="font-bold">
              {listGrantsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Refresh
            </Button>
          </div>
          <div className="max-h-96 overflow-y-auto custom-scrollbar bg-input border border-card-border rounded-xl">
            <div className="p-2 flex flex-col gap-1">
              {grants.length === 0 && (
                <div className="px-3 py-6 text-center font-bold text-muted-foreground text-sm">No bundles given yet.</div>
              )}
              {grants.map((g) => (
                <div key={g.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-secondary">
                  <span className="font-bold text-cyan-300 truncate">{g.givenBy ?? <span className="text-muted-foreground italic">unknown admin</span>}</span>
                  <span className="text-xs font-black uppercase text-muted-foreground shrink-0">gave it to</span>
                  <span className="font-bold text-white truncate">{g.givenTo ?? <span className="text-muted-foreground italic">deleted player</span>}</span>
                  <span className="ml-auto text-xs font-bold text-muted-foreground shrink-0">{new Date(g.createdAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Clan Levels */}
        <div className="bg-card border-2 border-card-border rounded-3xl max-md:rounded-2xl p-6 max-md:p-4 shadow-2xl flex flex-col gap-4">
          <div className="flex items-center justify-between border-b-2 border-card-border pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-500/20 text-green-400 flex items-center justify-center">
                <Users className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-black font-display text-white">Clan Levels</h2>
            </div>
            <Button variant="outline" onClick={refreshClans} disabled={listClansMutation.isPending} className="font-bold">
              {listClansMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Refresh
            </Button>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search clans..."
              value={clanSearch}
              onChange={(e) => setClanSearch(e.target.value)}
              className="pl-9 h-12 rounded-xl bg-input border-card-border font-bold"
            />
          </div>
          <div className="max-h-96 overflow-y-auto custom-scrollbar bg-input border border-card-border rounded-xl">
            <div className="p-2 flex flex-col gap-1">
              {filteredClans.length === 0 && (
                <div className="px-3 py-6 text-center font-bold text-muted-foreground text-sm">
                  {clans.length === 0 ? "No clans yet." : "No clans match your search."}
                </div>
              )}
              {filteredClans.map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-secondary max-md:flex-col max-md:items-stretch">
                  <div className="flex-1 min-w-0 flex items-center gap-3">
                    <span className="font-bold text-white truncate">{c.name}</span>
                    <span className="text-xs font-black uppercase text-green-400 shrink-0">Lv {c.level}</span>
                    <span className="text-[10px] font-black uppercase text-muted-foreground shrink-0">{c.members} member{c.members === 1 ? "" : "s"}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Input
                      type="number"
                      min="1"
                      max="4000"
                      placeholder="Level"
                      value={clanLevelInputs[c.id] ?? ""}
                      onChange={(e) => setClanLevelInputs((prev) => ({ ...prev, [c.id]: e.target.value }))}
                      className="h-10 w-24 rounded-lg bg-background border-card-border font-bold"
                    />
                    <Button
                      size="sm"
                      onClick={() => handleSetClanLevel(c.id, parseInt(clanLevelInputs[c.id] ?? ""))}
                      disabled={!clanLevelInputs[c.id] || setClanLevelMutation.isPending}
                      className="h-10 font-black font-display uppercase tracking-wide bg-green-600 hover:bg-green-500 rounded-lg"
                    >
                      Set
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleSetClanLevel(c.id, 1)}
                      disabled={setClanLevelMutation.isPending}
                      className="h-10 font-black font-display uppercase tracking-wide bg-red-600 hover:bg-red-500 text-white rounded-lg"
                    >
                      Reset
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Everything from the mod panel (players, live trades, chat, pulls, Cloaket AI) */}
        <div className="bg-card border-2 border-card-border rounded-3xl max-md:rounded-2xl p-6 max-md:p-4 shadow-2xl flex flex-col gap-4">
          <div className="flex items-center gap-3 border-b-2 border-card-border pb-4">
            <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center">
              <Shield className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-black font-display text-white">Mod Tools</h2>
          </div>
          <ModTools password={password} />
        </div>

        {/* Everything from the admin panel, plus owner-only powers (delete players + AI delete) */}
        <AdminTools password={password} allowDelete />
      </div>

      {/* Clear confirmation */}
      <Dialog open={clearConfirm !== null} onOpenChange={(open) => { if (!open) setClearConfirm(null); }}>
        <DialogContent className="sm:max-w-md border-red-500/20 bg-background">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-500">
              <AlertTriangle className="w-5 h-5" /> Confirm Wipe
            </DialogTitle>
            <DialogDescription className="font-semibold pt-2 text-muted-foreground">
              This will permanently delete ALL {clearConfirm === "chat" ? "chat messages" : "bazaar listings"} from every player.
              <strong className="text-white block mt-2">This action cannot be undone.</strong>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:justify-between">
            <Button type="button" variant="outline" onClick={() => setClearConfirm(null)} disabled={clearChatMutation.isPending || clearBazaarMutation.isPending}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleClear}
              disabled={clearChatMutation.isPending || clearBazaarMutation.isPending}
              className="font-bold"
            >
              {(clearChatMutation.isPending || clearBazaarMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              {clearConfirm === "chat" ? "Clear All Chat" : "Clear All Listings"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
