import type { FormEvent } from "react";
import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import logoImg from "@/assets/logo.png";

type StaffGatewayProps = {
  title: string;
  description: string;
  password: string;
  placeholder: string;
  icon: LucideIcon;
  isPending: boolean;
  onPasswordChange: (password: string) => void;
  onSubmit: (event: FormEvent) => void;
};

/** Shared password-entry surface for staff-only routes. */
export function StaffGateway({
  title,
  description,
  password,
  placeholder,
  icon: Icon,
  isPending,
  onPasswordChange,
  onSubmit,
}: StaffGatewayProps) {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-checkerboard opacity-20 pointer-events-none" />
      <div className="w-full max-w-md bg-card border-2 border-primary/50 shadow-[0_0_50px_rgba(139,92,246,0.15)] rounded-3xl p-8 relative z-10">
        <div className="flex flex-col items-center gap-4 mb-8">
          <div className="w-24 h-24 flex items-center justify-center">
            <img src={logoImg} alt="Cloaket" className="w-full h-full object-contain drop-shadow-xl" />
          </div>
          <h1 className="text-3xl font-black font-display text-white text-center flex items-center gap-2">
            <Icon className="w-7 h-7 text-primary" /> {title}
          </h1>
          <p className="font-bold text-sm text-muted-foreground text-center">{description}</p>
        </div>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <input type="text" name="username" autoComplete="username" className="sr-only" tabIndex={-1} aria-hidden="true" />
          <div className="flex flex-col gap-2">
            <label className="font-bold text-sm text-muted-foreground uppercase tracking-wider">Access Code</label>
            <Input
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              placeholder={placeholder}
              className="h-14 bg-input border-card-border rounded-xl font-bold text-lg"
            />
          </div>
          <Button
            type="submit"
            disabled={isPending || !password}
            className="h-14 font-black font-display tracking-widest text-lg uppercase rounded-xl shadow-lg mt-2"
          >
            {isPending ? <Loader2 className="w-6 h-6 animate-spin" /> : "Authenticate"}
          </Button>
        </form>
      </div>
    </div>
  );
}