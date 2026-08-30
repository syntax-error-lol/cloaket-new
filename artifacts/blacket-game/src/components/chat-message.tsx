import { Fragment, memo } from "react";
import { Trash2 } from "lucide-react";
import { nameEffectClass, nameEffectStyle } from "@/lib/utils";
import { BadgeList } from "@/components/badge-list";

interface ChatMessageProps {
  msg: any;
  meUsername?: string;
  onAvatarClick?: (username: string) => void;
  /** Shown (on hover) only on your own messages. */
  onDelete?: (id: number) => void;
  /**
   * When true, this message is a follow-up from the same author with nobody
   * else in between — rendered as just the text on a new line (Discord-style),
   * without repeating the avatar and name.
   */
  grouped?: boolean;
  hideClan?: boolean;
  /** Optimistic message that hasn't been confirmed by the server yet. */
  pending?: boolean;
}

// A message pings the user only if the server recorded them as a valid
// (online-at-send-time) mention.
export function mentionsUser(msg: any, username?: string): boolean {
  if (!username || !Array.isArray(msg.mentions)) return false;
  return msg.mentions.some((m: string) => m.toLowerCase() === username.toLowerCase());
}

// Render message content with valid @mentions bolded and highlighted.
// Only names the server confirmed (player existed AND was online when the
// message was sent) are styled; anything else stays plain text.
function MessageContent({ content, mentions, mentionEffects, meUsername, onMentionClick }: { content: string; mentions?: string[]; mentionEffects?: Record<string, string | null>; meUsername?: string; onMentionClick?: (username: string) => void }) {
  const valid = new Map((mentions ?? []).map((m) => [m.toLowerCase(), m]));
  const parts = content.split(/(@[A-Za-z0-9_-]+)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("@") && part.length > 1) {
          const name = part.slice(1);
          const canonical = valid.get(name.toLowerCase());
          if (canonical) {
            const isMe = meUsername && name.toLowerCase() === meUsername.toLowerCase();
            // Only YOUR pings get the yellow highlight. Everyone else's
            // mentions are just bold in that player's username color
            // (rainbow/golden name effects carry over).
            const rawEffect = mentionEffects?.[canonical] ?? null;
            const effect = nameEffectClass(rawEffect);
            return (
              <span
                key={i}
                className={`font-black cursor-pointer ${isMe ? "text-yellow-300 bg-yellow-500/20 rounded px-0.5" : `${effect || "text-foreground"} hover:underline`}`}
                style={isMe ? undefined : nameEffectStyle(rawEffect)}
                onClick={() => onMentionClick?.(name)}
              >
                {part}
              </span>
            );
          }
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Delete message"
      className="opacity-0 group-hover/msg:opacity-100 transition-opacity shrink-0 self-center p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  );
}

function ChatMessageRowInner({ msg, meUsername, onAvatarClick, onDelete, grouped = false, hideClan = false, pending = false }: ChatMessageProps) {
  const pingsMe = !msg.isMine && mentionsUser(msg, meUsername);
  const canDelete = !!onDelete && !!msg.isMine && !pending;
  const dim = pending ? "opacity-60" : "";
  if (grouped) {
    return (
      <div className={`group/msg flex items-start min-w-0 w-full ${dim} ${pingsMe ? "bg-yellow-500/10 border-l-2 border-yellow-400 pl-2 -ml-2 rounded-r-md" : ""}`}>
        <div className="w-10 max-md:w-9 shrink-0 mr-2" />
        <div className="flex-1 min-w-0 leading-snug text-lg max-md:text-base break-words">
          <span className="text-foreground font-semibold align-middle" style={msg.chatColor ? { color: msg.chatColor } : undefined}>
            <MessageContent content={msg.content} mentions={msg.mentions} mentionEffects={msg.mentionEffects} meUsername={meUsername} onMentionClick={onAvatarClick} />
          </span>
        </div>
        {canDelete && <DeleteButton onClick={() => onDelete!(msg.id)} />}
      </div>
    );
  }
  return (
    <div className={`group/msg flex items-start gap-2 flex-row py-1 min-w-0 w-full ${dim} ${pingsMe ? "bg-yellow-500/10 border-l-2 border-yellow-400 pl-2 -ml-2 rounded-r-md" : ""}`}>
      <div 
        className={`w-10 h-10 max-md:w-9 max-md:h-9 rounded-lg overflow-hidden bg-secondary border border-card-border shrink-0 flex items-center justify-center text-base font-bold mt-0.5 ${onAvatarClick ? 'cursor-pointer hover:border-primary transition-colors' : ''}`}
        onClick={() => onAvatarClick?.(msg.author)}
      >
        {msg.avatarImage ? (
          <img src={msg.avatarImage} alt="Avatar" className="w-full h-full object-contain" />
        ) : (
          <span className="font-display">{msg.author.charAt(0).toUpperCase()}</span>
        )}
      </div>
      
      <div className="flex-1 min-w-0 leading-snug text-lg max-md:text-base break-words">
        <div className="flex items-center gap-1 min-w-0">
          <span 
            className={`font-bold ${onAvatarClick ? 'cursor-pointer hover:text-white transition-colors' : ''} ${nameEffectClass(msg.nameEffect) || 'text-foreground'}`}
            style={nameEffectStyle(msg.nameEffect)}
            onClick={() => onAvatarClick?.(msg.author)}
          >
            {msg.author}
          </span>
          {!hideClan && msg.clanName && (
            <span 
              className={`font-black text-xs tracking-wide whitespace-nowrap ${msg.clanColor === 'rainbow' ? 'text-rainbow' : ''}`}
              style={msg.clanColor === 'rainbow' ? undefined : { color: msg.clanColor || '#fff' }}
            >
              [{msg.clanName.toUpperCase()}]
            </span>
          )}
          <BadgeList badges={msg.badges} size={16} smallSize={10} className="relative -top-[1px]" />
        </div>
        <div className="text-foreground font-semibold" style={msg.chatColor ? { color: msg.chatColor } : undefined}>
          <MessageContent content={msg.content} mentions={msg.mentions} mentionEffects={msg.mentionEffects} meUsername={meUsername} onMentionClick={onAvatarClick} />
        </div>
      </div>
      {canDelete && <DeleteButton onClick={() => onDelete!(msg.id)} />}
    </div>
  );
}

// Memoized: the chat list re-renders on every poll, but react-query keeps
// object identity for unchanged messages, so memo skips re-rendering the
// hundreds of rows that didn't change.
export const ChatMessageRow = memo(ChatMessageRowInner);
