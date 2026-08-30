const fs = require('fs');
let code = fs.readFileSync('artifacts/blacket-game/src/pages/trade.tsx', 'utf8');

// move getRarityColor definition up or just make sure it's accessible where used
