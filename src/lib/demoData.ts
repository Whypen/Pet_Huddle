// 10 Demo Users for Testing with comprehensive data

export interface DemoUser {
  id: string;
  name: string;
  age: number;
  role: "nannies" | "playdates" | "animal-lovers";
  bio: string;
  education?: string;
  degree?: string;
  height?: number;
  occupation?: string;
  isVerified: boolean;
  hasCar: boolean;
  isPremium: boolean;
  gender: string;
  orientation?: string;
  languages: string[];
  petExperience: string[];
  experienceYears: number;
  relationshipStatus?: string;
  avatarUrl?: string;
  location: { lat: number; lng: number };
  locationName: string;
  isOnline: boolean;
  pets: Array<{
    id: string;
    name: string;
    species: string;
    breed?: string;
    photoUrl?: string;
    age?: number;
  }>;
}

export interface DemoAlert {
  id: string;
  type: "Stray" | "Lost" | "Found" | "Others";
  description: string;
  latitude: number;
  longitude: number;
  photoUrl?: string;
  supportCount: number;
  reportCount: number;
  createdAt: string;
  creatorId: string;
  isActive: boolean;
}

// 10 Demo Users with comprehensive data - 2 verified, 3 with car, mix of roles
export const demoUsers: DemoUser[] = [
  {
    id: "demo-user-1",
    name: "Sarah Chen",
    age: 28,
    role: "nannies",
    bio: "Professional pet sitter with 5+ years of experience. Certified in pet first-aid. Available for overnight stays.",
    education: "University of Hong Kong",
    degree: "Bachelor",
    height: 165,
    occupation: "Professional Pet Sitter",
    isVerified: true,
    hasCar: true,
    isPremium: true,
    gender: "Female",
    orientation: "Straight",
    languages: ["English", "Cantonese", "Mandarin"],
    petExperience: ["Dogs", "Cats", "Small Mammals"],
    experienceYears: 5,
    relationshipStatus: "Single",
    avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200",
    location: { lat: 22.2855, lng: 114.1577 },
    locationName: "Central, Hong Kong",
    isOnline: true,
    pets: [
      { id: "pet-1a", name: "Mochi", species: "dog", breed: "Shiba Inu", age: 3 },
    ],
  },
  {
    id: "demo-user-2",
    name: "Marcus Wong",
    age: 32,
    role: "playdates",
    bio: "Software engineer and dog dad. Love hiking with my Golden Retriever. Looking for playdate buddies!",
    education: "HKUST",
    degree: "Master",
    height: 178,
    occupation: "Software Engineer",
    isVerified: false,
    hasCar: true,
    isPremium: false,
    gender: "Male",
    orientation: "Gay/Lesbian",
    languages: ["English", "Cantonese"],
    petExperience: ["Dogs"],
    experienceYears: 4,
    relationshipStatus: "In a relationship",
    avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200",
    location: { lat: 22.2956, lng: 114.1722 },
    locationName: "Wan Chai, Hong Kong",
    isOnline: true,
    pets: [
      { id: "pet-2a", name: "Charlie", species: "dog", breed: "Golden Retriever", age: 4 },
    ],
  },
  {
    id: "demo-user-3",
    name: "Emily Lam",
    age: 25,
    role: "animal-lovers",
    bio: "Animal shelter volunteer. Passionate about rescue animals and adoption advocacy. Let's connect!",
    education: "City University",
    degree: "Bachelor",
    height: 160,
    occupation: "Shelter Volunteer",
    isVerified: true,
    hasCar: false,
    isPremium: false,
    gender: "Female",
    orientation: "Bisexual",
    languages: ["English", "Cantonese", "Mandarin"],
    petExperience: ["Dogs", "Cats", "Birds", "Reptiles"],
    experienceYears: 3,
    relationshipStatus: "Single",
    avatarUrl: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200",
    location: { lat: 22.2783, lng: 114.1747 },
    locationName: "Admiralty, Hong Kong",
    isOnline: false,
    pets: [],
  },
  {
    id: "demo-user-4",
    name: "James Liu",
    age: 35,
    role: "nannies",
    bio: "Nurse with flexible schedule. Certified in pet first-aid. Experienced with senior pets and special needs animals.",
    education: "Queen Mary Hospital School of Nursing",
    degree: "Bachelor",
    height: 175,
    occupation: "Registered Nurse",
    isVerified: true,
    hasCar: true,
    isPremium: true,
    gender: "Male",
    orientation: "Straight",
    languages: ["English", "Cantonese"],
    petExperience: ["Dogs", "Cats"],
    experienceYears: 8,
    relationshipStatus: "Married",
    avatarUrl: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200",
    location: { lat: 22.3193, lng: 114.1694 },
    locationName: "Kowloon, Hong Kong",
    isOnline: true,
    pets: [
      { id: "pet-4a", name: "Whiskers", species: "cat", breed: "British Shorthair", age: 7 },
    ],
  },
  {
    id: "demo-user-5",
    name: "Jessica Ng",
    age: 29,
    role: "playdates",
    bio: "Corgi mom x2! Always looking for Corgi playdate friends. My babies love making new friends.",
    education: "HKU",
    degree: "Master",
    height: 163,
    occupation: "Marketing Manager",
    isVerified: false,
    hasCar: false,
    isPremium: false,
    gender: "Female",
    orientation: "Straight",
    languages: ["English", "Cantonese", "Japanese"],
    petExperience: ["Dogs"],
    experienceYears: 5,
    relationshipStatus: "In a relationship",
    avatarUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200",
    location: { lat: 22.2799, lng: 114.1829 },
    locationName: "Causeway Bay, Hong Kong",
    isOnline: true,
    pets: [
      { id: "pet-5a", name: "Coco", species: "dog", breed: "Corgi", age: 2 },
      { id: "pet-5b", name: "Latte", species: "dog", breed: "Corgi", age: 2 },
    ],
  },
  {
    id: "demo-user-6",
    name: "David Chan",
    age: 45,
    role: "animal-lovers",
    bio: "PhD in Zoology. Bird enthusiast with 20+ years of aviculture experience. Happy to advise on bird care.",
    education: "Stanford University",
    degree: "Doctorate / PhD",
    height: 172,
    occupation: "University Professor",
    isVerified: true,
    hasCar: true,
    isPremium: true,
    gender: "Male",
    orientation: "PNA",
    languages: ["English", "Cantonese", "Mandarin", "French"],
    petExperience: ["Birds", "Fish", "Reptiles"],
    experienceYears: 20,
    relationshipStatus: "Married",
    avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200",
    location: { lat: 22.3364, lng: 114.1747 },
    locationName: "Mong Kok, Hong Kong",
    isOnline: false,
    pets: [
      { id: "pet-6a", name: "Phoenix", species: "bird", breed: "African Grey Parrot", age: 12 },
      { id: "pet-6b", name: "Sunny", species: "bird", breed: "Cockatiel", age: 5 },
    ],
  },
  {
    id: "demo-user-7",
    name: "Amy Tsang",
    age: 31,
    role: "nannies",
    bio: "Professional pet groomer. Can do grooming while pet-sitting! Specializing in small dogs and cats.",
    education: "Pet Grooming Academy",
    degree: "Associate Degree",
    height: 158,
    occupation: "Pet Groomer",
    isVerified: false,
    hasCar: true,
    isPremium: false,
    gender: "Female",
    orientation: "Queer",
    languages: ["Cantonese", "Mandarin"],
    petExperience: ["Dogs", "Cats", "Small Mammals"],
    experienceYears: 7,
    relationshipStatus: "Open relationship",
    avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200",
    location: { lat: 22.3080, lng: 114.2554 },
    locationName: "Tseung Kwan O, Hong Kong",
    isOnline: true,
    pets: [
      { id: "pet-7a", name: "Bella", species: "cat", breed: "Persian", age: 4 },
    ],
  },
  {
    id: "demo-user-8",
    name: "Kevin Ho",
    age: 27,
    role: "playdates",
    bio: "French Bulldog enthusiast! My Frenchie loves beach walks and café hopping. Weekend playdate partners welcome!",
    education: "PolyU",
    degree: "Bachelor",
    height: 180,
    occupation: "Financial Analyst",
    isVerified: false,
    hasCar: false,
    isPremium: false,
    gender: "Male",
    orientation: "Straight",
    languages: ["English", "Cantonese"],
    petExperience: ["Dogs"],
    experienceYears: 3,
    relationshipStatus: "Single",
    avatarUrl: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200",
    location: { lat: 22.2397, lng: 114.1715 },
    locationName: "Aberdeen, Hong Kong",
    isOnline: false,
    pets: [
      { id: "pet-8a", name: "Bruno", species: "dog", breed: "French Bulldog", age: 2 },
    ],
  },
  {
    id: "demo-user-9",
    name: "Michelle Yip",
    age: 24,
    role: "animal-lovers",
    bio: "Cat café regular and foster mom. Specializing in kitten socialization. Currently fostering 3 rescue kittens!",
    education: "Baptist University",
    degree: "Bachelor",
    height: 162,
    occupation: "Graphic Designer",
    isVerified: false,
    hasCar: false,
    isPremium: false,
    gender: "Female",
    orientation: "Straight",
    languages: ["English", "Cantonese"],
    petExperience: ["Cats"],
    experienceYears: 4,
    relationshipStatus: "Single",
    avatarUrl: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200",
    location: { lat: 22.2868, lng: 114.1413 },
    locationName: "Sheung Wan, Hong Kong",
    isOnline: true,
    pets: [
      { id: "pet-9a", name: "Mimi", species: "cat", breed: "Tabby", age: 1 },
      { id: "pet-9b", name: "Kiki", species: "cat", breed: "Calico", age: 1 },
    ],
  },
  {
    id: "demo-user-10",
    name: "Tom Lee",
    age: 55,
    role: "nannies",
    bio: "Retired vet tech with 25 years experience. Can administer medications. Perfect for pets needing extra medical attention.",
    education: "Ontario Veterinary College",
    degree: "Associate Degree",
    height: 170,
    occupation: "Retired Vet Tech",
    isVerified: true,
    hasCar: true,
    isPremium: false,
    gender: "Male",
    orientation: "Straight",
    languages: ["English", "Cantonese", "Mandarin"],
    petExperience: ["Dogs", "Cats", "Birds", "Fish", "Reptiles", "Small Mammals"],
    experienceYears: 25,
    relationshipStatus: "Divorced",
    avatarUrl: "https://images.unsplash.com/photo-1463453091185-61582044d556?w=200",
    location: { lat: 22.3526, lng: 114.1392 },
    locationName: "Sham Shui Po, Hong Kong",
    isOnline: true,
    pets: [
      { id: "pet-10a", name: "Max", species: "dog", breed: "Labrador", age: 10 },
      { id: "pet-10b", name: "Luna", species: "cat", breed: "Maine Coon", age: 6 },
    ],
  },
];

