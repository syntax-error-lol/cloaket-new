import type React from "react";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** CSS class for a player's name effect ('rainbow' | 'golden' | '#rrggbb'). */
export function nameEffectClass(effect: string | null | undefined): string {
  if (effect === "rainbow") return "text-rainbow drop-shadow-none";
  if (effect === "golden") return "text-golden drop-shadow-none";
  return "";
}

/** Inline style for a custom solid name color ('#rrggbb' effects). */
export function nameEffectStyle(effect: string | null | undefined): React.CSSProperties | undefined {
  return effect?.startsWith("#") ? { color: effect } : undefined;
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat("en-US").format(num);
}

export function formatTime(seconds: number): string {
  if (seconds < 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
