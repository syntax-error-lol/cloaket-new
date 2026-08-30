const fs = require('fs');
let code = fs.readFileSync('artifacts/blacket-game/src/pages/chat.tsx', 'utf8');

// Restore the original chat input form which was accidentally broken during replacement
code = code.replace(
  /<form onSubmit=\{handleSend\} className="flex gap-2">[\s\S]*?<\/DialogContent>/,
  `<form onSubmit={handleSend} className="flex gap-2">
            <Input 
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 font-bold h-12 bg-input rounded-xl border-card-border"
              maxLength={500}
              autoFocus
            />
            <Button type="submit" disabled={!content.trim() || sendMutation.isPending} className="h-12 px-6 rounded-xl font-black bg-green-500 hover:bg-green-400 text-green-950">
              {sendMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Send className="w-4 h-4 mr-2" /> SEND</>}
            </Button>
          </form>
        </div>
      </div>

      <Dialog open={!!profileUsername} onOpenChange={(open) => !open && setProfileUsername(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle className="sr-only">Player Profile</DialogTitle>
          <DialogDescription className="sr-only">View player stats and badges</DialogDescription>
          
          {isProfileLoading || !profile ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
            </div>
          ) : (
            <div className="flex flex-col gap-6 py-4">
              <div className="flex flex-col items-center text-center">
                <div className="w-24 h-24 rounded-2xl bg-secondary border border-card-border shadow-xl flex items-center justify-center overflow-hidden mb-4 relative group">
                  <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                  {profile.avatarImage ? (
                    <img src={profile.avatarImage} alt="Avatar" className="w-full h-full object-contain" />
                  ) : (
                    <span className="font-display text-4xl">{profile.username[0].toUpperCase()}</span>
                  )}
                </div>
                
                <h2 className="text-3xl font-black font-display tracking-wide mb-1 flex items-center gap-2">
                  <span className={profile.nameEffect === 'rainbow' ? 'text-rainbow drop-shadow-none' : ''}>{profile.username}</span>
                  {profile.badges?.map(b => (
                    <img key={b.name} src={b.image} alt={b.name} title={\`\${b.name} — \${b.description}\`} className="w-5 h-5 object-contain" />
                  ))}
                  {profile.isOnline && <div className="w-3 h-3 bg-green-500 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.8)]" title="Online" />}
                </h2>
                
                <p className="text-sm font-bold text-muted-foreground mb-6 uppercase tracking-widest">
                  Joined {new Date(profile.joinedAt).toLocaleDateString()}
                </p>

                <div className="w-full grid grid-cols-2 gap-3 mb-6">
                  <div className="bg-secondary/50 rounded-xl p-3 flex flex-col items-center justify-center border border-card-border">
                    <Trophy className="w-5 h-5 text-blue-400 mb-1" />
                    <span className="text-lg font-black">{profile.level}</span>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">Level</span>
                  </div>
                  <div className="bg-secondary/50 rounded-xl p-3 flex flex-col items-center justify-center border border-card-border">
                    <Coins className="w-5 h-5 text-yellow-400 mb-1" />
                    <span className="text-lg font-black">{formatNumber(profile.tokens)}</span>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">Tokens</span>
                  </div>
                  <div className="bg-secondary/50 rounded-xl p-3 flex flex-col items-center justify-center border border-card-border">
                    <PackageOpen className="w-5 h-5 text-green-400 mb-1" />
                    <span className="text-lg font-black">{formatNumber(profile.packsOpened)}</span>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">Packs Opened</span>
                  </div>
                  <div className="bg-secondary/50 rounded-xl p-3 flex flex-col items-center justify-center border border-card-border">
                    <LayoutDashboard className="w-5 h-5 text-purple-400 mb-1" />
                    <span className="text-lg font-black">{formatNumber(profile.uniqueBlooks)} <span className="text-sm text-muted-foreground">/ {formatNumber(profile.totalBlooks)}</span></span>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">Blooks</span>
                  </div>
                </div>

                {me?.username !== profile.username && (
                  <Button 
                    className="w-full h-14 text-xl font-black font-display tracking-wide bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-primary/30 rounded-xl"
                    onClick={handleTradeRequest}
                    disabled={sendRequestMutation.isPending}
                  >
                    {sendRequestMutation.isPending ? <Loader2 className="w-6 h-6 animate-spin mr-2" /> : <ArrowRightLeft className="w-6 h-6 mr-2" />}
                    Trade
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>`
);

fs.writeFileSync('artifacts/blacket-game/src/pages/chat.tsx', code);
