"use client";
import { useEffect, useRef, type ReactNode } from "react";

interface BeamsBackgroundProps {
  className?: string;
  children?: ReactNode;
  intensity?: "subtle" | "medium" | "strong";
}
interface Beam {
  x: number;
  y: number;
  width: number;
  length: number;
  angle: number;
  speed: number;
  opacity: number;
  hue: number;
  pulse: number;
  pulseSpeed: number;
}
function createBeam(width: number, height: number): Beam {
  return {
    x: Math.random() * width * 1.5 - width * 0.25,
    y: Math.random() * height * 1.5 - height * 0.25,
    width: 30 + Math.random() * 60,
    length: height * 2.5,
    angle: -35 + Math.random() * 10,
    speed: 0.6 + Math.random() * 1.2,
    opacity: 0.12 + Math.random() * 0.16,
    hue: 190 + Math.random() * 70,
    pulse: Math.random() * Math.PI * 2,
    pulseSpeed: 0.02 + Math.random() * 0.03,
  };
}
const opacityMap = { subtle: 0.7, medium: 0.85, strong: 1 };

/** Adapted from the supplied Beams component. Container-sized and no motion dependency. */
export function BeamsBackground({
  className = "",
  children,
  intensity = "strong",
}: BeamsBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const container = containerRef.current,
      canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!container || !canvas || !ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0,
      height = 0,
      beams: Beam[] = [],
      frame = 0,
      last = 0,
      inView = true;
    function draw(delta: number) {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      beams.forEach((beam, index) => {
        beam.y -= beam.speed * delta;
        beam.pulse += beam.pulseSpeed * delta;
        if (beam.y + beam.length < -100) {
          beam.y = height + 100;
          beam.x = (((index % 3) + 0.5) * width) / 3;
        }
        ctx.save();
        ctx.translate(beam.x, beam.y);
        ctx.rotate((beam.angle * Math.PI) / 180);
        const opacity =
          beam.opacity *
          (0.8 + Math.sin(beam.pulse) * 0.2) *
          opacityMap[intensity];
        const gradient = ctx.createLinearGradient(0, 0, 0, beam.length);
        for (const [stop, strength] of [
          [0, 0],
          [0.1, 0.5],
          [0.4, 1],
          [0.6, 1],
          [0.9, 0.5],
          [1, 0],
        ])
          gradient.addColorStop(
            stop,
            `hsla(${beam.hue},85%,65%,${opacity * strength})`,
          );
        ctx.fillStyle = gradient;
        ctx.fillRect(-beam.width / 2, 0, beam.width, beam.length);
        ctx.restore();
      });
    }
    function animate(time: number) {
      if (time - last >= 1000 / 30) {
        draw(last ? Math.min((time - last) / (1000 / 60), 3) : 0);
        last = time;
      }
      frame = requestAnimationFrame(animate);
    }
    function resume() {
      cancelAnimationFrame(frame);
      last = 0;
      if (reduced.matches || document.hidden || !inView) {
        draw(0);
        return;
      }
      frame = requestAnimationFrame(animate);
    }
    function resize() {
      if (!container || !canvas || !ctx) return;
      width = container.clientWidth;
      height = container.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      beams = Array.from({ length: width < 768 ? 15 : 30 }, () =>
        createBeam(width, height),
      );
      draw(0);
      resume();
    }
    const observer = new ResizeObserver(resize);
    const visibility = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      resume();
    });
    observer.observe(container);
    visibility.observe(container);
    document.addEventListener("visibilitychange", resume);
    reduced.addEventListener("change", resume);
    resize();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      visibility.disconnect();
      document.removeEventListener("visibilitychange", resume);
      reduced.removeEventListener("change", resume);
    };
  }, [intensity]);
  return (
    <div ref={containerRef} className={`beams-background ${className}`}>
      <canvas ref={canvasRef} className="beams-canvas" aria-hidden="true" />
      <div className="beams-veil" aria-hidden="true" />
      <div className="beams-content">{children}</div>
    </div>
  );
}
