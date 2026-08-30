import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useRegister, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import logoImg from "@/assets/logo.png";

export default function SignUpPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const registerMutation = useRegister();
  
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!username.trim() || !password) return;

    registerMutation.mutate(
      { data: { username: username.trim(), password } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          setLocation("/stats");
        },
        onError: (err) => {
          setErrorMsg((err.data as any)?.message || "Failed to sign up");
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
        
        <p className="text-muted-foreground font-bold text-center mb-8 text-lg">Join the private server</p>

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
              placeholder="3-20 characters"
              className="font-bold bg-input border-card-border h-14 rounded-2xl px-6 text-lg focus-visible:ring-primary/50"
              minLength={3}
              maxLength={20}
            />
          </div>
          <div className="flex flex-col gap-2.5">
            <label className="text-foreground font-bold text-sm uppercase tracking-wider ml-2">Password</label>
            <Input 
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="font-bold bg-input border-card-border h-14 rounded-2xl px-6 text-lg focus-visible:ring-primary/50"
              minLength={8}
            />
          </div>
          
          <Button 
            type="submit" 
            disabled={registerMutation.isPending || !username || password.length < 8}
            className="w-full h-16 mt-6 text-xl font-black font-display tracking-wide uppercase rounded-2xl shadow-xl hover:shadow-primary/30 bg-gradient-to-r from-primary to-accent border-0"
          >
            {registerMutation.isPending ? <Loader2 className="w-8 h-8 animate-spin" /> : "Sign Up"}
          </Button>

          <p className="text-center text-sm text-muted-foreground font-bold mt-2">
            By signing up you agree to the{" "}
            <Link href="/terms" className="text-white hover:text-primary underline transition-colors">
              Terms of Service
            </Link>
          </p>
        </form>

        <div className="mt-8 text-center border-t-2 border-card-border pt-8">
          <span className="text-muted-foreground font-bold text-lg">Already have an account? </span>
          <Link href="/sign-in" className="text-white hover:text-primary font-black ml-1 text-lg transition-colors">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}