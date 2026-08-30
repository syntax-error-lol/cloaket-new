const fs = require('fs');

let code = fs.readFileSync('artifacts/blacket-game/src/pages/chat.tsx', 'utf8');

code = code.replace(
  /<div className="flex flex-col h-full">/,
  '<div className="flex flex-col h-full overflow-hidden">'
);

// We'll just string replace the exact useEffect block
const oldEffect = `  useEffect(() => {
    if (scrollRef.current) {
      const scrollElement = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [messages]);`;

const newEffect = `  const lastMessageCount = useRef(messages?.length || 0);
  
  useEffect(() => {
    if (!messages) return;
    if (scrollRef.current) {
      const scrollElement = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        const isAtBottom = scrollElement.scrollHeight - scrollElement.scrollTop - scrollElement.clientHeight < 100;
        const isFirstLoad = lastMessageCount.current === 0;
        const hasNewMessageFromMe = messages[messages.length - 1]?.author === me?.username;
        
        if (isAtBottom || isFirstLoad || hasNewMessageFromMe) {
          setTimeout(() => {
            scrollElement.scrollTop = scrollElement.scrollHeight;
          }, 10);
        }
      }
    }
    lastMessageCount.current = messages.length;
  }, [messages, me]);`;

code = code.replace(oldEffect, newEffect);

fs.writeFileSync('artifacts/blacket-game/src/pages/chat.tsx', code);
