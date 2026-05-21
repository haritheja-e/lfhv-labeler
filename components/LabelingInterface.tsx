"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  submitLabel,
  getNextPair,
  type NextPair,
  type Choice,
} from "@/app/actions";

type Side = "left" | "right";
type Layout = { left: "a" | "b"; right: "a" | "b" };
type Entry = { pair: NonNullable<NextPair>; myChoice: Choice | null };

export function LabelingInterface({ initialPair }: { initialPair: NextPair }) {
  const [history, setHistory] = useState<Entry[]>(
    initialPair ? [{ pair: initialPair, myChoice: null }] : []
  );
  const [idx, setIdx] = useState(initialPair ? 0 : -1);
  const [submitting, setSubmitting] = useState(false);
  const [shownAt, setShownAt] = useState<number>(Date.now());
  const [isPlaying, setIsPlaying] = useState(false);

  const layoutsRef = useRef<Map<string, Layout>>(new Map());
  const busyRef = useRef(false);

  const leftRef = useRef<HTMLVideoElement>(null);
  const rightRef = useRef<HTMLVideoElement>(null);

  const current = idx >= 0 && idx < history.length ? history[idx] : null;
  const pair = current?.pair ?? null;
  const myChoice = current?.myChoice ?? null;

  const layout: Layout | null = useMemo(() => {
    if (!pair) return null;
    let l = layoutsRef.current.get(pair.pair_id);
    if (!l) {
      l = Math.random() < 0.5
        ? { left: "a", right: "b" }
        : { left: "b", right: "a" };
      layoutsRef.current.set(pair.pair_id, l);
    }
    return l;
  }, [pair?.pair_id]);

  // Reset shownAt + autoplay both videos on pair change.
  useEffect(() => {
    setShownAt(Date.now());
    // Defer one tick so the new <video> elements (keyed by pair_id) are
    // mounted before we call play(). autoPlay covers the common case but
    // this guarantees both clips start together even if the browser stalls
    // one of them.
    const t = setTimeout(() => {
      void leftRef.current?.play().catch(() => {});
      void rightRef.current?.play().catch(() => {});
    }, 0);
    return () => clearTimeout(t);
  }, [pair?.pair_id]);

  const excludeIds = useMemo(() => history.map((e) => e.pair.pair_id), [history]);
  const hasPrev = idx > 0;
  const atEnd = idx >= history.length - 1;

  const choose = useCallback(
    async (c: Choice) => {
      if (!pair || busyRef.current) return;
      // Clicking the same choice that's already recorded is a no-op so users
      // can't accidentally double-advance by clicking twice.
      if (myChoice === c) return;

      const isEdit = myChoice !== null;
      busyRef.current = true;
      setSubmitting(true);
      try {
        const next = await submitLabel(
          pair.pair_id,
          c,
          Date.now() - shownAt,
          excludeIds
        );
        setHistory((h) => h.map((e, i) => (i === idx ? { ...e, myChoice: c } : e)));

        // Editing an existing choice: stay in place so the user sees the
        // update reflected on the same pair instead of being yanked forward.
        if (isEdit) return;

        if (atEnd) {
          if (next) {
            setHistory((h) =>
              h.some((e) => e.pair.pair_id === next.pair_id)
                ? h
                : [...h, { pair: next, myChoice: null }]
            );
            setIdx((i) =>
              history.some((e) => e.pair.pair_id === next.pair_id) ? i : i + 1
            );
          }
        } else {
          setIdx((i) => i + 1);
        }
      } catch (e) {
        console.error(e);
        alert("Failed to submit — try again.");
      } finally {
        busyRef.current = false;
        setSubmitting(false);
      }
    },
    [pair, myChoice, shownAt, excludeIds, atEnd, idx, history]
  );

  const chooseSide = useCallback(
    (side: Side) => {
      if (!layout) return;
      choose(side === "left" ? layout.left : layout.right);
    },
    [choose, layout]
  );

  const goPrev = useCallback(() => {
    if (hasPrev) setIdx((i) => i - 1);
  }, [hasPrev]);

  const goNext = useCallback(async () => {
    if (busyRef.current) return;
    if (!atEnd) {
      setIdx((i) => i + 1);
      return;
    }
    busyRef.current = true;
    setSubmitting(true);
    try {
      const next = await getNextPair(excludeIds);
      if (next) {
        setHistory((h) =>
          h.some((e) => e.pair.pair_id === next.pair_id)
            ? h
            : [...h, { pair: next, myChoice: null }]
        );
        setIdx((i) =>
          history.some((e) => e.pair.pair_id === next.pair_id) ? i : i + 1
        );
      }
    } finally {
      busyRef.current = false;
      setSubmitting(false);
    }
  }, [atEnd, excludeIds, history]);

  const togglePlay = useCallback(() => {
    const left = leftRef.current;
    const right = rightRef.current;
    if (!left || !right) return;
    if (left.paused || right.paused) {
      void left.play();
      void right.play();
    } else {
      left.pause();
      right.pause();
    }
  }, []);

  // Keyboard: only space / arrows. No more 1/2/3/4/r.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev, goNext, togglePlay]);

  if (!pair || !layout) {
    return (
      <div className="flex-1 flex items-center justify-center text-center px-4">
        <div>
          <h2 className="text-2xl font-semibold mb-2">All done</h2>
          <p className="text-neutral-400">No more pairs to label. Thanks!</p>
        </div>
      </div>
    );
  }

  const urlForSide = (side: Side) => {
    const which = side === "left" ? layout.left : layout.right;
    return which === "a" ? pair.video_a_url : pair.video_b_url;
  };

  const pickedSide: Side | null =
    !myChoice || myChoice === "tie" || myChoice === "bad"
      ? null
      : layout.left === myChoice
      ? "left"
      : "right";

  return (
    <div className="flex-1 flex flex-col px-6 py-4">
      {/* Videos */}
      <div className="grid grid-cols-2 gap-4">
        {(["left", "right"] as const).map((side) => {
          const isPicked = pickedSide === side;
          return (
            <div key={side} className="flex flex-col">
              <div className="text-center text-sm text-neutral-400 mb-2">
                {side === "left" ? "Option 1" : "Option 2"}
              </div>
              <video
                key={`${pair.pair_id}-${side}`}
                ref={side === "left" ? leftRef : rightRef}
                src={urlForSide(side)}
                loop
                playsInline
                autoPlay
                muted
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                className="w-full rounded bg-black aspect-video"
              />
              <button
                onClick={() => chooseSide(side)}
                disabled={submitting}
                className={`mt-3 px-4 py-3 rounded font-medium disabled:opacity-50 ${
                  isPicked
                    ? "bg-green-600 ring-2 ring-green-300"
                    : "bg-blue-600 hover:bg-blue-500"
                }`}
              >
                {isPicked ? "✓ " : ""}Pick {side === "left" ? "Option 1" : "Option 2"}
              </button>
            </div>
          );
        })}
      </div>

      {/* Tie button — centered, same width as one Pick button */}
      <div className="grid grid-cols-2 gap-4 mt-3">
        <div className="col-start-1 col-end-3 flex justify-center">
          <button
            onClick={() => choose("tie")}
            disabled={submitting}
            className={`w-[calc(50%-0.5rem)] px-4 py-3 rounded font-medium disabled:opacity-50 ${
              myChoice === "tie"
                ? "bg-green-600 ring-2 ring-green-300"
                : "bg-blue-600 hover:bg-blue-500"
            }`}
          >
            {myChoice === "tie" ? "✓ " : ""}Tie
          </button>
        </div>
      </div>

      {/* Status line */}
      <div className="text-center text-xs text-neutral-500 mt-4">
        Pair {idx + 1} of {history.length}
        {myChoice && (
          <>
            <span className="mx-2 text-neutral-700">·</span>
            <span className="text-neutral-300">
              Your choice: <span className="font-mono text-green-400">{myChoice}</span>
            </span>
          </>
        )}
      </div>

      {/* Prev — Big Play/Pause — Next. 3-col grid guarantees play is
          page-centered regardless of prev/next button widths. */}
      <div className="grid grid-cols-3 items-center mt-3">
        <div className="flex justify-end pr-6">
          <button
            onClick={goPrev}
            disabled={!hasPrev || submitting}
            className="px-5 py-3 rounded border border-neutral-700 hover:bg-neutral-900 disabled:opacity-30"
            aria-label="Previous pair"
          >
            ← Previous
          </button>
        </div>
        <div className="flex justify-center">
          <button
            onClick={togglePlay}
            className="w-24 h-24 rounded-lg bg-blue-600 hover:bg-blue-500 flex items-center justify-center text-5xl"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? "⏸" : "▶"}
          </button>
        </div>
        <div className="flex justify-start pl-6">
          <button
            onClick={goNext}
            disabled={submitting}
            className="px-5 py-3 rounded border border-neutral-700 hover:bg-neutral-900 disabled:opacity-50"
            aria-label="Next pair"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
