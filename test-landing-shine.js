const fs = require('fs');
let css = fs.readFileSync('artifacts/blacket-game/src/index.css', 'utf8');

if (!css.includes('animate-shine')) {
  css += `
@layer utilities {
  @keyframes shine {
    to {
      background-position: 200% center;
    }
  }
  .animate-shine {
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
    background-size: 200% auto;
    animation: shine 2s linear infinite;
  }
}
`;
  fs.writeFileSync('artifacts/blacket-game/src/index.css', css);
}

let landing = fs.readFileSync('artifacts/blacket-game/src/pages/landing.tsx', 'utf8');
landing = landing.replace(
  /<span className="text-5xl md:text-7xl text-rainbow leading-tight px-2">Cloaket<\/span>/,
  '<span className="text-5xl md:text-7xl text-rainbow leading-tight px-2 relative group-hover:scale-105 transition-transform duration-300">Cloaket<div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:animate-[shine_1.5s_ease-in-out_infinite]" /></span>'
);
landing = landing.replace(
  /<h1 className="flex flex-col items-center justify-center font-black font-display tracking-widest uppercase mb-4 drop-shadow-\[0_0_20px_rgba\(107,59,227,0\.5\)\]">/,
  '<h1 className="flex flex-col items-center justify-center font-black font-display tracking-widest uppercase mb-4 drop-shadow-[0_0_20px_rgba(107,59,227,0.5)] group cursor-default">'
);

fs.writeFileSync('artifacts/blacket-game/src/pages/landing.tsx', landing);
