const fs = require('fs');
let code = fs.readFileSync('artifacts/blacket-game/src/pages/chat.tsx', 'utf8');

code = code.replace(
  /<Layout title="Chat">/,
  '<Layout title="Chat" fixedHeight>'
);

fs.writeFileSync('artifacts/blacket-game/src/pages/chat.tsx', code);
