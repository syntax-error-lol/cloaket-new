const fs = require('fs');

let code = fs.readFileSync('artifacts/blacket-game/src/pages/chat.tsx', 'utf8');

code = code.replace(
  /className="h-12 px-6 rounded-xl font-black bg-green-500 hover:bg-green-400 text-green-950"/,
  'className="h-12 w-32 shrink-0 rounded-xl font-black bg-green-500 hover:bg-green-400 text-green-950"'
);

// also ensure the bottom div is shrink-0
code = code.replace(
  /<div className="pt-4 border-t-2 border-card-border mt-auto">/,
  '<div className="pt-4 border-t-2 border-card-border mt-auto shrink-0">'
);

fs.writeFileSync('artifacts/blacket-game/src/pages/chat.tsx', code);
