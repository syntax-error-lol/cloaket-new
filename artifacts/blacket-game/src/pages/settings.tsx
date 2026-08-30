import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGetMe, useUpdateMe, useChangePassword, getGetMeQueryKey, getGetChatMessagesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Loader2, Palette, UserPen, KeyRound, RotateCcw, Lock, Brush } from "lucide-react";
import { toast } from "@/hooks/use-toast";

function Section({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border-2 border-card-border rounded-2xl p-6 max-md:p-4 shadow-xl">
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-black/40 shadow-inner text-white/80">
          <Icon className="w-4 h-4" />
        </div>
        <h2 className="text-xl max-md:text-lg font-black font-display tracking-wide text-white">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function BundleLock({ feature }: { feature: string }) {
  return (
    <div className="flex items-center gap-3 bg-secondary rounded-lg px-4 py-3 border border-card-border">
      <Lock className="w-5 h-5 text-muted-foreground shrink-0" />
      <p className="text-sm font-bold text-muted-foreground">
        Custom {feature} come with the <span className="text-golden">Starter Bundle</span>. Grab it in the Store to unlock!
      </p>
    </div>
  );
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: me } = useGetMe();
  const updateMeMutation = useUpdateMe();
  const changePasswordMutation = useChangePassword();

  const [color, setColor] = useState("#ffffff");
  const [nameColor, setNameColor] = useState("#ffd700");
  const [newName, setNewName] = useState("");
  const [namePassword, setNamePassword] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    if (me) {
      setColor(me.chatColor ?? "#ffffff");
      if (me.nameEffect?.startsWith("#")) setNameColor(me.nameEffect);
      setNewName((prev) => (prev === "" ? me.username : prev));
    }
  }, [me]);

  const refreshMe = () => {
    queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetChatMessagesQueryKey() });
  };

  const saveColor = (value: string | null) => {
    updateMeMutation.mutate({ data: { chatColor: value } }, {
      onSuccess: () => { refreshMe(); toast({ title: value ? "Chat color saved!" : "Chat color reset" }); },
      onError: (err: any) => toast({ title: err?.response?.data?.message ?? "Couldn't save color", variant: "destructive" }),
    });
  };

  const saveNameColor = (value: string) => {
    updateMeMutation.mutate({ data: { nameColor: value } }, {
      onSuccess: () => { refreshMe(); toast({ title: value === "golden" ? "Back to golden!" : "Name color saved!" }); },
      onError: (err: any) => toast({ title: err?.response?.data?.message ?? "Couldn't save color", variant: "destructive" }),
    });
  };

  const saveName = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name || name === me?.username || !namePassword) return;
    updateMeMutation.mutate({ data: { username: name, currentPassword: namePassword } }, {
      onSuccess: () => { setNamePassword(""); refreshMe(); toast({ title: "Name changed!" }); },
      onError: (err: any) => toast({ title: err?.response?.data?.message ?? "Couldn't change name", variant: "destructive" }),
    });
  };

  const savePassword = (e: React.FormEvent) => {
    e.preventDefault();
    changePasswordMutation.mutate({ data: { oldPassword, newPassword } }, {
      onSuccess: () => {
        setOldPassword("");
        setNewPassword("");
        toast({ title: "Password changed!" });
      },
      onError: (err: any) => toast({ title: err?.response?.data?.message ?? "Couldn't change password", variant: "destructive" }),
    });
  };

  return (
    <Layout title="Settings">
      <div className="max-w-2xl mx-auto w-full flex flex-col gap-5 max-md:gap-4 pb-8">
        <Section icon={Palette} title="Chat Text Color">
          {me?.hasBundle ? (
            <>
              <p className="text-sm font-bold text-muted-foreground mb-3">Pick any color for your messages in the game chat.</p>
              <div className="flex items-center gap-3 flex-wrap">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-14 h-11 rounded-lg border-2 border-card-border bg-secondary cursor-pointer p-1"
                  aria-label="Chat text color"
                />
                <div className="flex-1 min-w-[140px] bg-secondary rounded-lg px-4 py-2.5 border border-card-border">
                  <span className="font-semibold text-lg" style={{ color }}>Your chat will look like this</span>
                </div>
                <Button onClick={() => saveColor(color)} disabled={updateMeMutation.isPending} className="font-black">
                  Save
                </Button>
                {me?.chatColor && (
                  <Button variant="outline" onClick={() => saveColor(null)} disabled={updateMeMutation.isPending} title="Reset to default">
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </>
          ) : (
            <BundleLock feature="chat colors" />
          )}
        </Section>

        <Section icon={Brush} title="Name Color">
          {me?.hasBundle ? (
            <>
              <p className="text-sm font-bold text-muted-foreground mb-3">Color your name any solid color — or switch back to golden anytime.</p>
              <div className="flex items-center gap-3 flex-wrap">
                <input
                  type="color"
                  value={nameColor}
                  onChange={(e) => setNameColor(e.target.value)}
                  className="w-14 h-11 rounded-lg border-2 border-card-border bg-secondary cursor-pointer p-1"
                  aria-label="Name color"
                />
                <div className="flex-1 min-w-[140px] bg-secondary rounded-lg px-4 py-2.5 border border-card-border">
                  <span className="font-black text-lg" style={{ color: nameColor }}>{me.username}</span>
                </div>
                <Button onClick={() => saveNameColor(nameColor)} disabled={updateMeMutation.isPending} className="font-black">
                  Save
                </Button>
                {me.nameEffect !== "golden" && (
                  <Button variant="outline" onClick={() => saveNameColor("golden")} disabled={updateMeMutation.isPending} className="font-black">
                    <span className="text-golden">Back to Golden</span>
                  </Button>
                )}
              </div>
            </>
          ) : (
            <BundleLock feature="name colors" />
          )}
        </Section>

        <Section icon={UserPen} title="Change Name">
          <form onSubmit={saveName} className="flex flex-col gap-3">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={20}
              className="h-11 bg-secondary border-card-border font-bold"
              placeholder="New username"
            />
            <Input
              type="password"
              value={namePassword}
              onChange={(e) => setNamePassword(e.target.value)}
              className="h-11 bg-secondary border-card-border font-bold"
              placeholder="Current password"
              autoComplete="current-password"
              data-testid="input-name-current-password"
            />
            <Button
              type="submit"
              disabled={updateMeMutation.isPending || !newName.trim() || newName.trim() === me?.username || !namePassword}
              className="font-black self-start"
            >
              {updateMeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
            </Button>
          </form>
        </Section>

        <Section icon={KeyRound} title="Change Password">
          <form onSubmit={savePassword} className="flex flex-col gap-3">
            <Input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              className="h-11 bg-secondary border-card-border font-bold"
              placeholder="Current password"
              autoComplete="current-password"
            />
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="h-11 bg-secondary border-card-border font-bold"
              placeholder="New password (at least 8 characters)"
              autoComplete="new-password"
            />
            <Button
              type="submit"
              disabled={changePasswordMutation.isPending || !oldPassword || newPassword.length < 8}
              className="font-black self-start"
            >
              {changePasswordMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Change Password"}
            </Button>
          </form>
        </Section>
      </div>
    </Layout>
  );
}
