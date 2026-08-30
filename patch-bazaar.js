const fs = require('fs');

let code = fs.readFileSync('artifacts/blacket-game/src/pages/bazaar.tsx', 'utf8');

// Use md:flex-nowrap instead of lg:flex-nowrap for the top row
code = code.replace(
  'className="flex flex-wrap lg:flex-nowrap items-stretch gap-4 shrink-0"',
  'className="flex flex-wrap md:flex-nowrap items-stretch gap-4 shrink-0"'
);

// Ensure the center column can shrink
code = code.replace(
  'min-w-0 md:min-w-[300px]',
  'min-w-0'
);

// Force the right column to a specific height if needed, but min-h-[96px] is good. 
// Let's just make it h-[104px] to ensure no jump, and center it.
code = code.replace(
  'gap-2 h-auto min-h-[96px]',
  'gap-2 h-[104px] shrink-0'
);

// Also set left column tokens box to a fixed height to match
code = code.replace(
  'mt-1 flex-1 justify-center',
  'mt-1 flex-1 justify-center min-h-[52px]'
);

fs.writeFileSync('artifacts/blacket-game/src/pages/bazaar.tsx', code);
