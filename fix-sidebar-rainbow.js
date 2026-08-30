const fs = require('fs');

let sidebar = fs.readFileSync('artifacts/blacket-game/src/components/layout/sidebar.tsx', 'utf8');

// Use a stable epoch for the animation delay so it doesn't jump on re-renders.
// Since it's a module, we can define it outside the component.
const sidebarInject = `
import { useQueryClient } from "@tanstack/react-query";
import logoImg from "@/assets/logo.png";

const RAINBOW_OFFSET = \`-\${Math.floor(Math.random() * 4000)}ms\`;
`;

sidebar = sidebar.replace(
  /import { useQueryClient } from "@tanstack\/react-query";\nimport logoImg from "@\/assets\/logo\.png";/,
  sidebarInject
);

sidebar = sidebar.replace(
  /style={{ animationDelay: \`-\$\{Date\.now\(\) % 4000\}ms\` }}/,
  'style={{ animationDelay: RAINBOW_OFFSET }}'
);

fs.writeFileSync('artifacts/blacket-game/src/components/layout/sidebar.tsx', sidebar);

let layout = fs.readFileSync('artifacts/blacket-game/src/components/layout/layout.tsx', 'utf8');

const layoutInject = `
import { Check, X, Coins } from "lucide-react";

const RAINBOW_OFFSET = \`-\${Math.floor(Math.random() * 4000)}ms\`;
`;

layout = layout.replace(
  /import { Check, X, Coins } from "lucide-react";/,
  layoutInject
);

layout = layout.replace(
  /style={me.nameEffect === 'rainbow' \? { animationDelay: \`-\$\{Date\.now\(\) % 4000\}ms\` } : undefined}/,
  'style={me.nameEffect === "rainbow" ? { animationDelay: RAINBOW_OFFSET } : undefined}'
);

fs.writeFileSync('artifacts/blacket-game/src/components/layout/layout.tsx', layout);
