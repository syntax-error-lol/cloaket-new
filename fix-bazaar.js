const fs = require('fs');

let bazaar = fs.readFileSync('artifacts/blacket-game/src/pages/bazaar.tsx', 'utf8');

// Remove search state
bazaar = bazaar.replace('  const [search, setSearch] = useState("");\n', '');
bazaar = bazaar.replace('    if (search.trim()) {\n      result = result.filter(l => l.blookName.toLowerCase().includes(search.toLowerCase()) || l.sellerName.toLowerCase().includes(search.toLowerCase()));\n    }\n    ', '');
bazaar = bazaar.replace(', search]', ']');

// Update the pack and blook ScrollAreas to be shrink-0
bazaar = bazaar.replace(
  /<ScrollArea className="w-full whitespace-nowrap bg-card border border-card-border rounded-xl p-3 shadow-md">/,
  '<ScrollArea className="w-full whitespace-nowrap bg-card border border-card-border rounded-xl p-3 shadow-md shrink-0">'
);
bazaar = bazaar.replace(
  /<ScrollArea className="w-full whitespace-nowrap bg-secondary border border-card-border rounded-xl p-3 shadow-md animate-in slide-in-from-top-2">/,
  '<ScrollArea className="w-full whitespace-nowrap bg-secondary border border-card-border rounded-xl p-3 shadow-md animate-in slide-in-from-top-2 shrink-0">'
);

// Remove the search bar UI entirely
const searchBarRegex = /<div className="flex items-center gap-3 bg-card p-2 rounded-xl border border-card-border shadow-md">[\s\S]*?<\/div>\s*<div className="mt-4">/m;
bazaar = bazaar.replace(searchBarRegex, '<div className="flex-1 overflow-y-auto custom-scrollbar pr-4 min-h-0 mt-2">\n');

// Update activeTab === "listings" to be scrollable
bazaar = bazaar.replace(
  /<div className="mt-4">/,
  '<div className="flex-1 overflow-y-auto custom-scrollbar pr-4 min-h-0">'
);

fs.writeFileSync('artifacts/blacket-game/src/pages/bazaar.tsx', bazaar);
