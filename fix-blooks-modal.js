const fs = require('fs');
let code = fs.readFileSync('artifacts/blacket-game/src/pages/blooks.tsx', 'utf8');

code = code.replace(
  /<div className="flex items-center gap-2">\s*<Input[\s\S]*?className="font-bold h-10"\s*\/>\s*<Button variant="outline" size="sm" onClick=\{\(\) => setSellQuantity\(selectedBlook\.quantity\)\}>Max<\/Button>\s*<\/div>/,
  `<div className="flex items-center gap-2 w-full">
                      <Input 
                        type="number" 
                        min={1} 
                        max={selectedBlook.quantity} 
                        value={sellQuantity} 
                        onChange={(e) => setSellQuantity(Math.min(selectedBlook.quantity, Math.max(1, parseInt(e.target.value) || 1)))}
                        className="font-bold h-10 flex-1 min-w-0"
                      />
                      <Button variant="outline" size="sm" onClick={() => setSellQuantity(selectedBlook.quantity)} className="shrink-0">Max</Button>
                    </div>`
);

// Do the same for list price
code = code.replace(
  /<div className="flex items-center gap-2">\s*<Coins className="w-5 h-5 text-yellow-400" \/>\s*<Input[\s\S]*?className="font-bold h-10"\s*min=\{1\}\s*\/>\s*<\/div>/,
  `<div className="flex items-center gap-2 w-full">
                        <Coins className="w-5 h-5 text-yellow-400 shrink-0" />
                        <Input 
                          type="number"
                          placeholder="Price..."
                          value={listPrice}
                          onChange={(e) => setListPrice(e.target.value === "" ? "" : Math.max(1, parseInt(e.target.value) || 0))}
                          className="font-bold h-10 flex-1 min-w-0"
                          min={1}
                        />
                      </div>`
);

fs.writeFileSync('artifacts/blacket-game/src/pages/blooks.tsx', code);
