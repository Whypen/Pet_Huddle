import type { ProfilePhotos } from "@/types/profilePhotos";
import { EditorialPublicProfileView } from "@/components/profile/EditorialPublicProfileView";
import { LegacyPublicProfileView } from "@/components/profile/LegacyPublicProfileView";

type PublicProfileViewProps = {
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
  socialAlbumUrls: Record<string, string>;
  editorialEnabled?: boolean;
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
    show_age: boolean;
    show_gender: boolean;
    show_orientation: boolean;
    show_height: boolean;
    show_relationship_status: boolean;
    show_academic: boolean;
    show_occupation: boolean;
    show_affiliation: boolean;
    show_bio: boolean;
    show_languages?: boolean;
    show_location?: boolean;
  };
};

export const PublicProfileView = (props: PublicProfileViewProps) => {
  return props.editorialEnabled
    ? <EditorialPublicProfileView {...props} />
    : <LegacyPublicProfileView {...props} />;
};
