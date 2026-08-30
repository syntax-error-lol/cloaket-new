const fs = require('fs');
let code = fs.readFileSync('artifacts/blacket-game/src/components/layout/layout.tsx', 'utf8');

code = code.replace(
  /export function Layout\(\{ children, title, pageHeader \}: \{ children: ReactNode, title\?: string, pageHeader\?: ReactNode \}\) \{/,
  'export function Layout({ children, title, pageHeader, fixedHeight }: { children: ReactNode, title?: string, pageHeader?: ReactNode, fixedHeight?: boolean }) {'
);

code = code.replace(
  /<main className="flex-1 h-full overflow-y-auto overflow-x-hidden relative flex flex-col custom-scrollbar pb-10">/,
  '<main className={`flex-1 h-full overflow-x-hidden relative flex flex-col custom-scrollbar pb-10 ${fixedHeight ? \'overflow-hidden\' : \'overflow-y-auto\'}`}>'
);

code = code.replace(
  /<div className="p-6 md:p-8 pt-24 relative z-10 w-full max-w-7xl mx-auto flex flex-col min-h-full">/,
  '<div className={`p-6 md:p-8 pt-24 relative z-10 w-full max-w-7xl mx-auto flex flex-col ${fixedHeight ? \'h-full\' : \'min-h-full\'}`}>'
);

code = code.replace(
  /<div className="w-full flex-1 flex flex-col bg-card border-2 border-card-border rounded-3xl shadow-2xl z-10 p-6 md:p-8">/,
  '<div className={`w-full flex-1 flex flex-col bg-card border-2 border-card-border rounded-3xl shadow-2xl z-10 p-6 md:p-8 ${fixedHeight ? \'overflow-hidden\' : \'\'}`}>'
);

fs.writeFileSync('artifacts/blacket-game/src/components/layout/layout.tsx', code);
