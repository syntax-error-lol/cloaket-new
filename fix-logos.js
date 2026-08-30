const fs = require('fs');

function replaceFile(path, replacer) {
  let content = fs.readFileSync(path, 'utf8');
  content = replacer(content);
  fs.writeFileSync(path, content);
}

replaceFile('artifacts/blacket-game/src/components/layout/sidebar.tsx', content => 
  content.replace(
    /<img src=\{logoImg\} alt="Logo" className="[^"]+" \/>/,
    '<img src={logoImg} alt="Logo" className="w-14 h-14 object-contain drop-shadow-md" />'
  )
);

replaceFile('artifacts/blacket-game/src/pages/sign-in.tsx', content => 
  content.replace(
    /<img src=\{logoImg\} alt="Cloaket Logo" className="[^"]+" \/>/,
    '<img src={logoImg} alt="Cloaket Logo" className="h-24 w-24 object-contain drop-shadow-xl" />'
  )
);

replaceFile('artifacts/blacket-game/src/pages/sign-up.tsx', content => 
  content.replace(
    /<img src=\{logoImg\} alt="Cloaket Logo" className="[^"]+" \/>/,
    '<img src={logoImg} alt="Cloaket Logo" className="h-24 w-24 object-contain drop-shadow-xl" />'
  )
);

replaceFile('artifacts/blacket-game/src/pages/admin.tsx', content => {
  let c = content.replace(
    /<div className="w-20 h-20 rounded-2xl bg-secondary border-2 border-primary overflow-hidden shadow-xl p-2 flex items-center justify-center">\s*<img src=\{logoImg\} alt="Logo" className="w-full h-full object-contain" \/>\s*<\/div>/,
    '<div className="w-24 h-24 flex items-center justify-center">\n              <img src={logoImg} alt="Logo" className="w-full h-full object-contain drop-shadow-xl" />\n            </div>'
  );
  c = c.replace(
    /<div className="w-12 h-12 rounded-xl bg-secondary border border-primary flex items-center justify-center overflow-hidden">\s*<img src=\{logoImg\} alt="Logo" className="w-8 h-8 object-contain" \/>\s*<\/div>/,
    '<div className="w-12 h-12 flex items-center justify-center">\n              <img src={logoImg} alt="Logo" className="w-full h-full object-contain drop-shadow-md" />\n            </div>'
  );
  return c;
});

