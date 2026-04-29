import { useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import { BriefcaseBusiness, CakeSlice, GraduationCap, Heart, Languages, MapPin, Ruler, UserRound } from "lucide-react";
import { normalizeProfilePhotos, resolveProfilePhotoDisplayUrl } from "@/lib/profilePhotos";
import type { ProfilePhotoSlot, ProfilePhotos } from "@/types/profilePhotos";
import { ProfileAdaptivePlate } from "@/components/profile/sections/ProfileAdaptivePlate";
import { ProfileColophon } from "@/components/profile/sections/ProfileColophon";
import { ProfileHero } from "@/components/profile/sections/ProfileHero";
import { ProfilePack } from "@/components/profile/sections/ProfilePack";
import { ProfilePlate } from "@/components/profile/sections/ProfilePlate";
import { ProfilePullQuote } from "@/components/profile/sections/ProfilePullQuote";
import { ProfileVitals } from "@/components/profile/sections/ProfileVitals";

type EditorialPublicProfileViewProps = {
  displayName: string;
  bio: string;
  memberSince?: string | null;
  memberNumber?: number | null;
  membershipTier?: string | null;
  availabilityStatus: string[];
  isVerified: boolean;
  hasCar: boolean;
  photoUrl: string | null;
  dob: string;
  gender: string;
  orientation: string;
  height: string;
  petExperience: string[];
  experienceYears: string;
  relationshipStatus: string;
  degree: string;
  school: string;
  major: string;
  occupation: string;
  affiliation: string;
  locationName: string;
  languages: string[];
  socialAlbum: string[];
  photos?: ProfilePhotos | null;
  petHeads: Array<{
    id: string;
    species?: string | null;
    photoUrl?: string | null;
    name?: string | null;
    isPublic?: boolean | null;
    dob?: string | null;
  }>;
  onPetClick?: (petId: string, isPublic: boolean) => void;
  visibility: {
    show_bio: boolean;
    show_height: boolean;
    show_orientation: boolean;
    show_academic: boolean;
    show_occupation: boolean;
    show_affiliation: boolean;
    show_relationship_status: boolean;
    show_languages?: boolean;
  };
};

const computeAge = (dob: string) => {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age >= 0 ? age : null;
};

const formatLocation = (value: string) => {
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  return parts[0] || "";
};

const joinValues = (values: string[], separator = " · ") =>
  values.map((value) => value.trim()).filter(Boolean).join(separator);

export function EditorialPublicProfileView(props: EditorialPublicProfileViewProps) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [resolvedPhotoUrls, setResolvedPhotoUrls] = useState<Record<ProfilePhotoSlot, string | null>>({
    cover: null,
    establishing: null,
    pack: null,
    solo: null,
    closer: null,
  });
  const age = computeAge(props.dob);
  const photos = useMemo(
    () => normalizeProfilePhotos(props.photos, {
      avatarUrl: props.photoUrl,
      socialAlbum: props.socialAlbum,
    }),
    [props.photoUrl, props.photos, props.socialAlbum],
  );
  const normalizedAvailability = props.availabilityStatus.map((item) => {
    const value = String(item || "").trim();
    if (value === "Vet") return "Veterinarian";
    if (/^animal friend\s*\(no pet\)$/i.test(value)) return "Animal Friend";
    return value;
  });
  const locationValue = formatLocation(props.locationName);
  const roleLabels = normalizedAvailability.filter(Boolean);
  const education = joinValues([props.degree, props.major, props.school]);
  const vitalsRows = [
    age != null ? { label: "Age", value: String(age), Icon: CakeSlice } : null,
    locationValue ? { label: "Location", value: locationValue, Icon: MapPin } : null,
    props.visibility.show_height && props.height.trim() ? { label: "Height", value: `${props.height} cm`, Icon: Ruler } : null,
    props.gender.trim() ? { label: "Gender", value: props.gender, Icon: UserRound } : null,
    props.visibility.show_orientation && props.orientation.trim() ? { label: "Orientation", value: props.orientation, Icon: Heart } : null,
    props.visibility.show_academic && education ? { label: "Education", value: education, Icon: GraduationCap } : null,
    props.visibility.show_occupation && props.occupation.trim() ? { label: "Works at", value: props.occupation, Icon: BriefcaseBusiness } : null,
    props.visibility.show_affiliation && props.affiliation.trim() ? { label: "AFFILIATION", value: props.affiliation } : null,
    (props.visibility.show_languages ?? true) && props.languages.length
      ? { label: "Speaks", value: props.languages.join(", "), Icon: Languages }
      : null,
    props.visibility.show_relationship_status && props.relationshipStatus.trim()
      ? { label: "Relationship", value: props.relationshipStatus, Icon: Heart }
      : null,
  ].filter(Boolean) as Array<{ label: string; value: string; Icon?: ComponentType<{ className?: string; strokeWidth?: number }> }>;

  useEffect(() => {
    let cancelled = false;
    const resolvePhotos = async () => {
      const entries = await Promise.all(
        (["cover", "establishing", "pack", "solo", "closer"] as const).map(async (slot) => {
          const resolved = await resolveProfilePhotoDisplayUrl(photos[slot]);
          return [slot, resolved] as const;
        }),
      );
      if (cancelled) return;
      setResolvedPhotoUrls({
        cover: entries.find(([slot]) => slot === "cover")?.[1] ?? null,
        establishing: entries.find(([slot]) => slot === "establishing")?.[1] ?? null,
        pack: entries.find(([slot]) => slot === "pack")?.[1] ?? null,
        solo: entries.find(([slot]) => slot === "solo")?.[1] ?? null,
        closer: entries.find(([slot]) => slot === "closer")?.[1] ?? null,
      });
    };
    void resolvePhotos();
    return () => {
      cancelled = true;
    };
  }, [photos]);

  return (
    <div className="overflow-hidden rounded-t-[var(--radius-3xl,28px)] bg-[var(--bg-canvas,#fff)]">
      <ProfileHero
        src={resolvedPhotoUrls.cover}
        name={props.displayName}
        roleLabels={roleLabels}
        membershipTier={props.membershipTier}
        caption={photos.cover_caption}
        isVerified={props.isVerified}
      />
      {props.visibility.show_bio ? <ProfilePullQuote bio={props.bio} /> : null}
      <ProfilePlate src={resolvedPhotoUrls.establishing} aspect="4/5" caption={photos.establishing_caption} alt={`${props.displayName || "Profile"} photo`} onClick={setLightboxSrc} />
      <ProfilePack pets={props.petHeads} displayName={props.displayName} experienceYears={props.experienceYears} petExperience={props.petExperience} onPetClick={props.onPetClick} />
      <ProfilePlate src={resolvedPhotoUrls.pack} aspect="3/2" caption={photos.pack_caption} alt={`${props.displayName || "Profile"} with pets`} onClick={setLightboxSrc} />
      <ProfileVitals rows={vitalsRows} />
      <ProfileAdaptivePlate src={resolvedPhotoUrls.solo} aspect={photos.solo_aspect ?? "4:5"} caption={photos.solo_caption} alt={`${props.displayName || "Profile"} solo photo`} onClick={setLightboxSrc} />
      <ProfilePlate src={resolvedPhotoUrls.closer} aspect="4/5" caption={photos.closer_caption} alt={`${props.displayName || "Profile"} final photo`} onClick={setLightboxSrc} />
      <ProfileColophon memberSince={props.memberSince} memberNumber={props.memberNumber} />
      {lightboxSrc ? (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/70 p-4" onClick={() => setLightboxSrc(null)}>
          <img src={lightboxSrc} alt="" className="max-h-[80svh] max-w-full object-contain" onError={() => setLightboxSrc(null)} />
        </div>
      ) : null}
    </div>
  );
}
