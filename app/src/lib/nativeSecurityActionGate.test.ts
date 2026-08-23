import { describe, expect, it, vi } from "vitest";
import { createNativeSecurityActionGate } from "./nativeSecurityActionGate";

describe("native security action gate", () => {
  it("rejects a second biometric setup tap until the first attempt finishes", async () => {
    const gate = createNativeSecurityActionGate();
    const save = vi.fn<() => Promise<void>>(async () => {});
    const run = async () => {
      if (!gate.enter()) return false;
      try {
        await save();
        return true;
      } finally {
        gate.leave();
      }
    };
    let release!: () => void;
    save.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    const first = run();
    expect(await run()).toBe(false);
    expect(save).toHaveBeenCalledTimes(1);
    release();
    expect(await first).toBe(true);
    expect(await run()).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
  });
});
