const fs = require('fs');
let code = fs.readFileSync('artifacts/blacket-game/src/pages/trade.tsx', 'utf8');

// The error is in TradeResult function, which doesn't have access to getRarityColor or rarities.
code = code.replace(
  /function TradeResult\(\{ trade, onDismiss \}: \{ trade: Trade, onDismiss: \(\) => void \}\) \{/,
  "function TradeResult({ trade, onDismiss }: { trade: Trade, onDismiss: () => void }) {\n  const { data: rarities } = useGetRarities();\n  const getRarityColor = (name: string) => rarities?.find(r => r.name === name)?.color || '#fff';"
);

fs.writeFileSync('artifacts/blacket-game/src/pages/trade.tsx', code);
