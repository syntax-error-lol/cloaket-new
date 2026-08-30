const fs = require('fs');

let code = fs.readFileSync('artifacts/blacket-game/src/pages/leaderboard.tsx', 'utf8');
// remove "Unique Blooks" line
code = code.replace(/<span className="text-sm font-bold text-muted-foreground ml-2">\{formatNumber\(entry\.uniqueBlooks\)\} Unique Blooks<\/span>\s*/g, '');
fs.writeFileSync('artifacts/blacket-game/src/pages/leaderboard.tsx', code);
