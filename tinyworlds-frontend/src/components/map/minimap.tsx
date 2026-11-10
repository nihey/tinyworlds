"use client";

import { useEffect, useRef, type PointerEvent } from "react";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";
import { dataUrl } from "@/map/data";
import type { MapEngine } from "@/map/engine";
import { WORLD } from "@/worlds";

interface MinimapProps {
  engine: MapEngine;
  /** a smaller one, for phones */
  compact: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/** The whole map, small, with the part on screen outlined. Press or drag to move the view. */
export function Minimap({ engine, compact, className, style }: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { t } = useI18n();
  const { manifest } = engine;
  const b = manifest.bounds;

  // fit the overview's shape into a box
  const aspect =
    manifest.overview.width > 0 && manifest.overview.height > 0
      ? manifest.overview.width / manifest.overview.height
      : (b.maxX - b.minX) / (b.maxY - b.minY);
  const maxW = compact ? 132 : 208;
  const maxH = compact ? 92 : 140;
  const width = Math.round(Math.min(maxW, maxH * aspect));
  const height = Math.round(Math.min(maxH, maxW / aspect));

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    let image: HTMLImageElement | null = null;
    const draw = () => {
      const v = engine.getView();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      if (image) {
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(image, 0, 0, width, height);
      }
      // the part of the map on screen, in minimap px
      const sx = width / (b.maxX - b.minX);
      const sy = height / (b.maxY - b.minY);
      const l = Math.max(0, (v.left - b.minX) * sx);
      const tp = Math.max(0, (v.top - b.minY) * sy);
      const r = Math.min(width, (v.right - b.minX) * sx);
      const bt = Math.min(height, (v.bottom - b.minY) * sy);
      if (r - l >= width - 1 && bt - tp >= height - 1) return; // everything is on screen

      // dim what is off screen
      ctx.fillStyle = "rgba(21, 23, 26, 0.45)";
      ctx.beginPath();
      ctx.rect(0, 0, width, height);
      ctx.rect(l, tp, Math.max(0, r - l), Math.max(0, bt - tp));
      ctx.fill("evenodd");

      // outline it; when it is too small to see, mark the spot instead
      const w = r - l;
      const h = bt - tp;
      const cx = (l + r) / 2;
      const cy = (tp + bt) / 2;
      const box =
        w < 9 || h < 9
          ? {
              x: cx - Math.max(w, 9) / 2,
              y: cy - Math.max(h, 9) / 2,
              w: Math.max(w, 9),
              h: Math.max(h, 9),
            }
          : { x: l, y: tp, w, h };
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#15171a";
      ctx.lineWidth = 3.5;
      ctx.strokeRect(box.x, box.y, box.w, box.h);
      ctx.strokeStyle = WORLD.accent.color;
      ctx.lineWidth = 1.75;
      ctx.strokeRect(box.x, box.y, box.w, box.h);
    };

    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      image = img;
      draw();
    };
    img.src = dataUrl(manifest.overview.src, manifest.build);

    draw();
    const off = engine.on("view", draw);
    return () => {
      off();
      img.onload = null;
    };
  }, [engine, manifest, b, width, height]);

  const moveTo = (e: PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const fy = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    engine.jumpTo({ x: b.minX + fx * (b.maxX - b.minX), y: b.minY + fy * (b.maxY - b.minY) });
  };

  return (
    <div className={cn("sign z-10 overflow-hidden p-1", className)} style={style}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={t.minimap.label}
        style={{ width, height }}
        className="block cursor-crosshair touch-none rounded-[7px]"
        onPointerDown={(e) => {
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* the pointer is already gone */
          }
          moveTo(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) moveTo(e);
        }}
      />
    </div>
  );
}
