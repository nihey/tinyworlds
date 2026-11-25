"use client";

import { useEffect, useState } from "react";
import type { WalkGame } from "@/walk/game";
import { SWING_SECONDS } from "@/walk/punch";
import "./punch-view.css";

export function PunchView({ game }: { game: WalkGame }) {
  const [onFoot, setOnFoot] = useState(game.state.mode === "foot");
  const [swing, setSwing] = useState(game.state.punch);

  useEffect(() => {
    let foot = game.state.mode === "foot";
    let punch = game.state.punch;
    return game.subscribe((state) => {
      const nowFoot = state.mode === "foot";
      if (foot !== nowFoot) setOnFoot((foot = nowFoot));
      if (punch !== state.punch) setSwing((punch = state.punch));
    });
  }, [game]);

  if (!onFoot) return null;
  return (
    <div className="walk-punch-overlay" aria-hidden>
      <div className="walk-punch-aim" />
      {swing?.hit && <div key={`hit-${swing.sequence}`} className="walk-punch-hit" />}
      <div
        key={swing?.sequence ?? 0}
        className="walk-punch-hand"
        data-walk-hand={swing ? "swing" : "idle"}
        style={{ animationDuration: `${SWING_SECONDS}s` }}
      >
        <div className="walk-punch-sleeve" />
        <div className="walk-punch-cuff" />
        <div className="walk-punch-knuckles" />
        <div className="walk-punch-fist" />
      </div>
    </div>
  );
}
