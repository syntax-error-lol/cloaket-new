const fs = require('fs');

let code = fs.readFileSync('artifacts/blacket-game/src/pages/bazaar.tsx', 'utf8');

code = code.replace(
  /<Layout title="Bazaar">/,
  '<Layout title="Bazaar" fixedHeight>'
);

// In Bazaar, we have:
// <div className="flex flex-col gap-6 max-w-6xl mx-auto h-full">
//   <header ... shrink-0?>
//   <div className="flex gap-2"> ... shrink-0?>
//   {activeTab === "blooks" && ( <div className="flex flex-col gap-4 flex-1 min-h-0">...
// We need to make sure the headers are shrink-0 and the listing area is flex-1 min-h-0 with a ScrollArea.

code = code.replace(
  /<header className="flex flex-col md:flex-row md:items-end justify-between gap-4">/,
  '<header className="flex flex-col md:flex-row md:items-end justify-between gap-4 shrink-0">'
);

code = code.replace(
  /<div className="flex gap-2">/,
  '<div className="flex gap-2 shrink-0">'
);

code = code.replace(
  /\{activeTab === "blooks" && \(\n          <div className="flex flex-col gap-4">/,
  '{activeTab === "blooks" && (\n          <div className="flex flex-col gap-4 flex-1 min-h-0">'
);

code = code.replace(
  /\{activeTab === "listings" && \(\n          <div className="flex flex-col gap-4">/,
  '{activeTab === "listings" && (\n          <div className="flex flex-col gap-4 flex-1 min-h-0">'
);

// For blooks tab:
// <ScrollArea className="w-full whitespace-nowrap bg-card border border-card-border rounded-xl p-3 shadow-md">
// Then search input
// Then the grid of listings. We need the grid of listings to be scrollable.
code = code.replace(
  /<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">/g,
  '<ScrollArea className="flex-1"><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-4">'
);

code = code.replace(
  /<\/div>\n            \) : \(\n              <div className="text-center py-20 text-muted-foreground font-bold">/g,
  '</div></ScrollArea>\n            ) : (\n              <div className="text-center py-20 text-muted-foreground font-bold flex-1">'
);

fs.writeFileSync('artifacts/blacket-game/src/pages/bazaar.tsx', code);