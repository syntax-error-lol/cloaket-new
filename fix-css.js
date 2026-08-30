const fs = require('fs');
let code = fs.readFileSync('artifacts/blacket-game/src/index.css', 'utf8');

if (!code.includes('animate-float')) {
  code += `
@layer utilities {
  @keyframes float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-10px); }
  }
  .animate-float {
    animation: float 4s ease-in-out infinite;
  }
  
  @keyframes bg-drift {
    0% { background-position: 0px 0px; }
    100% { background-position: 48px 48px; }
  }
  .animate-bg-drift {
    animation: bg-drift 4s linear infinite;
  }
}
`;
  fs.writeFileSync('artifacts/blacket-game/src/index.css', code);
}
