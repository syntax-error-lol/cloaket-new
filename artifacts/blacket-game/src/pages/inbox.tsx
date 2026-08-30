import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  useGetMe, useGetDmConversations, useGetDmThread, useSendDm, useClaimDmGift, useGetMyBlooks,
  getGetDmConversationsQueryKey, getGetDmThreadQueryKey, getGetMyBlooksQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { Loader2, Send, Gift, Search, Users, MailOpen, BadgeCheck } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { nameEffectClass, nameEffectStyle } from "@/lib/utils";
import { ChatMessageRow } from "@/components/chat-message";
import { blookImageAnimation } from "@/lib/rarity";

export default function InboxPage() {
  const queryClient = useQueryClient();
  // Support /inbox?to=Username deep links (e.g. the Message button on profiles).
  const [activeUser, setActiveUser] = useState<string | null>(() => {
    const to = new URLSearchParams(window.location.search).get("to");
    return to || null;
  });
  const [searchName, setSearchName] = useState("");
  const [draft, setDraft] = useState("");
  const [isGiftOpen, setIsGiftOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: me } = useGetMe();
  const { data: convos } = useGetDmConversations({ query: { refetchInterval: 10000, queryKey: getGetDmConversationsQueryKey() } });
  const { data: thread, isLoading: isThreadLoading, isError: isThreadError } = useGetDmThread(activeUser ?? "", {
    query: { enabled: !!activeUser, refetchInterval: 5000, queryKey: getGetDmThreadQueryKey(activeUser ?? "") },
  });
  const { data: myBlooks } = useGetMyBlooks({ query: { enabled: isGiftOpen, queryKey: getGetMyBlooksQueryKey() } });

  const sendMutation = useSendDm();
  const claimMutation = useClaimDmGift();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [thread?.messages.length, activeUser]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: getGetDmConversationsQueryKey() });
    if (activeUser) queryClient.invalidateQueries({ queryKey: getGetDmThreadQueryKey(activeUser) });
  };

  const send = (giftBlook?: string) => {
    const content = draft.trim();
    if (!activeUser || (!content && !giftBlook)) return;
    sendMutation.mutate({ username: activeUser, data: { content, ...(giftBlook ? { giftBlook } : {}) } }, {
      onSuccess: () => {
        setDraft("");
        setIsGiftOpen(false);
        if (giftBlook) queryClient.invalidateQueries({ queryKey: getGetMyBlooksQueryKey() });
        refresh();
      },
      onError: (err: any) => toast({ title: err?.data?.message ?? "Couldn't send", variant: "destructive" }),
    });
  };

  const claim = (id: number) => {
    claimMutation.mutate({ id }, {
      onSuccess: (res) => {
        toast({ title: res.message });
        queryClient.invalidateQueries({ queryKey: getGetMyBlooksQueryKey() });
        refresh();
      },
      onError: (err: any) => toast({ title: err?.data?.message ?? "Couldn't claim", variant: "destructive" }),
    });
  };

  const openThread = (name: string) => {
    setActiveUser(name);
    setSearchName("");
  };

  return (
    <Layout title="Inbox">
      <div className="flex gap-4 h-[calc(100vh-9rem)] max-md:flex-col max-md:h-auto">
        {/* Left: conversations + friends */}
        <div className={`w-80 max-md:w-full shrink-0 flex flex-col gap-3 ${activeUser ? "max-md:hidden" : ""}`}>
          <form
            onSubmit={(e) => { e.preventDefault(); if (searchName.trim()) openThread(searchName.trim()); }}
            className="flex gap-2"
          >
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                placeholder="Message a player..."
                className="pl-9 h-10 bg-secondary border-card-border font-bold"
              />
            </div>
            <Button type="submit" disabled={!searchName.trim()} className="font-black h-10">Go</Button>
          </form>

          <div className="bg-card border-2 border-card-border rounded-xl flex-1 min-h-[200px] max-md:max-h-[50vh] overflow-hidden flex flex-col">
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-2">
                {(convos?.conversations ?? []).length === 0 && (
                  <div className="text-center text-muted-foreground font-bold text-sm py-8 px-4">
                    <MailOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    No messages yet. Search a player above to start chatting!
                  </div>
                )}
                {(convos?.conversations ?? []).map((c) => (
                  <button
                    key={c.username}
                    onClick={() => openThread(c.username)}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-colors text-left ${activeUser === c.username ? "bg-primary/20" : "hover:bg-secondary"}`}
                  >
                    {c.avatarImage
                      ? <img src={c.avatarImage} alt="" className="w-10 h-10 object-contain shrink-0" />
                      : <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center font-black shrink-0">{c.username[0]?.toUpperCase()}</div>}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`font-black truncate ${nameEffectClass(c.nameEffect)}`} style={nameEffectStyle(c.nameEffect)}>{c.username}</span>
                        {c.isFriend && <Users className="w-3.5 h-3.5 text-green-400 shrink-0" aria-label="Friend" />}
                      </div>
                      <div className="text-xs text-muted-foreground font-bold truncate">{c.lastMessage}</div>
                    </div>
                    {c.unread > 0 && (
                      <span className="bg-primary text-primary-foreground text-xs font-black rounded-full min-w-5 h-5 px-1.5 flex items-center justify-center shrink-0">{c.unread}</span>
                    )}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* Right: thread */}
        <div className={`flex-1 bg-card border-2 border-card-border rounded-xl flex flex-col overflow-hidden max-md:min-h-[60vh] ${!activeUser ? "max-md:hidden" : ""}`}>
          {!activeUser ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground font-bold gap-2">
              <MailOpen className="w-12 h-12 opacity-40" />
              Pick a conversation or search a player
            </div>
          ) : isThreadLoading ? (
            <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
          ) : isThreadError || !thread ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground font-bold">
              Player not found
              <Button variant="outline" onClick={() => setActiveUser(null)}>Back</Button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 px-4 py-3 border-b-2 border-card-border bg-secondary/40">
                <Button variant="ghost" size="sm" className="md:hidden font-black px-2" onClick={() => setActiveUser(null)}>←</Button>
                {thread.partner.avatarImage
                  ? <img src={thread.partner.avatarImage} alt="" className="w-9 h-9 object-contain" />
                  : <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center font-black">{thread.partner.username[0]?.toUpperCase()}</div>}
                <span className={`font-black text-lg ${nameEffectClass(thread.partner.nameEffect)}`} style={nameEffectStyle(thread.partner.nameEffect)}>{thread.partner.username}</span>
                {thread.partner.isFriend && <span className="text-xs font-black text-green-400 bg-green-500/15 rounded-full px-2 py-0.5 flex items-center gap-1"><Users className="w-3 h-3" /> Friend</span>}
              </div>
              <ScrollArea className="flex-1">
                <div className="p-4 max-md:p-3 flex flex-col gap-0.5">
                  {thread.messages.map((m, i) => {
                    const prev = thread.messages[i - 1];
                    // Same style as public chat: consecutive messages from the
                    // same author collapse into one Discord-style group.
                    const grouped = !!prev && prev.fromMe === m.fromMe && !prev.giftBlook && !prev.pull;
                    const rowMsg = {
                      id: m.id,
                      author: m.fromMe ? me?.username ?? "You" : thread.partner.username,
                      avatarImage: m.fromMe ? me?.avatarImage ?? null : thread.partner.avatarImage,
                      nameEffect: m.fromMe ? me?.nameEffect ?? null : thread.partner.nameEffect,
                      chatColor: m.fromMe ? me?.chatColor ?? null : thread.partner.chatColor,
                      content: m.content,
                      isMine: m.fromMe,
                    };
                    return (
                      <div key={m.id}>
                        {m.content && <ChatMessageRow msg={rowMsg} meUsername={me?.username} grouped={grouped} />}
                        {(m.pull || m.giftBlook) && (
                          <>
                          {!m.content && !grouped && (
                            <ChatMessageRow msg={{ ...rowMsg, content: "" }} meUsername={me?.username} />
                          )}
                          <div className={`flex ${m.content || grouped ? "" : "mt-1"}`}>
                            <div className="w-10 max-md:w-9 shrink-0 mr-2" />
                            <div className="flex flex-col gap-2 py-1">
                              {m.pull && (
                                <div className="bg-gradient-to-b from-black/40 to-black/20 border border-white/15 rounded-xl p-3 flex flex-col items-center gap-1.5 w-[200px]">
                                  <div className="text-[10px] font-black uppercase tracking-widest text-yellow-300 flex items-center gap-1">
                                    <BadgeCheck className="w-3.5 h-3.5" /> Official Cloaket Pull
                                  </div>
                                  {m.pull.image && <img src={m.pull.image} alt={m.pull.blookName} className={`w-20 h-20 object-contain ${blookImageAnimation(m.pull.blookName)}`} />}
                                  <div className="font-black">{m.pull.blookName}</div>
                                  {m.pull.rarity && <div className="text-xs font-black uppercase tracking-wide opacity-80">{m.pull.rarity}</div>}
                                  <div className="text-[10px] font-bold opacity-60 text-center">
                                    Pulled from the {m.pull.packName} pack · {new Date(m.pull.pulledAt).toLocaleDateString()}
                                  </div>
                                </div>
                              )}
                              {m.giftBlook && (
                                <div className="bg-secondary border border-card-border rounded-xl p-3 flex flex-col items-center gap-2 w-[180px]">
                                  <div className="text-xs font-black uppercase tracking-wide flex items-center gap-1"><Gift className="w-3.5 h-3.5" /> Gift</div>
                                  {m.giftImage && <img src={m.giftImage} alt={m.giftBlook} className={`w-20 h-20 object-contain ${blookImageAnimation(m.giftBlook)}`} />}
                                  <div className="font-black">{m.giftBlook}</div>
                                  {m.fromMe ? (
                                    <div className="text-xs font-bold opacity-70">{m.giftClaimed ? "Claimed" : "Not claimed yet"}</div>
                                  ) : m.giftClaimed ? (
                                    <div className="text-xs font-bold text-green-400">Claimed!</div>
                                  ) : (
                                    <Button size="sm" className="font-black h-8 bg-green-600 hover:bg-green-500" disabled={claimMutation.isPending} onClick={() => claim(m.id)}>
                                      Claim
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>
              </ScrollArea>
              <form
                onSubmit={(e) => { e.preventDefault(); send(); }}
                className="flex gap-2 p-3 border-t-2 border-card-border bg-secondary/30"
              >
                <Button type="button" variant="outline" className="h-11 font-black shrink-0" onClick={() => setIsGiftOpen(true)} title="Send a blook gift">
                  <Gift className="w-5 h-5" />
                </Button>
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  maxLength={500}
                  placeholder={`Message ${thread.partner.username}...`}
                  className="flex-1 h-11 bg-secondary border-card-border font-bold"
                />
                <Button type="submit" disabled={sendMutation.isPending || !draft.trim()} className="h-11 font-black shrink-0">
                  {sendMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>

      {/* Gift picker */}
      <Dialog open={isGiftOpen} onOpenChange={setIsGiftOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display font-black text-2xl flex items-center gap-2"><Gift className="w-6 h-6" /> Send a Blook Gift</DialogTitle>
          </DialogHeader>
          <p className="text-sm font-bold text-muted-foreground -mt-2">Pick a blook from your collection to gift to {activeUser}. It leaves your collection right away.</p>
          <ScrollArea className="max-h-[50vh]">
            <div className="grid grid-cols-4 max-md:grid-cols-3 gap-3 p-1">
              {(myBlooks ?? []).filter((b) => b.quantity > 0).map((b) => (
                <button
                  key={b.name}
                  disabled={sendMutation.isPending}
                  onClick={() => send(b.name)}
                  className="bg-secondary border-2 border-card-border rounded-xl p-3 flex flex-col items-center gap-1.5 hover:border-primary transition-colors"
                >
                  <img src={b.image} alt={b.name} className={`w-16 h-16 object-contain ${blookImageAnimation(b.name)}`} />
                  <span className="text-xs font-black truncate w-full text-center">{b.name}</span>
                  <span className="text-[10px] font-bold text-muted-foreground">x{b.quantity}</span>
                </button>
              ))}
              {(myBlooks ?? []).filter((b) => b.quantity > 0).length === 0 && (
                <div className="col-span-full text-center text-muted-foreground font-bold py-8">You don't have any blooks to gift.</div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
