"use client";
import { useEffect, useRef, useState } from "react";
import { cx } from "./ui";

/**
 * Draw or type a signature. Calls onChange with a PNG data URL, or null when empty.
 */
export function SignaturePad({ name, onChange }: { name: string; onChange: (png: string | null) => void }) {
  const [mode, setMode] = useState<"draw" | "type">("draw");
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const strokes = useRef(0);

  const setup = () => {
    const c = canvas.current;
    if (!c) return null;
    const ratio = Math.max(window.devicePixelRatio || 1, 2);
    const w = c.clientWidth, h = c.clientHeight;
    if (c.width !== w * ratio) {
      c.width = w * ratio; c.height = h * ratio;
    }
    const ctx = c.getContext("2d")!;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return ctx;
  };

  const clear = () => {
    const ctx = setup();
    if (ctx && canvas.current) ctx.clearRect(0, 0, canvas.current.width, canvas.current.height);
    strokes.current = 0;
    onChange(null);
  };

  // Typed signature
  useEffect(() => {
    if (mode !== "type") return;
    const ctx = setup();
    const c = canvas.current;
    if (!ctx || !c) return;
    ctx.clearRect(0, 0, c.width, c.height);
    const text = name.trim();
    if (!text) { onChange(null); return; }
    let size = 46;
    const font = (s: number) => `italic ${s}px "Segoe Script", "Brush Script MT", "Snell Roundhand", "Apple Chancery", cursive`;
    ctx.font = font(size);
    while (ctx.measureText(text).width > c.clientWidth - 40 && size > 18) { size -= 2; ctx.font = font(size); }
    ctx.fillStyle = "#111";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 20, c.clientHeight / 2);
    onChange(c.toDataURL("image/png"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, name]);

  // Switching to draw starts from a blank pad.
  useEffect(() => { if (mode === "draw") clear(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const pos = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: React.PointerEvent) => {
    if (mode !== "draw") return;
    canvas.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current || mode !== "draw") return;
    const ctx = setup()!;
    const p = pos(e);
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(last.current!.x, last.current!.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    strokes.current++;
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (strokes.current > 8) onChange(canvas.current!.toDataURL("image/png"));
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex gap-1 rounded-lg bg-soft p-1">
          {(["draw", "type"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={cx("rounded-md px-3 py-1 text-[13px]", mode === m ? "bg-white font-medium shadow-sm" : "text-muted")}>
              {m === "draw" ? "Draw" : "Type"}
            </button>
          ))}
        </div>
        {mode === "draw" && <button type="button" onClick={clear} className="text-[13px] text-muted hover:text-ink">Clear</button>}
      </div>
      <div className="relative">
        <canvas
          ref={canvas}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
          className={cx("h-[160px] w-full touch-none rounded-xl border border-line bg-white", mode === "draw" && "cursor-crosshair")}
        />
        <div className="pointer-events-none absolute bottom-8 left-5 right-5 border-b border-dashed border-line" />
        {mode === "draw" && <div className="pointer-events-none absolute bottom-2 left-5 text-[11px] text-faint">Sign above the line with your finger, pen or mouse</div>}
        {mode === "type" && !name.trim() && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[13px] text-faint">Type your full name above</div>}
      </div>
    </div>
  );
}
