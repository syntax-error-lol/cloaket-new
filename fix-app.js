const fs = require('fs');

let app = fs.readFileSync('artifacts/blacket-game/src/App.tsx', 'utf8');

// Add AppShell import
app = app.replace(
  'import { Loader2 } from "lucide-react";',
  'import { Loader2 } from "lucide-react";\nimport { AppShell } from "@/components/layout/layout";'
);

// Wrap ProtectedRoute's Component in AppShell
app = app.replace(
  'return <Component />;\n}',
  'return <AppShell><Component /></AppShell>;\n}'
);

fs.writeFileSync('artifacts/blacket-game/src/App.tsx', app);
