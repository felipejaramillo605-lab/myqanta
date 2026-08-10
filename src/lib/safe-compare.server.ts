// Comparación de secretos en tiempo constante (evita ataques de temporización).
import { timingSafeEqual } from "node:crypto";

export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}