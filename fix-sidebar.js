const fs = require('fs');

let sidebar = fs.readFileSync('artifacts/blacket-game/src/components/layout/sidebar.tsx', 'utf8');
sidebar = sidebar.replace(
  '<h1 className="text-3xl font-black font-display tracking-widest text-rainbow uppercase">',
  '<h1 className="text-3xl font-black font-display tracking-widest text-rainbow uppercase" style={{ animationDelay: `-${Date.now() % 4000}ms` }}>'
);
fs.writeFileSync('artifacts/blacket-game/src/components/layout/sidebar.tsx', sidebar);

let layout = fs.readFileSync('artifacts/blacket-game/src/components/layout/layout.tsx', 'utf8');
layout = layout.replace(
  '<span className={`font-display font-black text-white ${me.nameEffect === \'rainbow\' ? \'text-rainbow drop-shadow-none\' : \'\'}`}>{me.username}</span>',
  '<span className={`font-display font-black text-white ${me.nameEffect === \'rainbow\' ? \'text-rainbow drop-shadow-none\' : \'\'}`} style={me.nameEffect === \'rainbow\' ? { animationDelay: `-${Date.now() % 4000}ms` } : undefined}>{me.username}</span>'
);
fs.writeFileSync('artifacts/blacket-game/src/components/layout/layout.tsx', layout);
