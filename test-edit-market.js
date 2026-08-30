const fs = require('fs');
let code = fs.readFileSync('artifacts/blacket-game/src/pages/market.tsx', 'utf8');

// Replace (blook.chance * 100).toFixed(2) with Number(blook.chance).toString()
code = code.replace(/\{\(blook\.chance \* 100\)\.toFixed\(2\)\}%/g, '{Number(blook.chance).toString()}%');

fs.writeFileSync('artifacts/blacket-game/src/pages/market.tsx', code);
