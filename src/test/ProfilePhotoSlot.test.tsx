import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfilePhotoSlot } from "@/components/profile/edit/ProfilePhotoSlot";

const uploadProfilePhotoBlob = vi.fn();
const validateProfilePhotoFile = vi.fn();

vi.mock("@/lib/profilePhotos", () => ({
  resolveProfilePhotoDisplayUrl: vi.fn(async (value: string | null) => value),
  uploadProfilePhotoBlob: (...args: unknown[]) => uploadProfilePhotoBlob(...args),
  validateProfilePhotoFile: (...args: unknown[]) => validateProfilePhotoFile(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/components/profile/edit/ProfilePhotoCropper", () => ({
  ProfilePhotoCropper: ({
    file,
    onSave,
  }: {
    file: File | null;
    onSave: (blob: Blob, soloAspect: null) => Promise<void>;
  }) => (
    file ? (
      <button type="button" onClick={() => void onSave(new Blob(["image"], { type: "image/webp" }), null)}>
        Save crop
      </button>
    ) : null
  ),
}));

const makeImageFile = () => new File(["image"], "profile.png", { type: "image/png" });

describe("ProfilePhotoSlot upload flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateProfilePhotoFile.mockReturnValue(null);
    uploadProfilePhotoBlob.mockResolvedValue("profile_photos/user-1/cover-123.webp");
  });

  it("adds a photo from an empty slot and reports the uploaded storage path", async () => {
    const onUploaded = vi.fn();
    const { container } = render(
      <ProfilePhotoSlot
        slot="cover"
        value={null}
        userId="user-1"
        soloAspect={null}
        onUploaded={onUploaded}
        onRemoved={vi.fn()}
      />,
    );

    const input = container.querySelector<HTMLInputElement>("input[type='file']");
    expect(input).not.toBeNull();
    expect(input).toHaveClass("absolute", "inset-0", "opacity-0");
    fireEvent.change(input!, { target: { files: [makeImageFile()] } });

    fireEvent.click(screen.getByRole("button", { name: "Save crop" }));

    await waitFor(() => {
      expect(uploadProfilePhotoBlob).toHaveBeenCalledWith("user-1", "cover", expect.any(Blob));
      expect(onUploaded).toHaveBeenCalledWith("cover", "profile_photos/user-1/cover-123.webp", null, null);
    });
  });

  it("keeps replace photo wired to the native file input, then uploads the replacement", async () => {
    const onUploaded = vi.fn();
    const { container } = render(
      <ProfilePhotoSlot
        slot="cover"
        value="Profiles/user-1/cover-old.webp"
        userId="user-1"
        soloAspect={null}
        onUploaded={onUploaded}
        onRemoved={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Main photo, photo options" }));

    const replaceLabel = screen.getByText("Replace photo").closest("label");
    const input = replaceLabel?.querySelector<HTMLInputElement>("input[type='file']");
    expect(input).not.toBeNull();
    expect(input).toHaveClass("absolute", "inset-0", "opacity-0");

    fireEvent.change(input!, { target: { files: [makeImageFile()] } });
    fireEvent.click(screen.getByRole("button", { name: "Save crop" }));

    await waitFor(() => {
      expect(uploadProfilePhotoBlob).toHaveBeenCalledWith("user-1", "cover", expect.any(Blob));
      expect(onUploaded).toHaveBeenCalledWith(
        "cover",
        "profile_photos/user-1/cover-123.webp",
        null,
        "Profiles/user-1/cover-old.webp",
      );
    });
  });

  it("commits the current caption text on blur", async () => {
    const onCaptionChange = vi.fn();
    const onCaptionCommit = vi.fn();
    const { container } = render(
      <ProfilePhotoSlot
        slot="pack"
        value="Profiles/user-1/pack-old.webp"
        userId="user-1"
        soloAspect={null}
        captionValue="old caption"
        onCaptionChange={onCaptionChange}
        onCaptionCommit={onCaptionCommit}
        onUploaded={vi.fn()}
        onRemoved={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector("img")?.getAttribute("src")).toBe("Profiles/user-1/pack-old.webp");
    });

    const caption = screen.getByRole("textbox", { name: "You and your pet note" });
    fireEvent.change(caption, { target: { value: "new park caption" } });
    fireEvent.blur(caption);

    expect(onCaptionChange).toHaveBeenLastCalledWith("new park caption");
    expect(onCaptionCommit).toHaveBeenLastCalledWith("new park caption");
  });
});
