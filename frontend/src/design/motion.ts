import { gsap } from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { Flip } from "gsap/Flip";

gsap.registerPlugin(CustomEase, Flip);

/** The one easing curve of the design system: cubic-bezier(0.2, 0.8, 0.2, 1). */
export const EASE = CustomEase.create("ht", "M0,0 C0.2,0.8 0.2,1 1,1");

export const DURATION = {
  component: 0.18,
  route: 0.24,
  shared: 0.32,
  reduced: 0.12,
} as const;

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export { gsap, Flip };
