"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { submitLabel, undoLastLabel, type NextPair } from "@/app/actions";

type Side = "left" | "right";

export function LabelingInterface({ initialPair }: { initialPair: NextPair }) {
  const [pair, setPair] = useState<NextPair>(initialPair);
  const [submitting, setSubmitting] = useState(false);
  const [layout, setLayout] = useState<{ left: "a" | "b"; right: "a" | "b" }>({
    left: "a",
    right: "b",
  });
  const [shownAt, setShownAt] = useState<number>(Date.now());
  const leftRef = useRef<HTMLVideoElement>(null);
  const rightRef = useRef<HTMLVideoElement>(null);

  // Randomize left/right whenever a new pair comes in, so labelers can't
  // game/anticipate which side is the baseline.
  useEffect(() => {
    setLayout(Math.random() < 0.5 ? { left: "a", right: "b" } : { left: "b", right: "a" });
    setShownAt(Date.now());
  }, [pair?.pair_id]);

  const choose = useCallback(
    async (choice: "a" | "b" | "tie" | "bad") => {
      if (submitting || !pair) return;
      setSubmitting(true);
      try {
        const next = await submitLabel(pair.pair_id, choice, Date.now() - shownAt);
        setPair(next);
      } catch (e) {
        console.error(e);
        alert("Failed to submit — try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [submitting, pair, shownAt]
  );

  const chooseSide = useCallback(
    (side: Side) => choose(side === "left" ? layout.left : layout.right),
    [choose, layout]
  );

  const undo = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const next = await undoLastLabel();
      setPair(next);
    } finally {
      setSubmitting(false);
    }
  }, [submitting]);

  const playBoth = useCallback(() => {
    leftRef.current?.play();
    rightRef.current?.play();
  }, []);
  const pauseBoth = useCallback(() => {
    leftRef.current?.pause();
    rightRef.current?.pause();
  }, []);
  const restart = useCallback(() => {
    if (leftRef.current) leftRef.current.currentTime = 0;
    if (rightRef.current) rightRef.current.currentTime = 0;
    playBoth();
  }, [playBoth]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "1") chooseSide("left");
      else if (e.key === "2") chooseSide("right");
      else if (e.key === "3") choose("tie");
      else if (e.key === "4") choose("bad");
      else if (e.key === " ") {
        e.preventDefault();
        if (leftRef.current?.paused) playBoth();
        else pauseBoth();
      } else if (e.key === "r") restart();
      else if (e.key === "u") undo();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chooseSide, choose, playBoth, pauseBoth, restart, undo]);

  if (!pair) {
    return (
      <div className="flex-1 flex items-center justify-center text-center px-4">
        <div>
          <h2 className="text-2xl font-semibold mb-2">All done</h2>
          <p className="text-neutral-400">
            You&apos;ve labeled every pair available to you. Thanks!
          </p>
        </div>
      </div>
    );
  }

  const urlForSide = (side: Side) => {
    const which = side === "left" ? layout.left : layout.right;
    return which === "a" ? pair.video_a_url : pair.video_b_url;
  };

  return (
    <div className="flex-1 flex flex-col px-6 py-4">
      <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
        {(["left", "right"] as const).map((side) => (
          <div key={side} className="flex flex-col">
            <div className="text-center text-sm text-neutral-400 mb-2">
              {side === "left" ? "Option 1" : "Option 2"}
            </div>
            <video
              ref={side === "left" ? leftRef : rightRef}
              src={urlForSide(side)}
              controls
              loop
              playsInline
              className="w-full rounded bg-black aspect-video"
            />
            <button
              onClick={() => chooseSide(side)}
              disabled={submitting}
              className="mt-3 px-4 py-3 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 font-medium"
            >
              Pick {side === "left" ? "Option 1" : "Option 2"} ({side === "left" ? "1" : "2"})
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center gap-2 mt-6 flex-wrap">
        <button
          onClick={playBoth}
          className="px-3 py-2 rounded border border-neutral-700 hover:bg-neutral-900"
        >
          Play both (space)
        </button>
        <button
          onClick={pauseBoth}
          className="px-3 py-2 rounded border border-neutral-700 hover:bg-neutral-900"
        >
          Pause
        </button>
        <button
          onClick={restart}
          className="px-3 py-2 rounded border border-neutral-700 hover:bg-neutral-900"
        >
          Restart (r)
        </button>
        <span className="mx-2 text-neutral-700">|</span>
        <button
          onClick={() => choose("tie")}
          disabled={submitting}
          className="px-3 py-2 rounded border border-neutral-700 hover:bg-neutral-900 disabled:opacity-50"
        >
          Tie (3)
        </button>
        <button
          onClick={() => choose("bad")}
          disabled={submitting}
          className="px-3 py-2 rounded border border-neutral-700 hover:bg-neutral-900 disabled:opacity-50"
        >
          Both bad (4)
        </button>
        <button
          onClick={undo}
          disabled={submitting}
          className="px-3 py-2 rounded border border-neutral-700 hover:bg-neutral-900 disabled:opacity-50"
        >
          Undo last (u)
        </button>
      </div>

      <div className="text-center text-xs text-neutral-500 mt-2">
        {pair.current_count}/3 labels already on this pair
      </div>
    </div>
  );
}
