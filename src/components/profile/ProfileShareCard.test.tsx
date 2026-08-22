import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfileShareCard } from "./ProfileShareCard";
import type { ProfileShareCardProfile } from "@/lib/profileShareCardData";

const useProfileShareCard = vi.fn();

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ session: { user: { id: "viewer" } } }),
}));
vi.mock("@/lib/profileShareCard", () => ({
  useProfileShareCard: (...args: unknown[]) => useProfileShareCard(...args),
}));
vi.mock("@/components/ui/GlassModal", () => ({
  GlassModal: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div role="dialog">{children}</div> : null,
}));
vi.mock("@/components/ui/GlassSheet", () => ({
  GlassSheet: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div role="dialog">{children}</div> : null,
}));

const profile: ProfileShareCardProfile = {
  id: "member-1",
  display_name: "Alex Morgan",
  social_id: "alex",
  avatar_url: "https://example.test/alex.jpg",
  verified: true,
  tier: "huddle＊",
  member_since: "2024-01-01T00:00:00.000Z",
  roles: ["Pet Parent", "Volunteer"],
  engagement_tier: "pillar",
  experience_years: 4,
  pet_experience: ["Dogs"],
  groups_count: 8,
  friends_count: 21,
  member_number: 42,
  pets: [{ name: "Milo", species: "Dog", photo_url: null }],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ProfileShareCard safety contract", () => {
  it("keeps an under-18 profile identity-only and non-flippable", () => {
    useProfileShareCard.mockReturnValue({
      data: { profile, restricted: true },
      loading: false,
      failed: false,
    });

    render(<ProfileShareCard profileId={profile.id} onClose={vi.fn()} />);

    expect(screen.getByText("Alex Morgan")).toBeInTheDocument();
    expect(screen.getByText("@alex")).toBeInTheDocument();
    expect(screen.getByText("Sign in to view")).toBeInTheDocument();
    expect(screen.queryByText("Pet Parent · Volunteer")).toBeNull();
    expect(screen.queryByText("Loyal Member")).toBeNull();
    expect(screen.queryByText(/8 groups/i)).toBeNull();
    expect(screen.queryByText(/21 friends/i)).toBeNull();
    expect(screen.queryByText("Milo")).toBeNull();
    expect(screen.queryByRole("button", { name: "Show pets" })).toBeNull();
    expect(screen.queryByText("Tap the card to flip")).toBeNull();
  });

  it("keeps the adult app-parity card flippable without instructional copy", () => {
    useProfileShareCard.mockReturnValue({
      data: { profile, restricted: false },
      loading: false,
      failed: false,
    });

    render(<ProfileShareCard profileId={profile.id} onClose={vi.fn()} />);

    const card = screen.getByRole("button", { name: "Show pets" });
    expect(screen.queryByText("Tap the card to flip")).toBeNull();
    fireEvent.click(card);
    expect(card).toHaveAttribute("aria-label", "Show profile");
    expect(card).toHaveAttribute("data-flipped", "true");
  });

  it("mirrors the native identity face when the profile has no pets", () => {
    useProfileShareCard.mockReturnValue({
      data: { profile: { ...profile, pets: [] }, restricted: false },
      loading: false,
      failed: false,
    });

    render(<ProfileShareCard profileId={profile.id} onClose={vi.fn()} />);

    expect(screen.queryByText("No companions yet.")).toBeNull();
    expect(screen.getAllByText("Alex Morgan")).toHaveLength(2);
  });
});
