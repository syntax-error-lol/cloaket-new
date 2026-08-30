import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useLogin, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import logoImg from "@/assets/logo.png";

export default function SignInPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const loginMutation = useLogin();
  
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!username.trim() || !password) return;

    loginMutation.mutate(
      { data: { username: username.trim(), password } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          setLocation("/stats");
        },
        onError: (err) => {
          setErrorMsg((err.data as any)?.message || "Failed to log in");
        }
      }
    );
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-checkerboard px-4">
      <div className="relative z-10 w-full max-w-[440px] bg-card rounded-[32px] border-2 border-card-border shadow-2xl p-8 md:p-10">
        <div className="flex flex-col items-center justify-center mb-8 gap-4">
          <img src={logoImg} alt="Cloaket Logo" className="h-24 w-24 object-contain drop-shadow-xl" />
          <h1 className="text-4xl font-black font-display text-rainbow uppercase tracking-widest text-center">CLOAKET</h1>
        </div>
        
        <p className="text-muted-foreground font-bold text-center mb-8 text-lg">Sign in to your account</p>

        {errorMsg && (
          <div className="bg-destructive/10 border border-destructive text-destructive font-bold p-4 rounded-2xl mb-6 text-sm text-center">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2.5">
            <label className="text-foreground font-bold text-sm uppercase tracking-wider ml-2">Username</label>
            <Input 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              className="font-bold bg-input border-card-border h-14 rounded-2xl px-6 text-lg focus-visible:ring-primary/50"
            />
          </div>
          <div className="flex flex-col gap-2.5">
            <label className="text-foreground font-bold text-sm uppercase tracking-wider ml-2">Password</label>
            <Input 
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="font-bold bg-input border-card-border h-14 rounded-2xl px-6 text-lg focus-visible:ring-primary/50"
            />
          </div>
          
          <Button 
            type="submit" 
            disabled={loginMutation.isPending || !username || !password}
            className="w-full h-16 mt-6 text-xl font-black font-display tracking-wide uppercase rounded-2xl shadow-xl hover:shadow-primary/30 bg-gradient-to-r from-primary to-accent border-0"
          >
            {loginMutation.isPending ? <Loader2 className="w-8 h-8 animate-spin" /> : "Sign In"}
          </Button>
        </form>

        <div className="mt-8 text-center border-t-2 border-card-border pt-8">
          <span className="text-muted-foreground font-bold text-lg">Don't have an account? </span>
          <Link href="/sign-up" className="text-white hover:text-primary font-black ml-1 text-lg transition-colors">
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}