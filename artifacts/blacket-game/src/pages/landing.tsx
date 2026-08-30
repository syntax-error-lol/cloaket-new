import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import logoImg from "@/assets/logo.png";

export default function Landing() {
  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden bg-background text-foreground relative">
      <div className="absolute inset-0 bg-checkerboard opacity-20 pointer-events-none animate-bg-drift" />
      
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-6 text-center">
        
        <div className="w-40 h-40 md:w-56 md:h-56 mb-6 animate-float">
          <img src={logoImg} alt="Cloaket Logo" className="w-full h-full object-contain drop-shadow-2xl" />
        </div>

        <h1 className="flex flex-col items-center justify-center font-black font-display tracking-widest uppercase mb-4 drop-shadow-[0_0_20px_rgba(107,59,227,0.5)] group cursor-default">
          <span className="text-3xl md:text-5xl text-white mb-2">Welcome to</span>
          <span className="text-5xl md:text-7xl text-rainbow leading-tight px-2 relative overflow-hidden group-hover:scale-105 transition-transform duration-300">Cloaket<div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full opacity-0 group-hover:opacity-100 group-hover:animate-[shine_1.5s_ease-in-out_infinite]" /></span>
        </h1>
        
        <p className="text-lg md:text-xl text-muted-foreground font-bold max-w-xl mb-10">
          Collect rare blooks, open packs, trade with friends, and dominate the leaderboard.
        </p>
        
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full max-w-md justify-center">
          <Button size="lg" className="w-full h-14 text-lg rounded-2xl shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:shadow-[0_0_30px_rgba(139,92,246,0.5)] transition-all hover:-translate-y-1 active:scale-95 font-display tracking-wide uppercase bg-primary text-white border-0" asChild>
            <Link href="/sign-up">Play Now</Link>
          </Button>
          <Button size="lg" variant="secondary" className="w-full h-14 text-lg rounded-2xl border-2 border-card-border font-display tracking-wide uppercase bg-card text-white transition-all hover:bg-secondary hover:-translate-y-1 active:scale-95" asChild>
            <Link href="/sign-in">Sign In</Link>
          </Button>
        </div>

      </div>

      <footer className="relative z-10 pb-6 text-center">
        <Link href="/terms" className="text-sm font-bold text-muted-foreground hover:text-white transition-colors underline">
          Terms of Service
        </Link>
      </footer>
    </div>
  );
}
