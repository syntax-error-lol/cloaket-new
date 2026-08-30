const fs = require('fs');
let code = fs.readFileSync('artifacts/blacket-game/src/pages/chat.tsx', 'utf8');

if (!code.includes('useGetMe')) {
  code = code.replace(
    /import \{ useGetChatMessages, useSendChatMessage, useGetPlayerProfile, useSendTradeRequest, getGetChatMessagesQueryKey, getGetTradeRequestsQueryKey, getGetPlayerProfileQueryKey \} from "@workspace\/api-client-react";/,
    'import { useGetChatMessages, useSendChatMessage, useGetPlayerProfile, useSendTradeRequest, useGetMe, getGetChatMessagesQueryKey, getGetTradeRequestsQueryKey, getGetPlayerProfileQueryKey } from "@workspace/api-client-react";'
  );
  
  code = code.replace(
    /const sendRequestMutation = useSendTradeRequest\(\);/,
    'const sendRequestMutation = useSendTradeRequest();\n  const { data: me } = useGetMe();'
  );
  
  code = code.replace(
    /<Button [\s\S]*?Trade\s*<\/Button>/,
    `{me?.username !== profile.username && (
                  <Button 
                    className="w-full h-14 text-xl font-black font-display tracking-wide bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-primary/30 rounded-xl"
                    onClick={handleTradeRequest}
                    disabled={sendRequestMutation.isPending}
                  >
                    {sendRequestMutation.isPending ? <Loader2 className="w-6 h-6 animate-spin mr-2" /> : <ArrowRightLeft className="w-6 h-6 mr-2" />}
                    Trade
                  </Button>
                )}`
  );
  
  fs.writeFileSync('artifacts/blacket-game/src/pages/chat.tsx', code);
}
