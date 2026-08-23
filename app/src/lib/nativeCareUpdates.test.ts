import { describe, expect, it } from "vitest";
import { requiredCareUpdateActionLabel } from "./careUpdateAction";

describe("required Care update action labels", () => {
  it("names each requested update explicitly and shows submitted/required progress", () => {
    expect(requiredCareUpdateActionLabel("photo_note", 0, 3)).toBe("Share a photo + summary update (0/3)");
    expect(requiredCareUpdateActionLabel("photo", 1, 2)).toBe("Share a photo update (1/2)");
    expect(requiredCareUpdateActionLabel("summary", 0, 1)).toBe("Share a care summary (0/1)");
  });

  it("keeps progress within a valid visible range", () => {
    expect(requiredCareUpdateActionLabel("photo", -3, 0)).toBe("Share a photo update (0/1)");
    expect(requiredCareUpdateActionLabel("summary", 5, 2)).toBe("Share a care summary (2/2)");
  });
});
