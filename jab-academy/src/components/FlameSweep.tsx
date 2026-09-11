"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  radius: number;
  hue: number;
};

export default function FlameSweep() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mudRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    const mud = mudRef.current;
    const headline = headlineRef.current;
    if (!section || !canvas || !mud || !headline) return;

    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    let particles: Particle[] = [];
    const sweepState = { x: -0.2, active: false };

    const spawn = (originX: number) => {
      for (let i = 0; i < 4; i++) {
        particles.push({
          x: originX + (Math.random() - 0.5) * 30,
          y: height * 0.75 + Math.random() * 10,
          vx: (Math.random() - 0.5) * 0.4,
          vy: -1.2 - Math.random() * 1.6,
          life: 0,
          maxLife: 40 + Math.random() * 30,
          radius: 14 + Math.random() * 22,
          hue: Math.random() > 0.4 ? 30 : 45,
        });
      }
    };

    let raf = 0;
    const draw = () => {
      ctx2d.clearRect(0, 0, width, height);

      if (sweepState.active) {
        spawn(sweepState.x * width);
      }

      particles = particles.filter((p) => p.life < p.maxLife);
      for (const p of particles) {
        p.life += 1;
        p.x += p.vx;
        p.y += p.vy;
        const t = p.life / p.maxLife;
        const alpha = Math.max(0, 1 - t) * 0.85;
        const r = p.radius * (1 - t * 0.4);
        const grad = ctx2d.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        grad.addColorStop(0, `hsla(${p.hue + 15}, 100%, 75%, ${alpha})`);
        grad.addColorStop(0.4, `hsla(${p.hue}, 100%, 55%, ${alpha * 0.8})`);
        grad.addColorStop(1, `hsla(${p.hue - 20}, 90%, 35%, 0)`);
        ctx2d.fillStyle = grad;
        ctx2d.beginPath();
        ctx2d.arc(p.x, p.y, Math.max(r, 0), 0, Math.PI * 2);
        ctx2d.fill();
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    let st: ScrollTrigger | undefined;

    if (!reducedMotion) {
      st = ScrollTrigger.create({
        trigger: section,
        start: "top 75%",
        end: "top 15%",
        onEnter: () => {
          sweepState.active = true;
          gsap.to(sweepState, {
            x: 1.2,
            duration: 1,
            ease: "power1.inOut",
            onComplete: () => {
              sweepState.active = false;
            },
          });
          gsap.fromTo(
            headline,
            { textShadow: "0 0 0px rgba(255,107,0,0)" },
            {
              textShadow:
                "0 0 30px rgba(255,107,0,0.8), 0 0 70px rgba(200,16,46,0.5)",
              duration: 1,
              ease: "power1.inOut",
            }
          );
        },
        onLeaveBack: () => {
          sweepState.x = -0.2;
          gsap.to(headline, { textShadow: "0 0 0px rgba(255,107,0,0)", duration: 0.4 });
        },
      });

      gsap.fromTo(
        mud,
        { opacity: 0 },
        {
          opacity: 1,
          scrollTrigger: {
            trigger: section,
            start: "top 80%",
            end: "top 10%",
            scrub: 0.6,
          },
        }
      );
    } else {
      mud.style.opacity = "1";
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      st?.kill();
    };
  }, []);

  return (
    <div ref={sectionRef} className="relative h-[46vh] min-h-[280px] overflow-hidden bg-jab-black">
      <div ref={mudRef} className="mud-texture absolute inset-0 opacity-0" />
      <div className="grain-overlay" />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center">
        <p className="section-eyebrow mb-3">The Flame Never Went Out</p>
        <div
          ref={headlineRef}
          className="font-display text-2xl sm:text-4xl font-extrabold tracking-tight max-w-3xl text-balance"
        >
          From a satirical street protest to a discipline studied worldwide.
        </div>
      </div>
    </div>
  );
}
