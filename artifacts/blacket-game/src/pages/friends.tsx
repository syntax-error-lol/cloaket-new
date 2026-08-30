import { useState } from "react";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, UserPlus, Check, X, Users, UserMinus } from "lucide-react";
import {
  useGetFriends, useSendFriendRequest, useAcceptFriendRequest, useDeclineFriendRequest, useRemoveFriend,
  getGetFriendsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { nameEffectClass, nameEffectStyle } from "@/lib/utils";
import { PlayerProfileDialog } from "@/components/player-profile-dialog";

function FriendAvatar({ image, username, size = "w-9 h-9" }: { image?: string | null; username: string; size?: string }) {
  if (image) return <img src={image} alt="" className={`${size} object-contain shrink-0`} />;
  return (
    <div className={`${size} shrink-0 rounded-lg bg-secondary border border-card-border flex items-center justify-center font-display font-black text-white`}>
      {username[0]?.toUpperCase()}
    </div>
  );
}

export default function FriendsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useGetFriends({
    query: { refetchInterval: 15000, queryKey: getGetFriendsQueryKey() },
  });

  const [addName, setAddName] = useState("");
  const [profileUsername, setProfileUsername] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: getGetFriendsQueryKey() });
  const onError = (err: unknown) =>
    toast({ title: "Failed", description: (err as any)?.data?.message || "Error", variant: "destructive" });

  const sendMutation = useSendFriendRequest();
  const acceptMutation = useAcceptFriendRequest();
  const declineMutation = useDeclineFriendRequest();
  const removeMutation = useRemoveFriend();

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const username = addName.trim();
    if (!username) return;
    sendMutation.mutate({ data: { username } }, {
      onSuccess: (res) => {
        toast({ title: res.status === "accepted" ? "Friends!" : "Request Sent!", description: res.message });
        setAddName("");
        refresh();
      },
      onError,
    });
  };

  const friends = data?.friends ?? [];
  const incoming = data?.incoming ?? [];
  const outgoing = data?.outgoing ?? [];

  return (
    <Layout title="Friends" fixedHeight>
      <div className="max-w-3xl mx-auto w-full flex flex-col gap-4 flex-1 min-h-0">
        {/* Add friend */}
        <form onSubmit={handleAdd} className="flex gap-2 bg-card border-2 border-card-border rounded-2xl p-3">
          <Input
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            placeholder="Add a friend by username..."
            className="font-bold bg-input border-card-border"
            data-testid="input-add-friend"
          />
          <Button type="submit" disabled={!addName.trim() || sendMutation.isPending} className="font-black shrink-0" data-testid="button-send-friend-request">
            {sendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <UserPlus className="w-4 h-4 mr-1" />}
            Add
          </Button>
        </form>

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>
        ) : (
          <>
            {/* Incoming requests */}
            {incoming.length > 0 && (
              <div className="bg-card border-2 border-card-border rounded-2xl p-4 flex flex-col gap-2">
                <h2 className="text-lg font-black font-display text-white">Friend Requests <span className="text-primary">({incoming.length})</span></h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[196px] overflow-y-auto pr-1">
                {incoming.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 bg-secondary/50 border border-card-border rounded-xl px-3 py-2 min-w-0">
                    <FriendAvatar image={r.avatarImage} username={r.username} />
                    <button className="font-black text-white truncate hover:underline" onClick={() => setProfileUsername(r.username)}>
                      {r.username}
                    </button>
                    <div className="ml-auto flex gap-1 shrink-0">
                      <Button size="sm" className="font-bold bg-green-500 hover:bg-green-400 text-green-950"
                        disabled={acceptMutation.isPending}
                        onClick={() => acceptMutation.mutate({ id: r.id }, { onSuccess: refresh, onError })}
                        data-testid={`button-accept-${r.username}`}>
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="font-bold text-red-400 hover:text-red-300"
                        disabled={declineMutation.isPending}
                        onClick={() => declineMutation.mutate({ id: r.id }, { onSuccess: refresh, onError })}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                </div>
              </div>
            )}

            {/* Friends list — grows to fill whatever space requests don't use */}
            <div className="bg-card border-2 border-card-border rounded-2xl p-4 flex flex-col gap-2 flex-1 min-h-0">
              <h2 className="text-lg font-black font-display text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" /> Friends <span className="text-muted-foreground text-sm font-bold">({friends.length})</span>
              </h2>
              {friends.length === 0 ? (
                <p className="text-center py-8 font-bold text-muted-foreground flex-1 flex items-center justify-center">
                  No friends yet. Add someone above, or hit "Add Friend" on a player's stats.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 auto-rows-min flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1">
                {friends.map((f) => (
                  <div
                    key={f.username}
                    className="flex items-center gap-3 bg-secondary/50 border border-card-border rounded-xl px-3 py-2 min-w-0 cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => setProfileUsername(f.username)}
                    data-testid={`friend-row-${f.username}`}
                  >
                    <FriendAvatar image={f.avatarImage} username={f.username} size="w-10 h-10" />
                    <span className={`font-black text-white truncate ${nameEffectClass(f.nameEffect)}`} style={nameEffectStyle(f.nameEffect)}>
                      {f.username}
                    </span>
                    {f.isOnline && <span className="w-2.5 h-2.5 bg-green-500 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.8)] shrink-0" title="Online" />}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto shrink-0 text-muted-foreground hover:text-red-400 font-bold"
                      disabled={removeMutation.isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeMutation.mutate({ username: f.username }, {
                          onSuccess: () => { toast({ title: "Friend removed" }); refresh(); },
                          onError,
                        });
                      }}
                      title="Remove friend"
                    >
                      <UserMinus className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                </div>
              )}
            </div>

            {/* Outgoing requests */}
            {outgoing.length > 0 && (
              <div className="bg-card border-2 border-card-border rounded-2xl p-4 flex flex-col gap-2">
                <h2 className="text-lg font-black font-display text-white">Sent Requests <span className="text-muted-foreground text-sm font-bold">({outgoing.length})</span></h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[196px] overflow-y-auto pr-1">
                {outgoing.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 bg-secondary/50 border border-card-border rounded-xl px-3 py-2 min-w-0">
                    <FriendAvatar image={r.avatarImage} username={r.username} />
                    <button className="font-black text-white truncate hover:underline" onClick={() => setProfileUsername(r.username)}>
                      {r.username}
                    </button>
                    <span className="text-xs font-bold text-muted-foreground">Pending...</span>
                    <Button size="sm" variant="ghost" className="ml-auto shrink-0 text-red-400 hover:text-red-300 font-bold"
                      disabled={declineMutation.isPending}
                      onClick={() => declineMutation.mutate({ id: r.id }, { onSuccess: refresh, onError })}>
                      <X className="w-4 h-4 mr-1" /> Cancel
                    </Button>
                  </div>
                ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <PlayerProfileDialog username={profileUsername} onClose={() => setProfileUsername(null)} />
    </Layout>
  );
}
