const fs = require('fs');
let code = fs.readFileSync('artifacts/blacket-game/src/pages/trade.tsx', 'utf8');

// Move getRarityColor before return statement and other functions
code = code.replace(/  const getRarityColor = \(name: string\) => rarities\?\.find\(r => r\.name === name\)\?\.color \|\| '#fff';\n/g, '');

const insertPos = code.indexOf('const handleTokensBlur');
code = code.substring(0, insertPos) + "  const getRarityColor = (name: string) => rarities?.find(r => r.name === name)?.color || '#fff';\n\n" + code.substring(insertPos);

fs.writeFileSync('artifacts/blacket-game/src/pages/trade.tsx', code);
