const fs = require('fs');

let appCode = fs.readFileSync('artifacts/blacket-game/src/App.tsx', 'utf8');
appCode = appCode.replace(/<Redirect to="\/sign-in" \/>/g, '<Redirect to="/sign-up" />');
fs.writeFileSync('artifacts/blacket-game/src/App.tsx', appCode);

let landingCode = fs.readFileSync('artifacts/blacket-game/src/pages/landing.tsx', 'utf8');
landingCode = landingCode.replace(/href="\/sign-in">Play Now<\/Link>/, 'href="/sign-up">Play Now</Link>');
landingCode = landingCode.replace(/href="\/sign-up">Sign Up<\/Link>/, 'href="/sign-in">Sign In</Link>');
fs.writeFileSync('artifacts/blacket-game/src/pages/landing.tsx', landingCode);
