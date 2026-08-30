const fs = require('fs');
let code = fs.readFileSync('artifacts/blacket-game/src/pages/bazaar.tsx', 'utf8');

code = code.replace(
  /return \(\n    <Layout title="Bazaar">/,
  'return (\n    <Layout title="Bazaar" fixedHeight>'
);

fs.writeFileSync('artifacts/blacket-game/src/pages/bazaar.tsx', code);
