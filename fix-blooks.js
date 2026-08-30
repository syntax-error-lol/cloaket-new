const fs = require('fs');

let blooks = fs.readFileSync('artifacts/blacket-game/src/pages/blooks.tsx', 'utf8');

// The block to replace
const iconBlockRegex = /<div className="flex items-center gap-3 border-b-2 border-card-border pb-2 ml-2">\s*<div\s*className="w-8 h-8 rounded-lg shadow-inner flex items-center justify-center text-white"\s*style={{ background: `linear-gradient\(135deg, \$\{pack\.color1\}, \$\{pack\.color2\}\)` }}\s*>\s*<PackageOpen className="w-4 h-4" \/>\s*<\/div>\s*<h2/m;

blooks = blooks.replace(
  iconBlockRegex,
  '<div className="flex items-center gap-3 border-b-2 border-card-border pb-2 ml-2">\n                <h2'
);

fs.writeFileSync('artifacts/blacket-game/src/pages/blooks.tsx', blooks);