// Demo alerts for map
export const demoAlerts: DemoAlert[] = [
  {
    id: "alert-1",
    type: "Lost",
    description: "Lost golden retriever near Victoria Park. Answers to 'Buddy'. Very friendly. Reward offered!",
    latitude: 22.2820,
    longitude: 114.1880,
    photoUrl: "https://images.unsplash.com/photo-1552053831-71594a27632d?w=400",
    supportCount: 45,
    reportCount: 0,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    creatorId: "demo-user-2",
    isActive: true,
  },
  {
    id: "alert-2",
    type: "Lost",
    description: "Missing tabby cat. Last seen near Sheung Wan MTR. Has a blue collar with name tag 'Mochi'.",
    latitude: 22.2868,
    longitude: 114.1413,
    photoUrl: "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=400",
    supportCount: 28,
    reportCount: 0,
    createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    creatorId: "demo-user-9",
    isActive: true,
  },
  {
    id: "alert-3",
    type: "Stray",
    description: "Friendly stray dog spotted near Central Ferry Pier. Black and white, medium size. Looks well-fed but no collar.",
    latitude: 22.2855,
    longitude: 114.1577,
    photoUrl: "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=400",
    supportCount: 15,
    reportCount: 0,
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    creatorId: "demo-user-1",
    isActive: true,
  },
  {
    id: "alert-4",
    type: "Stray",
    description: "Group of stray cats near Wan Chai Market. About 4-5 cats. Someone has been feeding them regularly.",
    latitude: 22.2780,
    longitude: 114.1730,
    supportCount: 32,
    reportCount: 1,
    createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    creatorId: "demo-user-4",
    isActive: true,
  },
  {
    id: "alert-5",
    type: "Others",
    description: "Injured bird spotted in Kowloon Park. Appears to be a dove with an injured wing. Needs help!",
    latitude: 22.3030,
    longitude: 114.1710,
    supportCount: 12,
    reportCount: 0,
    createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    creatorId: "demo-user-6",
    isActive: true,
  },
];

// Helper functions
export const getVerifiedUsers = () => demoUsers.filter(u => u.isVerified);
export const getUsersWithCar = () => demoUsers.filter(u => u.hasCar);
export const getPremiumUsers = () => demoUsers.filter(u => u.isPremium);
export const getUsersWithPets = () => demoUsers.filter(u => u.pets.length > 0);
export const getOnlineUsers = () => demoUsers.filter(u => u.isOnline);
export const getUsersByRole = (role: DemoUser["role"]) => demoUsers.filter(u => u.role === role);

// Get demo user by ID
export const getDemoUser = (id: string): DemoUser | undefined => {
  return demoUsers.find(user => user.id === id);
};

// Filter demo users by role
export const getDemoUsersByRole = (role: DemoUser["role"]): DemoUser[] => {
  return demoUsers.filter(user => user.role === role);
};

// Get online demo users
export const getOnlineDemoUsers = (): DemoUser[] => {
  return demoUsers.filter(user => user.isOnline);
};
