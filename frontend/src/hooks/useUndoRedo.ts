import { useCallback, useRef, useState } from "react";

export function useUndoRedo<T>(initial: T) {
  const [state, setState] = useState<T>(initial);
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);

  const set = useCallback((next: T | ((prev: T) => T)) => {
    setState((prev) => {
      const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
      past.current.push(prev);
      future.current = [];
      return resolved;
    });
  }, []);

  const undo = useCallback(() => {
    if (!past.current.length) return;
    setState((current) => {
      const prev = past.current.pop()!;
      future.current.unshift(current);
      return prev;
    });
  }, []);

  const redo = useCallback(() => {
    if (!future.current.length) return;
    setState((current) => {
      const next = future.current.shift()!;
      past.current.push(current);
      return next;
    });
  }, []);

  const reset = useCallback((value: T) => {
    past.current = [];
    future.current = [];
    setState(value);
  }, []);

  return {
    state,
    set,
    undo,
    redo,
    reset,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
