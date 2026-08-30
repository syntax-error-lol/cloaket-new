import { useState } from "react";
import { useAdminLookup } from "@workspace/api-client-react";
import { AdminTools } from "@/components/admin-tools";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import logoImg from "@/assets/logo.png";

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const lookupMutation = useAdminLookup();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    lookupMutation.mutate({ data: { password } }, {
      onSuccess: () => {
        setIsAuthenticated(true);
        toast({ title: "Authenticated", description: "Welcome to the admin panel." });
      },
      onError: (err) => {
        toast({ title: "Error", description: (err.data as any)?.message || "Wrong admin password", variant: "destructive" });
      }
    });
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-checkerboard opacity-20 pointer-events-none" />
        <div className="w-full max-w-md bg-card border-2 border-primary/50 shadow-[0_0_50px_rgba(139,92,246,0.15)] rounded-3xl p-8 relative z-10">
          <div className="flex flex-col items-center gap-4 mb-8">
            <div className="w-24 h-24 flex items-center justify-center">
              <img src={logoImg} alt="Logo" className="w-full h-full object-contain drop-shadow-xl" />
            </div>
            <h1 className="text-3xl font-black font-display text-white text-center">
              Admin Gateway
            </h1>
          </div>
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="font-bold text-sm text-muted-foreground uppercase tracking-wider">Access Code</label>
              <Input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password..."
                className="h-14 bg-input border-card-border rounded-xl font-bold text-lg"
              />
            </div>
            <Button
              type="submit"
              disabled={lookupMutation.isPending || !password}
              className="h-14 font-black font-display tracking-widest text-lg uppercase rounded-xl shadow-lg mt-2"
            >
              {lookupMutation.isPending ? <Loader2 className="w-6 h-6 animate-spin" /> : "Authenticate"}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col relative overflow-hidden">
      <div className="absolute inset-0 bg-checkerboard opacity-20 pointer-events-none fixed" />

      <header className="bg-card border-b-2 border-card-border p-6 max-md:p-3 max-md:py-4 relative z-10 sticky top-0">
        <div className="max-w-7xl mx-auto flex items-center gap-4 max-md:gap-2">
          <div className="w-12 h-12 max-md:w-8 max-md:h-8 flex items-center justify-center">
            <img src={logoImg} alt="Logo" className="w-full h-full object-contain drop-shadow-md" />
          </div>
          <h1 className="text-2xl max-md:text-xl font-black font-display text-white">System Admin</h1>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6 md:p-8 max-md:p-3 relative z-10">
        <div className="max-w-7xl mx-auto">
          <AdminTools password={password} />
        </div>
      </main>
    </div>
  );
}
