import { Link, useLocation } from "wouter";
import {
  FaChartSimple, FaStore, FaBriefcase, FaLandmark, FaHammer, FaRightLeft,
  FaFlag, FaUserGroup, FaComment, FaTrophy, FaGear, FaBagShopping, FaRightFromBracket,
  FaHelmetSafety,
} from "react-icons/fa6";
import { cn } from "@/lib/utils";
import { useLogout, getGetCurrentTradeQueryKey, getCurrentTrade, useGetDiscordLink, getGetDiscordLinkQueryKey } from "@workspace/api-client-react";
import type { Trade } from "@workspace/api-client-react";
import { toast } from "@/hooks/use-toast";

import { useQueryClient } from "@tanstack/react-query";
import logoImg from "@/assets/logo.png";
import { DiscordIcon, DEFAULT_DISCORD_INVITE_URL } from "@/components/discord-link";

const RAINBOW_OFFSET = `-${Math.floor(Math.random() * 4000)}ms`;


export function Sidebar() {
  const [location, setLocation] = useLocation();
  const logoutMutation = useLogout();
  const queryClient = useQueryClient();
  const { data: discordLink } = useGetDiscordLink({
    query: { queryKey: getGetDiscordLinkQueryKey(), refetchInterval: 60_000 },
  });

  const links = [
    { href: "/stats", label: "Stats", icon: FaChartSimple },
    { href: "/mine", label: "Mine", icon: FaHelmetSafety },
    { href: "/market", label: "Market", icon: FaStore },
    { href: "/blooks", label: "My Blooks", mobileLabel: "Blooks", icon: FaBriefcase },
    { href: "/bazaar", label: "Bazaar", icon: FaLandmark },
    { href: "/craft", label: "Craft", icon: FaHammer },
    { href: "/trade", label: "Trade", icon: FaRightLeft },
    { href: "/clans", label: "Clans", mobileLabel: "Clans", icon: FaFlag },
    { href: "/friends", label: "Friends", icon: FaUserGroup },
    { href: "/chat", label: "Chat", icon: FaComment },
    { href: "/leaderboard", label: "Leaderboard", mobileLabel: "Top", icon: FaTrophy },
    { href: "/settings", label: "Settings", icon: FaGear },
  ];

  // While an active trade is open, lock navigation to the Trade tab so
  // nobody can wander off mid-trade. The trade page keeps this cache fresh.
  const isTradeLocked = () => {
    if (location !== "/trade") return false;
    const trade = queryClient.getQueryData<Trade>(getGetCurrentTradeQueryKey());
    return trade?.status === "active";
  };

  const guardNav = (e: React.MouseEvent, href: string) => {
    if (href !== "/trade" && isTradeLocked()) {
      e.preventDefault();
      // The cache can lag a couple seconds behind a partner's decline —
      // confirm with the server before showing the blocking toast.
      getCurrentTrade()
        .then((fresh) => {
          queryClient.setQueryData(getGetCurrentTradeQueryKey(), fresh);
          if (fresh.status === "active") {
            toast({
              title: "Trade in progress",
              description: "Finish or decline the trade before leaving this page.",
              variant: "destructive",
            });
          } else {
            setLocation(href); // trade actually ended — let them through
          }
        })
        .catch(() => setLocation(href)); // 404 = no trade
    }
  };

  const handleLogout = () => {
    if (isTradeLocked()) {
      toast({
        title: "Trade in progress",
        description: "Finish or decline the trade before logging out.",
        variant: "destructive",
      });
      return;
    }
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        setLocation("/");
      }
    });
  };

  return (
    <div className="w-[280px] h-[100dvh] max-md:w-full max-md:h-16 max-md:flex-row max-md:border-r-0 max-md:border-t-2 max-md:order-last flex flex-col bg-card border-r-2 border-card-border z-20 shrink-0">
      <div className="p-6 flex items-center justify-center gap-3 shrink-0 pb-8 max-md:hidden">
        <img src={logoImg} alt="Logo" className="w-16 h-16 object-contain drop-shadow-md scale-110" />
        <h1 className="text-3xl font-black font-display tracking-widest text-rainbow uppercase" style={{ animationDelay: RAINBOW_OFFSET }}>
          CLOAKET
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-1 flex flex-col gap-0.5 max-md:flex-row max-md:overflow-x-auto max-md:overflow-y-hidden max-md:px-1 max-md:py-0 max-md:items-center max-md:gap-0 custom-scrollbar">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = location === link.href || (location === "/" && link.href === "/stats");
          return (
            <Link key={link.href} href={link.href} onClick={(e) => guardNav(e, link.href)} className={cn(
              "flex items-center gap-3 px-4 py-[5px] rounded-full font-bold transition-all duration-200 text-[17px] max-md:flex-col max-md:gap-1 max-md:px-1.5 max-md:py-1 max-md:rounded-xl max-md:min-w-[3.75rem] max-md:justify-center",
              isActive 
                ? "bg-white/10 text-white" 
                : "text-muted-foreground hover:bg-white/5 hover:text-white"
            )}>
              <div className={cn("flex items-center justify-center w-6 h-6 rounded-full bg-black/40 shadow-inner text-white/80")}>
                <Icon className="w-3.5 h-3.5 max-md:w-3 max-md:h-3" />
              </div>
              <span className="font-display tracking-wide max-md:text-[10px] max-md:leading-none">
                <span className="max-md:hidden">{link.label}</span>
                <span className="md:hidden">{(link as { mobileLabel?: string }).mobileLabel ?? link.label}</span>
              </span>
            </Link>
          );
        })}
      </div>

      <div className="p-4 shrink-0 max-md:p-2 max-md:flex max-md:items-center max-md:gap-1">
        {/* Tiny Discord badge — fixed above Store, doesn't scroll with the tabs */}
        <a
          href={discordLink?.url ?? DEFAULT_DISCORD_INVITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center px-4 mb-1 max-md:px-1.5 max-md:mb-0 w-full max-md:w-auto max-md:justify-center"
          aria-label="Join our Discord"
          title="Join our Discord"
        >
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-black/40 shadow-inner text-[#5865F2] hover:text-[#7983f5] transition-colors">
            <DiscordIcon className="w-3.5 h-3.5 max-md:w-3 max-md:h-3" />
          </span>
        </a>
        {/* Store: blue text tab right above Log out */}
        <Link href="/store" onClick={(e) => guardNav(e, "/store")} className={cn(
          "flex items-center gap-3 px-4 py-[5px] mb-1 rounded-full font-bold transition-all duration-200 text-[17px] max-md:flex-col max-md:gap-1 max-md:px-1.5 max-md:py-1 max-md:rounded-xl max-md:min-w-[3.75rem] max-md:justify-center max-md:mb-0 w-full max-md:w-auto",
          location === "/store"
            ? "bg-white/10 text-blue-300"
            : "text-blue-400 hover:bg-white/5 hover:text-blue-300"
        )}>
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-black/40 shadow-inner text-blue-400">
            <FaBagShopping className="w-3.5 h-3.5 max-md:w-3 max-md:h-3" />
          </div>
          <span className="font-display tracking-wide max-md:text-[10px] max-md:leading-none">Store</span>
        </Link>
        <button 
          onClick={handleLogout}
          disabled={logoutMutation.isPending}
          className="flex items-center gap-3 px-4 py-[5px] max-md:flex-col max-md:gap-1 max-md:px-1.5 max-md:py-1 max-md:rounded-xl max-md:w-auto max-md:min-w-[3.75rem] max-md:justify-center w-full rounded-full font-bold text-muted-foreground hover:bg-destructive/20 hover:text-destructive transition-colors text-[17px]"
        >
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-black/40 shadow-inner text-destructive">
            <FaRightFromBracket className="w-3.5 h-3.5 max-md:w-3 max-md:h-3" />
          </div>
          <span className="font-display tracking-wide max-md:text-[10px] max-md:leading-none">Log out</span>
        </button>
      </div>
    </div>
  );
}