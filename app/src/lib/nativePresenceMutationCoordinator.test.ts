import { afterEach, describe, expect, it } from "vitest";
import {
  beginNativePresenceIntent,
  enqueueNativePresenceMutation,
  isCurrentNativePresenceIntent,
  resetNativePresenceMutationCoordinatorForTests,
} from "./nativePresenceMutationCoordinator";

describe("native presence mutation coordinator", () => {
  afterEach(() => resetNativePresenceMutationCoordinatorForTests());

  it("makes a later Back intent supersede an unresolved Home Out request", async () => {
    const out = beginNativePresenceIntent("viewer", "active");
    const back = beginNativePresenceIntent("viewer", "inactive");
    const writes: string[] = [];

    await enqueueNativePresenceMutation(out, async () => writes.push("out"));
    await enqueueNativePresenceMutation(back, async () => writes.push("back"));

    expect(isCurrentNativePresenceIntent(out)).toBe(false);
    expect(isCurrentNativePresenceIntent(back)).toBe(true);
    expect(writes).toEqual(["back"]);
  });

  it("orders an already-dispatched pin before the later terminal unpin", async () => {
    const out = beginNativePresenceIntent("viewer", "active");
    const writes: string[] = [];
    let releaseOut!: () => void;
    const outWrite = enqueueNativePresenceMutation(out, () => new Promise<void>((resolve) => {
      releaseOut = () => {
        writes.push("out");
        resolve();
      };
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const unpin = beginNativePresenceIntent("viewer", "inactive");
    const unpinWrite = enqueueNativePresenceMutation(unpin, async () => writes.push("unpin"));
    releaseOut();
    await Promise.all([outWrite, unpinWrite]);

    expect(writes).toEqual(["out", "unpin"]);
    expect(isCurrentNativePresenceIntent(unpin)).toBe(true);
  });

  it("skips a stale Map style write after an explicit terminal choice", async () => {
    const style = beginNativePresenceIntent("viewer", "active");
    const terminal = beginNativePresenceIntent("viewer", "inactive");
    const writes: string[] = [];

    await enqueueNativePresenceMutation(style, async () => writes.push("style"));
    await enqueueNativePresenceMutation(terminal, async () => writes.push("terminal"));

    expect(writes).toEqual(["terminal"]);
  });
});
