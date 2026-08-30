const fs = require('fs');

let trade = fs.readFileSync('artifacts/blacket-game/src/pages/trade.tsx', 'utf8');

trade = trade.replace(
  /<div className="absolute -top-2 -right-2 bg-primary text-xs font-black px-2 py-0\.5 rounded-full">\{b\.quantity\}<\/div>/g,
  `<div className="absolute -top-2 -right-2 text-white text-xs font-black px-2 py-0.5 rounded-full" style={{ backgroundColor: getRarityColor(b.rarity) }}>{b.quantity}</div>`
);

trade = trade.replace(
  /<div className="absolute -top-2 -right-2 bg-primary text-xs font-black px-1\.5 py-0\.5 rounded-full">\{b\.quantity\}<\/div>/g,
  `<div className="absolute -top-2 -right-2 text-white text-xs font-black px-1.5 py-0.5 rounded-full" style={{ backgroundColor: getRarityColor(b.rarity) }}>{b.quantity}</div>`
);

fs.writeFileSync('artifacts/blacket-game/src/pages/trade.tsx', trade);
