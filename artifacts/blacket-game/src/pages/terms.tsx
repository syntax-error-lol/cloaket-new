import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import logoImg from "@/assets/logo.png";

const sections: { title: string; body: string[] }[] = [
  {
    title: "1. About Cloaket",
    body: [
      "Cloaket is a free fan-made collecting game where you open packs, collect blooks, trade with other players, and chat. It is a hobby project run for fun. It is not affiliated with, endorsed by, or connected to Blooket or Blacket.",
    ],
  },
  {
    title: "2. Your Account",
    body: [
      "You are responsible for keeping your password safe and for anything that happens on your account. Pick a username that isn't offensive or impersonating someone else.",
      "Accounts are free. You may have one alt account alongside your main account, but you may not trade tokens between your main and your alt. Your two accounts should never be seen trading with each other — if they are, this may result in a ban of both accounts.",
    ],
  },
  {
    title: "3. Rules of Conduct",
    body: [
      "Be respectful in chat and trades. The following are not allowed: harassment or bullying, hate speech, spam or flooding chat, sharing personal information (yours or anyone else's), exploiting bugs, or using bots/scripts to automate the game.",
      "Breaking these rules can result in a warning, loss of items or tokens, or your account being removed — at the moderators' discretion.",
    ],
  },
  {
    title: "4. Virtual Items",
    body: [
      "Tokens, blooks, badges, and everything else in the game are virtual items with no real-world value. They cannot be bought, sold, or exchanged for real money. We may adjust, reset, or remove virtual items at any time to keep the game fair or fix bugs.",
    ],
  },
  {
    title: "5. Your Content",
    body: [
      "You own what you write in chat, but by posting it you allow us to display and store it as part of the game. We may remove any content that breaks the rules.",
    ],
  },
  {
    title: "6. Privacy",
    body: [
      "We store only what the game needs: your username, a securely hashed password, your game progress, and your chat and trade activity. We don't sell your data or share it with anyone. If you want your account and data deleted, ask a moderator.",
    ],
  },
  {
    title: "7. No Warranty",
    body: [
      "Cloaket is provided \"as is\". It's a fan project — we do our best to keep it online and bug-free, but we can't promise it will always work, and progress may occasionally be lost due to bugs, resets, or maintenance.",
    ],
  },
  {
    title: "8. Changes",
    body: [
      "We may update these terms from time to time. If we make significant changes, we'll mention it in the game. Continuing to play after changes means you accept the new terms.",
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground relative overflow-hidden">
      <div className="absolute inset-0 bg-checkerboard opacity-20 pointer-events-none" />
      <div className="max-w-3xl mx-auto px-6 py-12 relative z-10">
        <div className="flex items-center gap-4 mb-8">
          <img src={logoImg} alt="Logo" className="w-14 h-14 object-contain drop-shadow-xl" />
          <div>
            <h1 className="text-3xl md:text-4xl font-black font-display text-white">Terms of Service</h1>
            <p className="text-muted-foreground font-bold">Last updated: July 30, 2026</p>
          </div>
        </div>

        <div className="bg-card border-2 border-card-border rounded-3xl p-6 md:p-8 flex flex-col gap-6">
          {sections.map((s) => (
            <section key={s.title} className="flex flex-col gap-2">
              <h2 className="text-xl font-black font-display text-white">{s.title}</h2>
              {s.body.map((p, i) => (
                <p key={i} className="text-muted-foreground leading-relaxed">{p}</p>
              ))}
            </section>
          ))}
        </div>

        <div className="mt-8 flex justify-center">
          <Link href="/">
            <Button className="h-12 px-6 font-black font-display uppercase tracking-wide rounded-xl">
              <ArrowLeft className="w-5 h-5 mr-2" /> Back to Cloaket
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
