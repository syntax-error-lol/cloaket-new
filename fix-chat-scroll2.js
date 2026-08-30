const fs = require('fs');

let code = fs.readFileSync('artifacts/blacket-game/src/pages/chat.tsx', 'utf8');

// Replace ScrollArea with standard div overflow-y-auto to guarantee flex behavior without reflows
code = code.replace(
  /<ScrollArea className="flex-1 pr-4" ref=\{scrollRef\}>/g,
  '<div className="flex-1 overflow-y-auto pr-4 custom-scrollbar min-h-0" ref={scrollRef}>'
);

code = code.replace(
  /<\/ScrollArea>/g,
  '</div>'
);

// Update scroll logic since we removed ScrollArea
// The old querySelector('[data-radix-scroll-area-viewport]') will fail
const oldScrollLogic = `const scrollElement = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');`;
const newScrollLogic = `const scrollElement = scrollRef.current;`;

code = code.replace(oldScrollLogic, newScrollLogic);

// Ensure the container is explicitly min-h-0
code = code.replace(
  /<div className="flex flex-col h-full overflow-hidden">/,
  '<div className="flex flex-col h-full overflow-hidden min-h-0">'
);

fs.writeFileSync('artifacts/blacket-game/src/pages/chat.tsx', code);
