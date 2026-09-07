import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePolling } from "../../hooks/usePolling";

describe("usePolling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls the callback on each interval tick while visible and enabled", () => {
    const callback = vi.fn();
    renderHook(() => usePolling(callback, 1000, true));

    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(callback).toHaveBeenCalledTimes(3);
  });

  it("does not poll when disabled", () => {
    const callback = vi.fn();
    renderHook(() => usePolling(callback, 1000, false));

    vi.advanceTimersByTime(5000);
    expect(callback).not.toHaveBeenCalled();
  });

  it("skips ticks while the document is hidden", () => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    const callback = vi.fn();
    renderHook(() => usePolling(callback, 1000, true));

    vi.advanceTimersByTime(3000);
    expect(callback).not.toHaveBeenCalled();
  });

  it("clears the interval on unmount", () => {
    const callback = vi.fn();
    const { unmount } = renderHook(() => usePolling(callback, 1000, true));
    unmount();
    vi.advanceTimersByTime(5000);
    expect(callback).not.toHaveBeenCalled();
  });

  it("uses the latest callback without resetting the interval", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => usePolling(cb, 1000, true), {
      initialProps: { cb: first }
    });

    vi.advanceTimersByTime(1000);
    expect(first).toHaveBeenCalledTimes(1);

    rerender({ cb: second });
    vi.advanceTimersByTime(1000);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
  });
});
