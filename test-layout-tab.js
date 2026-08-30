const fs = require('fs');

let code = fs.readFileSync('artifacts/blacket-game/src/components/layout/layout.tsx', 'utf8');

code = code.replace(
  /<div className="self-start bg-card border-t-2 border-x-2 border-card-border px-8 py-2\.5 rounded-t-2xl relative z-20 ml-6 translate-y-\[2px\]">/,
  '<div className="self-start bg-card border-t-2 border-x-2 border-card-border px-6 py-2 rounded-t-2xl relative z-20 ml-6 translate-y-[2px] border-b-0">'
);
code = code.replace(
  /<div className="w-full flex-1 flex flex-col bg-card border-2 border-card-border rounded-3xl shadow-2xl z-10 p-6 md:p-8">/,
  '<div className="w-full flex-1 flex flex-col bg-card border-2 border-card-border rounded-3xl shadow-2xl z-10 p-4 md:p-8">'
);

fs.writeFileSync('artifacts/blacket-game/src/components/layout/layout.tsx', code);
