import { useState } from "react";
import { BadgeList } from "@/components/badge-list";
import { Layout } from "@/components/layout/layout";
import { TokenIcon } from "@/components/token-icon";
import { useGetLeaderboard } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { formatNumber, nameEffectClass, nameEffectStyle } from "@/lib/utils";
import { Trophy, Loader2 } from "lucide-react";
import { GiMining } from "react-icons/gi";

type SortMode = "experience" | "mineRate";

export default function Leaderboard() {
  const [sortMode, setSortMode] = useState<SortMode>("experience");
  const { data: leaderboard, isLoading } = useGetLeaderboard({ sort: sortMode });

  const switcher = (
    <div className="flex gap-2 bg-secondary/50 border border-card-border rounded-xl p-1.5 w-fit">
      <button
        onClick={() => setSortMode("experience")}
        className={`flex items-center gap-2 px-4 py-2 max-md:px-3 max-md:py-1.5 rounded-lg font-black text-sm max-md:text-xs uppercase tracking-wide transition-all ${
          sortMode === "experience"
            ? "bg-primary text-primary-foreground shadow-lg"
            : "text-muted-foreground hover:text-white"
        }`}
        data-testid="tab-leaderboard-xp"
      >
        <Trophy className="w-4 h-4" /> XP
      </button>
      <button
        onClick={() => setSortMode("mineRate")}
        className={`flex items-center gap-2 px-4 py-2 max-md:px-3 max-md:py-1.5 rounded-lg font-black text-sm max-md:text-xs uppercase tracking-wide transition-all ${
          sortMode === "mineRate"
            ? "bg-amber-500 text-amber-950 shadow-lg"
            : "text-muted-foreground hover:text-white"
        }`}
        data-testid="tab-leaderboard-mine"
      >
        <GiMining className="w-4 h-4" /> Mine Rate
      </button>
    </div>
  );

  return (
    <Layout title="Leaderboard">
      <div className="flex flex-col gap-6 max-w-4xl mx-auto">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-white mb-2">Leaderboard</h1>
            <p className="text-lg text-muted-foreground font-medium">
              {sortMode === "mineRate" ? "Top miners by tokens per hour." : "Top players by experience."}
            </p>
          </div>
          {switcher}
        </header>

        {isLoading || !leaderboard ? (
          <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>
        ) : (
          <div className="flex flex-col gap-2">
            {leaderboard.map((entry) => {
              const isTop3 = entry.rank <= 3;
              let rankColor = "text-muted-foreground";
              let rankBg = "bg-secondary";
              if (entry.rank === 1) { rankColor = "text-yellow-400"; rankBg = "bg-yellow-400/10 border-yellow-400/30"; }
              else if (entry.rank === 2) { rankColor = "text-slate-300"; rankBg = "bg-slate-300/10 border-slate-300/30"; }
              else if (entry.rank === 3) { rankColor = "text-amber-600"; rankBg = "bg-amber-600/10 border-amber-600/30"; }

              return (
                <Card 
                  key={entry.username} 
                  className={`p-4 max-md:p-2 max-md:gap-2 flex items-center gap-4 transition-all hover:scale-[1.01] ${entry.isMe ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''} ${isTop3 ? `border-2 ${rankBg}` : 'border-card-border'}`}
                >
                  <div className={`w-12 h-12 max-md:w-8 max-md:h-8 flex items-center justify-center text-2xl max-md:text-lg font-black shrink-0 ${rankColor}`}>
                    #{entry.rank}
                  </div>
                  
                  <div className="w-12 h-12 max-md:w-8 max-md:h-8 rounded-lg bg-secondary border border-card-border overflow-hidden shrink-0 flex items-center justify-center font-bold text-xl max-md:text-sm">
                    {entry.avatarImage ? (
                      <img src={entry.avatarImage} alt="Avatar" className="w-full h-full object-contain" />
                    ) : (
                      entry.username.charAt(0).toUpperCase()
                    )}
                  </div>

                  <div className="flex-1 flex flex-col min-w-0">
                    <span className="font-bold text-lg max-md:text-sm text-white truncate flex items-center gap-2 max-md:gap-1">
                      <span className={nameEffectClass(entry.nameEffect)} style={nameEffectStyle(entry.nameEffect)}>{entry.username}</span>
                      <BadgeList badges={entry.badges} size={16} smallSize={10} />
                      {entry.isMe && <span className="text-[10px] uppercase bg-primary text-primary-foreground px-2 py-0.5 rounded-full font-black">You</span>}
                    </span>
                    <div className="flex items-center gap-4 text-sm max-md:text-xs font-medium text-muted-foreground">
                      <span>Lvl {entry.level}</span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1 max-md:gap-0 shrink-0">
                    {sortMode === "mineRate" ? (
                      <>
                        <div className="flex items-center gap-1.5 max-md:gap-1 font-black text-lg max-md:text-sm text-amber-400">
                          <GiMining className="w-4 h-4 max-md:w-3 max-md:h-3" />
                          {formatNumber(entry.minePerHour)}<span className="text-sm max-md:text-xs text-muted-foreground font-bold">/hr</span>
                        </div>
                        <div className="flex items-center gap-1 text-sm max-md:text-xs font-bold text-yellow-400">
                          <TokenIcon className="w-3.5 h-3.5 max-md:w-2.5 max-md:h-2.5" />
                          {formatNumber(entry.tokens)}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-1.5 max-md:gap-1 font-black text-lg max-md:text-sm">
                          {formatNumber(entry.experience)} <span className="text-sm max-md:text-xs text-muted-foreground font-bold uppercase">XP</span>
                        </div>
                        <div className="flex items-center gap-1 text-sm max-md:text-xs font-bold text-yellow-400">
                          <TokenIcon className="w-3.5 h-3.5 max-md:w-2.5 max-md:h-2.5" />
                          {formatNumber(entry.tokens)}
                        </div>
                      </>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
