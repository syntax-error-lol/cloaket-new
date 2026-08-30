import { useEffect, useState } from "react";
import { Link as LinkIcon, Loader2 } from "lucide-react";
import { useAdminSetDiscordLink, useGetDiscordLink } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";

export function DiscordLinkPanel({ password }: { password: string }) {
  const { data: currentLink } = useGetDiscordLink();
  const updateMutation = useAdminSetDiscordLink();
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (currentLink?.url) setUrl(currentLink.url);
  }, [currentLink?.url]);

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!url.trim()) return;
    updateMutation.mutate(
      { data: { password, url: url.trim() } },
      {
        onSuccess: (result) => {
          setUrl(result.url);
          toast({ title: "Discord link updated", description: "The sidebar link now points to the new invite." });
        },
        onError: (error) => {
          toast({
            title: "Could not update Discord link",
            description: (error.data as { message?: string })?.message ?? "Use a valid Discord invite link.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <div className="bg-secondary/30 border-2 border-card-border rounded-2xl p-6 flex flex-col gap-4 xl:col-span-3">
      <div className="flex items-center gap-3 border-b-2 border-card-border pb-4">
        <div className="w-10 h-10 rounded-xl bg-[#5865F2]/20 text-[#7983f5] flex items-center justify-center">
          <LinkIcon className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-2xl font-black font-display text-white">Discord Link</h2>
          <p className="text-sm font-semibold text-muted-foreground">Set the invite opened by the Discord button in the game sidebar.</p>
        </div>
      </div>
      <form className="flex gap-3 max-md:flex-col" onSubmit={save}>
        <Input
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://discord.gg/your-invite"
          className="h-12 bg-input border-card-border font-bold"
          aria-label="Discord invite link"
        />
        <Button
          type="submit"
          disabled={!url.trim() || updateMutation.isPending}
          className="h-12 shrink-0 font-black font-display uppercase tracking-wide"
        >
          {updateMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Save Link"}
        </Button>
      </form>
      <p className="text-xs font-semibold text-muted-foreground">Accepts secure discord.gg and discord.com/invite links only.</p>
    </div>
  );
}