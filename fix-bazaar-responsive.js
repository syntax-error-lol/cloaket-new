const fs = require('fs');

let code = fs.readFileSync('artifacts/blacket-game/src/pages/bazaar.tsx', 'utf8');

// Replace the Top Row Wrapper
code = code.replace(
  /<div className="flex flex-wrap md:flex-nowrap items-stretch gap-4 shrink-0">/g,
  '<div className="flex flex-wrap xl:flex-nowrap items-stretch gap-4 shrink-0">'
);

// Replace Left Column
code = code.replace(
  /<div className="flex flex-col gap-2 w-full sm:w-48 shrink-0">/,
  '<div className="flex flex-col gap-2 w-full sm:w-[calc(50%-0.5rem)] xl:w-48 shrink-0 order-1">'
);

// We need to reorder Right Column to be before Center Column in the DOM, or just use order CSS.
// Let's just use CSS order.

// Center Column
code = code.replace(
  /<div className="flex-1 bg-card border border-card-border rounded-xl shadow-md p-3 flex flex-col justify-center min-w-0">/,
  '<div className="flex-1 bg-card border border-card-border rounded-xl shadow-md p-3 flex flex-col justify-center min-w-[100%] xl:min-w-0 order-3 xl:order-2">'
);

// Right Column
code = code.replace(
  /<div className="w-full sm:w-48 shrink-0 bg-card border border-card-border rounded-xl shadow-md p-3 flex flex-col justify-center gap-2 h-\[104px\] shrink-0">/,
  '<div className="w-full sm:w-[calc(50%-0.5rem)] xl:w-48 shrink-0 bg-card border border-card-border rounded-xl shadow-md p-3 flex flex-col justify-center gap-2 h-[104px] order-2 xl:order-3">'
);

fs.writeFileSync('artifacts/blacket-game/src/pages/bazaar.tsx', code);
