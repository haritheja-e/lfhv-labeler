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

  // Persistent layout per pair so navigating back shows the same arrangement.
  const layoutsRef = useRef<Map<string, Layout>>(new Map());

  // Synchronous lock to block double-trigger races (button+keyboard, rapid clicks)
  // that would otherwise let two submitLabel/getNextPair calls fire before the
  // submitting state flush, causing duplicate history entries.
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

  useEffect(() => {
    setShownAt(Date.now());
  }, [pair?.pair_id]);

  const excludeIds = useMemo(() => history.map((e) => e.pair.pair_id), [history]);
  const hasPrev = idx > 0;
  const atEnd = idx >= history.length - 1;

  const choose = useCallback(
    async (c: Choice) => {
      if (!pair || busyRef.current) return;
      busyRef.current = true;
      setSubmitting(true);
      try {
        const next = await submitLabel(
          pair.pair_id,
          c,
          Date.now() - shownAt,
          excludeIds
        );
        // Mark this pair as chosen in history
        setHistory((h) => h.map((e, i) => (i === idx ? { ...e, myChoice: c } : e)));
        if (atEnd) {
          if (next) {
            // Defense in depth: never append a pair that's already in history.
            setHistory((h) =>
              h.some((e) => e.pair.pair_id === next.pair_id)
                ? h
                : [...h, { pair: next, myChoice: null }]
            );
            setIdx((i) =>
              history.some((e) => e.pair.pair_id === next.pair_id) ? i : i + 1
            );
          }
          // else: no more pairs; stay on this one
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
    [pair, shownAt, excludeIds, atEnd, idx, history]
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
        // Defense in depth: dedupe in case excludeIds was stale.
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
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === " ") {
        e.preventDefault();
        if (leftRef.current?.paused) playBoth();
        else pauseBoth();
      } else if (e.key === "r") restart();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chooseSide, choose, goPrev, goNext, playBoth, pauseBoth, restart]);

  if (!pair || !layout) {
    return (
      <div className="flex-1 flex items-center justify-center text-center px-4">
        <div>
          <h2 className="text-2xl font-semibold mb-2">All done</h2>
          <p className="text-neutral-400">
            No more pairs to label. Thanks!
          </p>
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
      <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
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
                controls
                loop
                playsInline
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
                {isPicked ? "✓ " : ""}
                Pick {side === "left" ? "Option 1" : "Option 2"} (
                {side === "left" ? "1" : "2"})
              </button>
            </div>
          );
        })}
      </div>

      <div className="text-center text-xs text-neutral-500 mt-3">
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

      <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
        <button
          onClick={goPrev}
          disabled={!hasPrev || submitting}
          className="px-3 py-2 rounded border border-neutral-700 hover:bg-neutral-900 disabled:opacity-30"
        >
          ← Previous (←)
        </button>
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
          className={`px-3 py-2 rounded border disabled:opacity-50 ${
            myChoice === "tie"
              ? "border-green-500 bg-green-900/30"
              : "border-neutral-700 hover:bg-neutral-900"
          }`}
        >
          {myChoice === "tie" ? "✓ " : ""}Tie (3)
        </button>
        <button
          onClick={() => choose("bad")}
          disabled={submitting}
          className={`px-3 py-2 rounded border disabled:opacity-50 ${
            myChoice === "bad"
              ? "border-green-500 bg-green-900/30"
              : "border-neutral-700 hover:bg-neutral-900"
          }`}
        >
          {myChoice === "bad" ? "✓ " : ""}Both bad (4)
        </button>
        <button
          onClick={goNext}
          disabled={submitting}
          className="px-3 py-2 rounded border border-neutral-700 hover:bg-neutral-900 disabled:opacity-50"
        >
          {atEnd ? "Skip / Next" : "Next"} → (→)
        </button>
      </div>
    </div>
  );
}
