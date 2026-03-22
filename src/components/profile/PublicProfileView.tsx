import { useEffect, useMemo, useState, type ComponentType } from "react";
import { Briefcase, Cake, Car, Cat, Dog, GraduationCap, Heart, ImageOff, Languages, MapPin, PawPrint, Rabbit, Ruler, ShieldCheck, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

type PublicProfileViewProps = {
  displayName: string;
  bio: string;
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
  petHeads: Array<{
    id: string;
    species?: string | null;
    photoUrl?: string | null;
    name?: string | null;
    isPublic?: boolean | null;
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
  };
};

const speciesIconFor = (species?: string | null) => {
  const key = (species || "").toLowerCase();
  if (key.includes("dog")) return Dog;
  if (key.includes("cat")) return Cat;
  if (key.includes("rabbit")) return Rabbit;
  return PawPrint;
};

const formatSpeciesLabel = (value: string) =>
  value
    .split(/[\s_/-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

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

const publicRows = (props: PublicProfileViewProps) => {
  const rows: Array<{ key: string; icon: ComponentType<{ className?: string }>; value: string }> = [];
  if (props.visibility.show_relationship_status && props.relationshipStatus.trim()) {
    rows.push({ key: "relationship", icon: Heart, value: props.relationshipStatus });
  }
  if (props.visibility.show_academic && (props.degree.trim() || props.school.trim() || props.major.trim())) {
    const edu = [props.degree, props.major, props.school].filter(Boolean).join(" • ");
    rows.push({ key: "education", icon: GraduationCap, value: edu });
  }
  if (props.visibility.show_occupation && props.occupation.trim()) {
    rows.push({ key: "occupation", icon: Briefcase, value: props.occupation });
  }
  if (props.visibility.show_affiliation && props.affiliation.trim()) {
    rows.push({ key: "affiliation", icon: PawPrint, value: props.affiliation });
  }
  if (props.languages.length) {
    rows.push({ key: "languages", icon: Languages, value: props.languages.join(", ") });
  }
  return rows;
};

export const PublicProfileView = (props: PublicProfileViewProps) => {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [brokenAlbumItems, setBrokenAlbumItems] = useState<Set<string>>(new Set());
  const age = computeAge(props.dob);
  const yearsValue = Number(props.experienceYears || 0);
  const hasExperience = Number.isFinite(yearsValue) && yearsValue > 0;
  const normalizedAvailability = props.availabilityStatus.map((item) => {
    const value = String(item || "").trim();
    if (value === "Vet") return "Veterinarian";
    if (/^animal friend\s*\(no pet\)$/i.test(value)) return "Animal Friend";
    return value;
  });
  const compactItems = [
    props.visibility.show_age && age != null ? { key: "age", icon: Cake, value: `${age}` } : null,
    props.visibility.show_gender && props.gender.trim() ? { key: "gender", icon: UserRound, value: props.gender } : null,
    props.visibility.show_orientation && props.orientation.trim() ? { key: "orientation", icon: Heart, value: props.orientation } : null,
    props.visibility.show_height && props.height.trim() ? { key: "height", icon: Ruler, value: `${props.height} cm` } : null,
  ].filter(Boolean) as Array<{ key: string; icon: ComponentType<{ className?: string }>; value: string }>;

  const rows = publicRows(props);
  const availability = normalizedAvailability.join(" • ");
  const albumItems = useMemo(() => props.socialAlbum.slice(0, 9), [props.socialAlbum]);

  useEffect(() => {
    setBrokenAlbumItems(new Set());
  }, [props.socialAlbum, props.socialAlbumUrls]);

  return (
    <div className="space-y-4">
      <section className="relative rounded-2xl overflow-hidden border border-border bg-muted">
        {props.photoUrl ? (
          <img src={props.photoUrl} alt={props.displayName || "Profile"} className="w-full h-auto object-cover" />
        ) : (
          <div className="aspect-[3/4] w-full bg-gradient-to-b from-background to-muted" />
        )}
        <div className="absolute left-4 top-4 z-10 max-w-[70%]">
          <div className="flex items-center gap-2">
            {props.isVerified ? (
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-brandBlue">
                <ShieldCheck className="w-4 h-4" />
              </span>
            ) : null}
            {props.hasCar ? (
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-brandBlue">
                <Car className="w-4 h-4" />
              </span>
            ) : null}
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/60 via-black/35 to-transparent text-white">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-base font-semibold truncate">{props.displayName || "User"}</p>
              {availability ? (
                <p className="text-xs text-white/85 whitespace-normal break-words leading-4">
                  {availability}
                </p>
              ) : null}
            </div>
            <div className="shrink-0" />
          </div>
        </div>
      </section>

      {props.visibility.show_bio && props.bio.trim() ? (
        <section className="rounded-2xl border border-border bg-white p-4">
          <h3 className="text-sm font-semibold text-brandText">About {props.displayName || "User"}</h3>
          <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">{props.bio}</p>
        </section>
      ) : null}

      {compactItems.length ? (
        <section className="rounded-2xl border border-border bg-white p-4">
          <div className={cn("grid gap-2", compactItems.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
            {compactItems.map((item) => (
              <div key={item.key} className="flex items-center gap-2 px-1 py-1 min-w-0">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-muted/70 shrink-0">
                  <item.icon className="w-4 h-4 text-brandText/70" strokeWidth={1.75} />
                </span>
                <span className="text-sm text-brandText whitespace-normal break-words leading-5">{item.value}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {props.petExperience.length || props.experienceYears ? (
        <section className="rounded-2xl border border-border bg-white p-4 space-y-3">
          {props.petHeads.length ? (
            <div className="flex flex-wrap items-center gap-3">
              {props.petHeads.map((pet) => {
                const Icon = speciesIconFor(pet.species);
                return pet.photoUrl ? (
                  <button
                    key={pet.id}
                    type="button"
                    disabled={!pet.isPublic}
                    onClick={() => props.onPetClick?.(pet.id, Boolean(pet.isPublic))}
                    className={cn(
                      "inline-flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-border bg-muted/60",
                      pet.isPublic ? "cursor-pointer" : "cursor-not-allowed"
                    )}
                    title={pet.name || pet.species || "Pet"}
                  >
                    <img src={pet.photoUrl} alt={pet.name || "Pet"} className="h-full w-full object-cover" />
                  </button>
                ) : (
                  <button
                    key={pet.id}
                    type="button"
                    disabled={!pet.isPublic}
                    onClick={() => props.onPetClick?.(pet.id, Boolean(pet.isPublic))}
                    className={cn(
                      "inline-flex h-16 w-16 items-center justify-center rounded-full border border-border bg-muted/70",
                      pet.isPublic ? "cursor-pointer" : "cursor-not-allowed"
                    )}
                    title={pet.name || pet.species || "Pet"}
                  >
                    <Icon className="h-7 w-7 text-brandText/70" strokeWidth={1.75} />
                  </button>
                );
              })}
            </div>
          ) : null}
          {hasExperience ? (
            <h3 className="text-sm font-semibold text-brandText">
              {`${yearsValue} ${yearsValue <= 1 ? "year" : "years"} of experience with:`}
            </h3>
          ) : (
            <p className="text-sm text-muted-foreground">
              {`${props.displayName || "This user"} is a first-time pet enthusiast and ready to begin their pet journey! 💫`}
            </p>
          )}
          {props.petExperience.length ? (
            <div className="flex flex-wrap gap-2">
              {props.petExperience.map((item) => (
                <span key={item} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-3 py-1 text-xs text-brandText">
                  <PawPrint className="w-3.5 h-3.5 text-brandText/70" strokeWidth={1.75} />
                  {formatSpeciesLabel(item)}
                </span>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {rows.length ? (
        <section className="rounded-2xl border border-border bg-white divide-y divide-border/70">
          {rows.map((row) => (
            <div key={row.key} className="flex items-center gap-3 px-4 py-4">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted/70 shrink-0">
                <row.icon className="w-4 h-4 text-brandText/70" strokeWidth={1.75} />
              </span>
              <span className="text-sm text-brandText">{row.value}</span>
            </div>
          ))}
        </section>
      ) : null}

      {albumItems.length ? (
        <section className="w-full min-w-0 rounded-2xl border border-border bg-white p-4 space-y-3">
          <h3 className="text-sm font-semibold text-brandText">Social Album</h3>
          <div className="grid grid-cols-3 gap-2">
            {albumItems.map((path, index) => {
              const isBroken = brokenAlbumItems.has(path);
              return (
              <button
                key={`${path || "album-item"}-${index}`}
                type="button"
                onClick={() => {
                  if (isBroken) return;
                  setLightboxSrc(props.socialAlbumUrls[path] || path);
                }}
                className="aspect-square w-full overflow-hidden rounded-xl border border-border bg-muted"
              >
                {isBroken ? (
                  <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
                    <ImageOff className="h-4 w-4" />
                    <span className="text-[10px]">Unavailable</span>
                  </span>
                ) : (
                  <img
                    src={props.socialAlbumUrls[path] || path}
                    alt=""
                    className="aspect-square w-full object-cover"
                    onError={() => {
                      setBrokenAlbumItems((prev) => {
                        if (prev.has(path)) return prev;
                        const next = new Set(prev);
                        next.add(path);
                        return next;
                      });
                    }}
                  />
                )}
              </button>
            );
            })}
          </div>
        </section>
      ) : null}
      {lightboxSrc ? (
        <div
          className="fixed inset-0 z-[3000] bg-black/70 flex items-center justify-center p-4"
          onClick={() => setLightboxSrc(null)}
        >
          <img
            src={lightboxSrc}
            alt=""
            className="max-h-[80svh] max-w-full rounded-2xl object-contain"
            onError={() => setLightboxSrc(null)}
          />
        </div>
      ) : null}
    </div>
  );
};
