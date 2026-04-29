import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProfileHero } from "@/components/profile/sections/ProfileHero";
import { ProfilePack } from "@/components/profile/sections/ProfilePack";
import { ProfilePlate } from "@/components/profile/sections/ProfilePlate";
import { ProfilePullQuote } from "@/components/profile/sections/ProfilePullQuote";
import { ProfileVitals } from "@/components/profile/sections/ProfileVitals";

describe("profile editorial sections", () => {
  it("renders the hero with uppercase name, a single role pill, membership tier, and no age text", () => {
    render(
      <ProfileHero
        src="/cover.jpg"
        name="Hyphen Fong"
        roleLabels={["Pet Parent", "Volunteer"]}
        membershipTier="gold"
        isVerified
      />,
    );

    expect(screen.getByRole("img", { name: "Hyphen Fong" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hyphen Fong" })).toHaveClass("uppercase");
    expect(screen.getByText("Pet Parent · Volunteer")).toHaveClass("truncate");
    expect(screen.getByText("Gold")).toBeInTheDocument();
    expect(screen.queryByText("37")).not.toBeInTheDocument();
  });

  it("omits empty pull quotes and renders written bios in the smaller editorial style", () => {
    const { container, rerender } = render(<ProfilePullQuote bio="   " />);
    expect(container).toBeEmptyDOMElement();

    rerender(<ProfilePullQuote bio="I care for three cats." />);
    expect(screen.getByText("I care for three cats.")).toHaveClass("italic");
  });

  it("omits empty plates and opens the lightbox source from populated plates", () => {
    const onClick = vi.fn();
    const { container, rerender } = render(
      <ProfilePlate src={null} aspect="4/5" alt="Missing profile photo" onClick={onClick} />,
    );
    expect(container).toBeEmptyDOMElement();

    rerender(
      <ProfilePlate
        src="/park.jpg"
        aspect="3/2"
        caption="Brunswick Park"
        alt="Profile at the park"
        onClick={onClick}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Profile at the park" }));
    expect(onClick).toHaveBeenCalledWith("/park.jpg");
    expect(screen.getByText("Brunswick Park")).toBeInTheDocument();
  });

  it("renders key info rows and removes the section when there is nothing to show", () => {
    const { container, rerender } = render(<ProfileVitals rows={[]} />);
    expect(container).toBeEmptyDOMElement();

    rerender(
      <ProfileVitals
        rows={[
          { label: "Social role", value: "Pet Parent, Volunteer" },
          { label: "Age", value: "37" },
          { label: "Location", value: "Central and Western" },
          { label: "Speaks", value: "English, Cantonese, Mandarin" },
        ]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Key info" })).toBeInTheDocument();
    expect(screen.getByText("Pet Parent, Volunteer")).toBeInTheDocument();
    expect(screen.getByText("37")).toBeInTheDocument();
    expect(screen.getByText("Central and Western")).toBeInTheDocument();
    expect(screen.getByText("English, Cantonese, Mandarin")).toBeInTheDocument();
  });

  it("renders pack pets as a horizontal set with species and age captions", () => {
    const onPetClick = vi.fn();
    render(
      <ProfilePack
        displayName="Hyphen"
        experienceYears="12"
        petExperience={["Cats"]}
        onPetClick={onPetClick}
        pets={[
          {
            id: "pet-1",
            name: "Meemaw",
            species: "cat",
            dob: "2015-04-01",
            photoUrl: "/cat.jpg",
            isPublic: true,
          },
          {
            id: "pet-2",
            name: "Private cat",
            species: "cat",
            dob: "2020-01-01",
            photoUrl: "/private-cat.jpg",
            isPublic: false,
          },
        ]}
      />,
    );

    expect(screen.getByRole("heading", { name: "The pack" })).toBeInTheDocument();
    expect(screen.getByText("12 YEARS · CATS")).toBeInTheDocument();
    expect(screen.getByText("Meemaw")).toBeInTheDocument();
    expect(screen.getByText(/Cat · \d+/)).toBeInTheDocument();
    expect(screen.getByText("PRIVATE")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Open Meemaw's profile"));
    expect(onPetClick).toHaveBeenCalledWith("pet-1", true);
  });
});
