import { Layout } from "@/components/layout/layout";
import { useGetChatMessages, useSendChatMessage, useDeleteChatMessage, useGetMe, useGetOnlineCount, getGetChatMessagesQueryKey, getGetOnlineCountQueryKey, getGetMeQueryKey, ApiError } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Send, Loader2, ChevronsDown } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { ChatMessageRow, mentionsUser } from "@/components/chat-message";
import { PlayerProfileDialog } from "@/components/player-profile-dialog";

function OnlineBadge() {
  const { data } = useGetOnlineCount({
    query: { refetchInterval: 30000, queryKey: getGetOnlineCountQueryKey() }
  });
  if (!data) return null;
  return (
    <span className="inline-flex items-center gap-1.5 ml-3 align-middle" title={`${data.online} players online`}>
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.9)]" />
      </span>
      <span className="font-black text-sm text-green-400">{data.online}</span>
    </span>
  );
}

/** A message the player just sent that the server hasn't confirmed yet. */
interface PendingMsg {
  key: number;
  content: string;
}

export default function Chat() {
  const [content, setContent] = useState("");
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingMsg[]>([]);
  const pendingKey = useRef(0);

  const queryClient = useQueryClient();
  // Chat mutations do their own targeted cache updates — the global
  // "refetch everything" invalidation would fire ~8 requests per message.
  const sendMutation = useSendChatMessage({ mutation: { meta: { noGlobalInvalidate: true } } });
  const deleteMutation = useDeleteChatMessage({ mutation: { meta: { noGlobalInvalidate: true } } });
  const { data: me } = useGetMe();

  const { data: messages, isLoading } = useGetChatMessages(undefined, {
    query: {
      refetchInterval: 2000,
      queryKey: getGetChatMessagesQueryKey()
    }
  });

  // Remove the message from the list instantly; restore on failure.
  const deleteMutate = deleteMutation.mutate;
  const handleDelete = useCallback((id: number) => {
    queryClient.setQueryData(getGetChatMessagesQueryKey(), (old: unknown) =>
      Array.isArray(old) ? old.filter((m) => m.id !== id) : old,
    );
    deleteMutate({ id }, {
      onError: () => {
        toast({ title: "Couldn't delete message", variant: "destructive" });
        void queryClient.invalidateQueries({ queryKey: getGetChatMessagesQueryKey() });
      },
    });
  }, [queryClient, deleteMutate]);

  const scrollRef = useRef<HTMLDivElement>(null);
  // Short two-tone "ping" via WebAudio — no sound file needed.
  const playPingSound = () => {
    try {
      const ctx = new AudioContext();
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      gain.connect(ctx.destination);
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.09);
      osc.connect(gain);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
      osc.onended = () => ctx.close();
    } catch {
      // Audio might be blocked before the user interacts with the page.
    }
  };
  const lastMessageCount = useRef(messages?.length || 0);
  const [showJump, setShowJump] = useState(false);

  // Show the "skip to bottom" button whenever the user has scrolled up a bit.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowJump(distance > 300);
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [messages]);

  // Very fast glide to the bottom (~200ms regardless of how far up you are).
  const jumpToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    const start = el.scrollTop;
    const startTime = performance.now();
    const DURATION = 200;
    const step = (now: number) => {
      const t = Math.min((now - startTime) / DURATION, 1);
      const ease = 1 - (1 - t) * (1 - t); // ease-out
      const target = el.scrollHeight - el.clientHeight; // re-read in case it grows
      el.scrollTop = start + (target - start) * ease;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const lastSeenId = useRef<number | null>(null);

  // Ping: toast when a new message mentions me.
  useEffect(() => {
    if (!messages || !me?.username) return;
    if (lastSeenId.current === null) {
      lastSeenId.current = messages.length > 0 ? messages[messages.length - 1]!.id : 0;
      return;
    }
    const pings = messages.filter(
      (m) => m.id > lastSeenId.current! && !m.isMine && mentionsUser(m, me.username),
    );
    if (pings.length > 0) playPingSound();
    if (pings.length === 1) {
      toast({ title: `${pings[0]!.author} mentioned you`, description: pings[0]!.content });
    } else if (pings.length > 1) {
      const latest = pings[pings.length - 1]!;
      toast({ title: `${pings.length} new mentions`, description: `Latest from ${latest.author}: ${latest.content}` });
    }
    if (messages.length > 0) {
      lastSeenId.current = Math.max(lastSeenId.current, messages[messages.length - 1]!.id);
    }
  }, [messages, me]);

  useEffect(() => {
    if (!messages) return;
    if (scrollRef.current) {
      const scrollElement = scrollRef.current;
      if (scrollElement) {
        const distanceToBottom = scrollElement.scrollHeight - scrollElement.scrollTop - scrollElement.clientHeight;
        const isAtBottom = distanceToBottom < 150;
        const isFirstLoad = lastMessageCount.current === 0;
        const hasNewMessageFromMe = messages.length > 0 && messages[messages.length - 1]?.author === me?.username;

        if (isAtBottom || isFirstLoad || hasNewMessageFromMe) {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (scrollElement) {
                // Jump instantly on first load; glide smoothly afterwards.
                scrollElement.scrollTo({
                  top: scrollElement.scrollHeight,
                  behavior: isFirstLoad ? "auto" : "smooth",
                });
              }
            });
          });
        }
      }
    }
    lastMessageCount.current = messages.length;
  }, [messages, me]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const text = content.trim();
    if (!text) return;

    // Optimistic: clear the input and show the message immediately — the
    // server round-trip happens in the background.
    const key = ++pendingKey.current;
    setContent("");
    setPending((p) => [...p, { key, content: text }]);
    requestAnimationFrame(jumpToBottom);

    sendMutation.mutate({ data: { content: text } }, {
      onSuccess: (real) => {
        // Swap the placeholder for the confirmed message without waiting
        // for the next poll (dedupe in case the poll already delivered it).
        queryClient.setQueryData(getGetChatMessagesQueryKey(), (old: unknown) => {
          if (!Array.isArray(old)) return old;
          return old.some((m) => m.id === real.id) ? old : [...old, real];
        });
        setPending((p) => p.filter((m) => m.key !== key));
        // Each message pays +1 token — refresh just the token counter.
        void queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      },
      onError: (err) => {
        setPending((p) => p.filter((m) => m.key !== key));
        // Give the text back so it isn't lost (unless they typed something new).
        setContent((cur) => (cur ? cur : text));
        const reason = err instanceof ApiError ? (err.data as { message?: string } | null)?.message : undefined;
        toast({ title: "Message not sent", description: reason ?? "Please try again.", variant: "destructive" });
      },
    });
  };

  // Confirmed messages + optimistic ones (rendered dimmed at the end).
  const allRows = useMemo(() => {
    const confirmed: any[] = messages ?? [];
    if (pending.length === 0) return confirmed;
    let lastMine: any;
    for (let i = confirmed.length - 1; i >= 0; i--) {
      if (confirmed[i].isMine) { lastMine = confirmed[i]; break; }
    }
    const pendingRows = pending.map((p) => ({
      id: -p.key, // unique negative ids never collide with real ones
      author: me?.username ?? "",
      avatarBlook: lastMine?.avatarBlook ?? null,
      avatarImage: lastMine?.avatarImage ?? (me as any)?.avatarImage ?? null,
      badges: lastMine?.badges ?? (me as any)?.badges ?? [],
      nameEffect: lastMine?.nameEffect ?? null,
      chatColor: lastMine?.chatColor ?? null,
      content: p.content,
      mentions: [],
      mentionEffects: {},
      isMine: true,
      createdAt: new Date().toISOString(),
      clanName: lastMine?.clanName ?? null,
      clanColor: lastMine?.clanColor ?? null,
      pending: true,
    }));
    return [...confirmed, ...pendingRows];
  }, [messages, pending, me]);

  return (
    <Layout title="Global Chat" titleBadge={<OnlineBadge />} fixedHeight>
      <div className="flex flex-col h-full overflow-hidden min-h-0 max-w-7xl mx-auto w-full relative">
        {showJump && (
          <button
            type="button"
            onClick={jumpToBottom}
            aria-label="Skip to bottom"
            className="absolute bottom-24 right-6 max-md:right-3 z-20 flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground font-black text-sm px-4 py-2.5 shadow-lg shadow-black/40 border border-white/10 hover:brightness-110 active:scale-95 transition"
            data-testid="button-skip-to-bottom"
          >
            <ChevronsDown className="w-4 h-4" />
            Skip
          </button>
        )}
        <div className="flex-1 overflow-y-auto pr-4 max-md:pr-2 custom-scrollbar min-h-0" ref={scrollRef}>
          {isLoading && !messages ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
            </div>
          ) : allRows.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground font-bold text-lg">
              No messages yet. Say hi!
            </div>
          ) : (
            <div className="flex flex-col pb-4">
              {allRows.map((msg: any, i: number) => {
                const prev = i > 0 ? allRows[i - 1] : null;
                const grouped = !!prev && prev.author === msg.author;
                return (
                  <div key={msg.id} className={grouped ? "mt-0.5" : "mt-3 first:mt-0"}>
                    <ChatMessageRow msg={msg} meUsername={me?.username} onAvatarClick={setProfileUsername} onDelete={handleDelete} grouped={grouped} pending={!!msg.pending} />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="pt-4 max-md:pt-3 max-md:pb-1 shrink-0 relative z-10">
          <form onSubmit={handleSend} className="flex gap-2 w-full min-w-0 bg-card p-2 rounded-xl border-2 border-card-border shadow-lg max-md:border-x-0 max-md:rounded-none max-md:border-b-0 max-md:bg-transparent">
            <Input 
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 font-bold h-11 max-md:text-base bg-secondary rounded-lg border-2 border-transparent focus-visible:border-primary/50 min-w-0 px-4 focus-visible:ring-0 shadow-inner"
              maxLength={500}
              autoFocus
            />
            <Button type="submit" disabled={!content.trim()} className="h-11 px-6 max-md:px-4 shrink-0 rounded-lg font-black bg-green-500 hover:bg-green-400 text-green-950 shadow-[0_4px_0_rgb(21,128,61)] hover:translate-y-1 hover:shadow-none transition-all active:translate-y-1 active:shadow-none">
              <Send className="w-4 h-4 mr-2 max-md:mr-0" /> <span className="max-md:hidden uppercase tracking-wider">Send</span>
            </Button>
          </form>
        </div>
      </div>

      <PlayerProfileDialog username={profileUsername} onClose={() => setProfileUsername(null)} />
    </Layout>
  );
}
