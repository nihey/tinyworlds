import { useEffect, useRef } from "react";
import { precipitates, type WeatherCondition } from "@/map/weather";

/** A low-resolution, transparent layer. Map pins and controls stay sharp above it. */
export function MapWeather({
  condition,
  reduced,
}: {
  condition: WeatherCondition;
  reduced: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const falling = precipitates(condition) && !reduced;
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !falling) return;
    const snow = condition === "snow";
    const storm = condition === "storm";
    const drops = Array.from({ length: storm ? 480 : 320 }, () => ({
      x: Math.random(),
      y: Math.random(),
      depth: 0.4 + Math.random() * 0.6,
    }));
    let frame = 0;
    const draw = (ms: number) => {
      const w = Math.max(1, Math.ceil(canvas.clientWidth / 2));
      const h = Math.max(1, Math.ceil(canvas.clientHeight / 2));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = snow ? "#f1f6ff" : "#c2d8eb";
      const t = ms / 1000;
      const count = Math.min(drops.length, Math.ceil((w * h) / (storm ? 620 : 970)));
      for (let i = 0; i < count; i++) {
        const drop = drops[i];
        const speed = drop.depth * (snow ? 23 : storm ? 230 : 160);
        const sway = snow ? 6 * Math.sin(t * 0.8 + drop.y * 18) : 0;
        const x = Math.floor((drop.x * w + t * speed * (storm ? 0.36 : 0.16) + sway + w) % w);
        const y = Math.floor((drop.y * h + t * speed) % (h + 10)) - 10;
        ctx.globalAlpha = (snow ? 0.85 : 0.65) * drop.depth;
        if (snow) {
          const size = drop.depth > 0.78 ? 2 : 1;
          ctx.fillRect(x, y, size, size);
        } else {
          const length = Math.round((storm ? 5 : 3) * drop.depth);
          ctx.fillRect(x, y, 1, length);
          ctx.fillRect(x + 1, y + length, 1, length);
        }
      }
      frame = requestAnimationFrame(draw);
    };
    const resume = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden) frame = requestAnimationFrame(draw);
    };
    resume();
    document.addEventListener("visibilitychange", resume);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [falling, condition]);

  if (condition === "clear") return null;
  return (
    <div className="map-weather" data-weather={condition} aria-hidden>
      {falling && <canvas ref={ref} className="size-full" />}
    </div>
  );
}
