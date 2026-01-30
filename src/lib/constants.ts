// Master Species List - used across Pet Setup, Social Filters, and User Profile
export const SPECIES_LIST = [
  "Dog",
  "Cat", 
  "Bird",
  "Rabbit",
  "Reptile",
  "Hamster",
  "Others"
] as const;

export type SpeciesType = typeof SPECIES_LIST[number];

// Breed options by species
export const BREED_OPTIONS: Record<string, string[]> = {
  Dog: [
    "Labrador Retriever", "German Shepherd", "Golden Retriever", "French Bulldog",
    "Bulldog", "Poodle", "Beagle", "Rottweiler", "Yorkshire Terrier", "Boxer",
    "Dachshund", "Siberian Husky", "Corgi", "Shih Tzu", "Mixed Breed", "Other"
  ],
  Cat: [
    "Persian", "Maine Coon", "Ragdoll", "British Shorthair", "Siamese",
    "Bengal", "Abyssinian", "Scottish Fold", "Sphynx", "Russian Blue",
    "Norwegian Forest", "Birman", "Mixed Breed", "Other"
  ],
  Bird: [
    "Parakeet", "Cockatiel", "Lovebird", "Finch", "Canary", "Parrot",
    "Macaw", "Cockatoo", "Conure", "Other"
  ],
  Rabbit: [
    "Holland Lop", "Mini Rex", "Netherland Dwarf", "Lionhead", "Flemish Giant",
    "English Angora", "Dutch", "Mini Lop", "Mixed Breed", "Other"
  ],
  Reptile: [
    "Bearded Dragon", "Leopard Gecko", "Ball Python", "Corn Snake", "Red-Eared Slider",
    "Chameleon", "Blue-Tongued Skink", "Crested Gecko", "Other"
  ],
  Hamster: [
    "Syrian", "Dwarf Campbell", "Dwarf Winter White", "Roborovski", "Chinese", "Other"
  ],
  Others: []
};

// Mapbox access token
export const MAPBOX_ACCESS_TOKEN = "pk.eyJ1Ijoid2h5cGVuIiwiYSI6ImNtbDBoZjc0eTBjZTYzY3F6NWVpaGhraDIifQ.tqcBbY-IyuMI-0aIGRdSMA";

// Vaccination options
export const VACCINATION_OPTIONS = [
  "Rabies", "Distemper", "Parvovirus", "Hepatitis", "Bordetella",
  "Lyme Disease", "Feline Leukemia", "FVRCP", "Parainfluenza"
];

// Temperament options
export const TEMPERAMENT_OPTIONS = [
  "Friendly", "Playful", "Calm", "Energetic", "Shy", "Protective",
  "Curious", "Independent", "Affectionate", "Anxious", "Aggressive"
];
