import tokenImg from "@/assets/token.png";

export function TokenIcon({ className = "" }: { className?: string }) {
  return <img src={tokenImg} alt="Tokens" className={`object-contain ${className}`} />;
}
