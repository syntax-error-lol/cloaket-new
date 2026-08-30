import { useState } from "react";
import { useModLookup } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Loader2, Shield } from "lucide-react";
import { ModTools } from "@/components/mod-tools";
import logoImg from "@/assets/logo.png";

export default function ModPage() {
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const lookupMutation = useModLookup();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    lookupMutation.mutate(
      { data: { password } },
      {
        onSuccess: () => {
          setIsAuthenticated(true);
          toast({ title: "Authenticated", description: "Welcome to the mod panel." });
        },
        onError: (err) => {
          toast({
            title: "Error",
            description: (err.data as any)?.message || "Wrong mod password",
            variant: "destructive",
          });
        },
      },
    );
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-[100dvh] bg-background text-foreground relative overflow-hidden flex items-center justify-center p-6">
        <div className="absolute inset-0 bg-checkerboard opacity-20 pointer-events-none" />
        <div className="relative z-10 w-full max-w-md bg-card border-2 border-card-border rounded-3xl p-8">
          <div className="flex flex-col items-center mb-6">
            <img src={logoImg} alt="Logo" className="w-16 h-16 object-contain mb-3" />
            <h1 className="text-3xl font-black font-display uppercase tracking-wide text-white flex items-center gap-2">
              <Shield className="w-7 h-7 text-primary" /> Mod Panel
            </h1>
          </div>
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mod password"
              className="font-bold bg-input border-card-border h-14 rounded-2xl px-6 text-lg"
              autoFocus
            />
            <Button
              type="submit"
              disabled={!password || lookupMutation.isPending}
              className="h-14 text-lg font-black font-display uppercase tracking-wide rounded-2xl"
            >
              {lookupMutation.isPending ? <Loader2 className="w-6 h-6 animate-spin" /> : "Enter"}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background text-foreground relative overflow-hidden">
      <div className="absolute inset-0 bg-checkerboard opacity-20 pointer-events-none" />
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 relative z-10">
        <div className="flex items-center gap-3 mb-6">
          <Shield className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-black font-display uppercase tracking-wide text-white">
            Mod Panel
          </h1>
        </div>
        <ModTools password={password} />
      </div>
    </div>
  );
}
