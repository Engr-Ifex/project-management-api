import { useEffect, useRef } from 'react';

/**
 * A CSS 3D product visualization — floating task and project cards that
 * suggest the PROJEX interface without loading the actual application.
 *
 * Built with CSS transforms only: no Three.js, no WebGL, no extra dependency.
 *
 * ## Why this is scaled rather than repositioned
 *
 * The composition is authored in a fixed design space: cards sit at offsets up
 * to ±140px from centre and are up to 210px wide, so the whole scene needs
 * roughly 500px of width to sit inside its container without clipping.
 *
 * That is wider than a phone. A 375px viewport leaves ~343px of content, and
 * the original version used those fixed offsets at every width — so the
 * left-most card started about 70px outside the container and the right-most
 * one ended about 45px past it. The section's `overflow-hidden` then cut them
 * off, which read as "the 3D element is misaligned on mobile".
 *
 * The fix is one `scale()` on the 3D wrapper, derived from the measured
 * container width. Every offset, card width and depth is authored once and the
 * whole composition shrinks to fit; nothing is repositioned per breakpoint and
 * desktop stays at scale 1.
 *
 * ## Why the float is not a CSS keyframe
 *
 * The cards are centred with `translate(-50%, -50%)` in their inline
 * `transform`. A `@keyframes` rule that animated the independent `translate`
 * property composed with that transform instead of replacing it, so the
 * centring offset was applied twice and every card sat half its own size up and
 * to the left of where it was meant to be. The float is therefore applied in
 * the same transform string the parallax writes.
 *
 * Respects `prefers-reduced-motion`: the loop never starts, and the cards keep
 * their composed static arrangement.
 */

interface CardData {
  text: string;
  meta: string;
  color: string;
  x: number;
  y: number;
  z: number;
  rotateX: number;
  rotateY: number;
  rotateZ: number;
  phase: number;
  duration: number;
  width: number;
}

/** Width the composition needs before scaling: furthest card edge × 2. */
const DESIGN_WIDTH = 504;

const CARDS: CardData[] = [
  {
    text: 'Design system audit',
    meta: 'In progress',
    color: '#348579',
    x: -140,
    y: -90,
    z: 60,
    rotateX: 8,
    rotateY: -18,
    rotateZ: -3,
    phase: 0,
    duration: 6,
    width: 200,
  },
  {
    text: 'Q4 roadmap',
    meta: 'Planning',
    color: '#a67c2e',
    x: 110,
    y: -70,
    z: 30,
    rotateX: 5,
    rotateY: 14,
    rotateZ: 2,
    phase: 1.2,
    duration: 7,
    width: 180,
  },
  {
    text: 'API migration',
    meta: 'Review',
    color: '#4a8a5c',
    x: -90,
    y: 70,
    z: 80,
    rotateX: -6,
    rotateY: -10,
    rotateZ: -1,
    phase: 0.6,
    duration: 5.5,
    width: 190,
  },
  {
    text: 'Onboarding flow',
    meta: 'Done',
    color: '#7c7871',
    x: 130,
    y: 60,
    z: 20,
    rotateX: -4,
    rotateY: 20,
    rotateZ: 3,
    phase: 2,
    duration: 6.5,
    width: 170,
  },
  {
    text: 'Mobile responsiveness',
    meta: 'In progress',
    color: '#348579',
    x: 0,
    y: -10,
    z: 100,
    rotateX: 2,
    rotateY: 0,
    rotateZ: 0,
    phase: 0.8,
    duration: 7.5,
    width: 210,
  },
];

export const Scene3D = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const stage = stageRef.current;
    if (!container || !stage) return;

    const cards = Array.from(stage.querySelectorAll<HTMLElement>('[data-scene-card]'));

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /*
     * `0.55` is the floor: below that the labels stop being legible, and a
     * 320px viewport still lands at ~0.63, so the floor is only a guard against
     * a pathological measurement (a hidden container reports 0).
     */
    let scale = 1;
    let tiltX = 0;
    let tiltY = 0;
    let targetX = 0;
    let targetY = 0;
    let frame = 0;

    const paint = (elapsed: number) => {
      CARDS.forEach((card, index) => {
        const element = cards[index];
        if (!element) return;

        const depth = card.z / 100;
        const rx = card.rotateX - tiltY * 0.4 * depth;
        const ry = card.rotateY + tiltX * 0.4 * depth;
        const float = Math.sin((elapsed / 1000) * ((Math.PI * 2) / card.duration) + card.phase) * 5;

        element.style.transform =
          `translate(-50%, -50%) translate3d(${card.x}px, ${card.y + float}px, ${card.z}px) ` +
          `rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${card.rotateZ}deg)`;
      });
    };

    const measure = () => {
      const width = container.clientWidth;
      scale = Math.min(1, Math.max(0.55, width / DESIGN_WIDTH));
      stage.style.transform = `scale(${scale})`;
      // The static arrangement still has to be correct without motion.
      if (prefersReducedMotion) paint(0);
    };

    const observer = new ResizeObserver(measure);
    observer.observe(container);
    measure();

    if (prefersReducedMotion) {
      return () => observer.disconnect();
    }

    const onMove = (event: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      targetX = ((event.clientX - cx) / rect.width) * 20;
      targetY = ((event.clientY - cy) / rect.height) * 20;
    };

    const tick = (time: number) => {
      tiltX += (targetX - tiltX) * 0.06;
      tiltY += (targetY - tiltY) * 0.06;
      paint(time);
      frame = requestAnimationFrame(tick);
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    frame = requestAnimationFrame(tick);

    return () => {
      observer.disconnect();
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative mx-auto h-[300px] w-full max-w-lg overflow-hidden sm:h-[380px] md:h-[420px]"
      style={{ perspective: '900px' }}
      aria-hidden="true"
    >
      <div
        ref={stageRef}
        className="absolute inset-0 origin-center will-change-transform"
        style={{ transformStyle: 'preserve-3d' }}
      >
        {CARDS.map((card, i) => (
          <div
            key={i}
            data-scene-card
            className="absolute left-1/2 top-1/2 will-change-transform"
            style={{
              width: card.width,
              transform: `translate(-50%, -50%) translate3d(${card.x}px, ${card.y}px, ${card.z}px) rotateX(${card.rotateX}deg) rotateY(${card.rotateY}deg) rotateZ(${card.rotateZ}deg)`,
            }}
          >
            <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-lg">
              <div className="flex items-center gap-2 px-3 py-2.5">
                <span
                  className="inline-block size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: card.color }}
                />
                <span className="truncate text-xs font-medium text-body">{card.text}</span>
              </div>
              <div className="border-t border-line-subtle px-3 py-1.5">
                <span className="text-2xs text-body-muted">{card.meta}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
