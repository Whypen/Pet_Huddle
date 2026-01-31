// Demo data for the application

export interface DemoUser {
  id: string;
  name: string;
  age: number;
  role: "nannies" | "playdates" | "animal-lovers";
  bio: string;
  education?: string;
  height?: number;
  occupation?: string;
  isVerified: boolean;
  hasCar: boolean;
  avatarUrl?: string;
  location: { lat: number; lng: number };
  isOnline: boolean;
  pets: Array<{
    id: string;
    name: string;
    species: string;
    photoUrl?: string;
  }>;
}

export interface DemoAlert {
  id: string;
  type: "lost" | "stray" | "others";
  description: string;
  location: { lat: number; lng: number };
  createdBy: string;
  isOwnedByCurrentUser: boolean;
  createdAt: string;
}

// 10 Diverse demo users around Hong Kong
export const demoUsers: DemoUser[] = [
  {
    id: "demo-1",
    name: "Sarah Chen",
    age: 28,
    role: "nannies",
    bio: "Professional pet sitter with 5 years experience. Love all animals! 🐾",
    education: "Bachelor's in Veterinary Science",
    height: 165,
    occupation: "Pet Sitter",
    isVerified: true,
    hasCar: true,
    location: { lat: 22.2855, lng: 114.1577 },
    isOnline: true,
    pets: [
      { id: "p1", name: "Mochi", species: "Cat" },
      { id: "p2", name: "Bella", species: "Dog" },
    ],
  },
  {
    id: "demo-2",
    name: "Marcus Wong",
    age: 32,
    role: "playdates",
    bio: "Golden Retriever dad looking for playdate buddies in Central! 🐕",
    height: 178,
    occupation: "Software Engineer",
    isVerified: true,
    hasCar: true,
    location: { lat: 22.2820, lng: 114.1588 },
    isOnline: true,
    pets: [
      { id: "p3", name: "Max", species: "Dog" },
    ],
  },
  {
    id: "demo-3",
    name: "Emily Lam",
    age: 25,
    role: "animal-lovers",
    bio: "Animal shelter volunteer. Passionate about rescue animals! 💕",
    education: "Master's in Environmental Science",
    isVerified: true,
    hasCar: false,
    location: { lat: 22.2790, lng: 114.1730 },
    isOnline: true,
    pets: [],
  },
  {
    id: "demo-4",
    name: "James Liu",
    age: 35,
    role: "nannies",
    bio: "Certified pet first-aid. Available weekends and evenings.",
    occupation: "Nurse",
    isVerified: true,
    hasCar: true,
    location: { lat: 22.2950, lng: 114.1690 },
    isOnline: false,
    pets: [
      { id: "p4", name: "Luna", species: "Cat" },
    ],
  },
  {
    id: "demo-5",
    name: "Jessica Ng",
    age: 29,
    role: "playdates",
    bio: "Two energetic Corgis looking for friends! Love hiking trails 🏔️",
    height: 160,
    isVerified: false,
    hasCar: true,
    location: { lat: 22.2705, lng: 114.1485 },
    isOnline: true,
    pets: [
      { id: "p5", name: "Coco", species: "Dog" },
      { id: "p6", name: "Cookie", species: "Dog" },
    ],
  },
  {
    id: "demo-6",
    name: "David Chan",
    age: 40,
    role: "animal-lovers",
    bio: "Bird enthusiast and parrot trainer. Also love cats!",
    education: "PhD in Zoology",
    occupation: "University Professor",
    isVerified: true,
    hasCar: false,
    location: { lat: 22.3193, lng: 114.1694 },
    isOnline: false,
    pets: [
      { id: "p7", name: "Rio", species: "Bird" },
      { id: "p8", name: "Sky", species: "Bird" },
    ],
  },
  {
    id: "demo-7",
    name: "Amy Tsang",
    age: 27,
    role: "nannies",
    bio: "Dog walker & groomer. Your furry friend's best friend! 🐩",
    height: 158,
    occupation: "Pet Groomer",
    isVerified: true,
    hasCar: false,
    location: { lat: 22.2783, lng: 114.1827 },
    isOnline: true,
    pets: [
      { id: "p9", name: "Pepper", species: "Dog" },
    ],
  },
  {
    id: "demo-8",
    name: "Kevin Ho",
    age: 33,
    role: "playdates",
    bio: "French Bulldog owner. Weekend beach trips with my pup! 🏖️",
    isVerified: false,
    hasCar: true,
    location: { lat: 22.2665, lng: 114.1880 },
    isOnline: true,
    pets: [
      { id: "p10", name: "Bruno", species: "Dog" },
    ],
  },
  {
    id: "demo-9",
    name: "Michelle Yip",
    age: 31,
    role: "animal-lovers",
    bio: "Cat café regular. Will pet every cat in Hong Kong! 🐱",
    education: "Bachelor's in Marketing",
    height: 162,
    occupation: "Marketing Manager",
    isVerified: true,
    hasCar: false,
    location: { lat: 22.3080, lng: 114.1880 },
    isOnline: false,
    pets: [],
  },
  {
    id: "demo-10",
    name: "Tom Lee",
    age: 45,
    role: "nannies",
    bio: "Retired vet tech. 20+ years caring for all kinds of pets.",
    occupation: "Retired",
    isVerified: true,
    hasCar: true,
    location: { lat: 22.2488, lng: 114.1659 },
    isOnline: true,
    pets: [
      { id: "p11", name: "Whiskers", species: "Cat" },
      { id: "p12", name: "Buddy", species: "Dog" },
      { id: "p13", name: "Hoppy", species: "Rabbit" },
    ],
  },
];

// 5 Demo broadcast alerts
export const demoAlerts: DemoAlert[] = [
  {
    id: "alert-1",
    type: "lost",
    description: "Lost golden retriever near Victoria Park. Responds to 'Charlie'. Wearing blue collar. Very friendly!",
    location: { lat: 22.2823, lng: 114.1884 },
    createdBy: "demo-2",
    isOwnedByCurrentUser: true, // User owns this one
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "alert-2",
    type: "lost",
    description: "Missing tabby cat in Sheung Wan area. Orange and white stripes. Name is Ginger. Please help!",
    location: { lat: 22.2869, lng: 114.1506 },
    createdBy: "demo-5",
    isOwnedByCurrentUser: false,
    createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "alert-3",
    type: "stray",
    description: "Friendly stray dog spotted near Central Ferry. Looks healthy but no collar. Brown medium-sized.",
    location: { lat: 22.2874, lng: 114.1603 },
    createdBy: "demo-3",
    isOwnedByCurrentUser: false,
    createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "alert-4",
    type: "stray",
    description: "Several stray cats in need of food near Wan Chai Market. Bringing supplies daily. Help welcome!",
    location: { lat: 22.2773, lng: 114.1733 },
    createdBy: "demo-9",
    isOwnedByCurrentUser: false,
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "alert-5",
    type: "others",
    description: "Injured bird found in Kowloon Park. Have called wildlife rescue. Updates to follow.",
    location: { lat: 22.3018, lng: 114.1695 },
    createdBy: "demo-6",
    isOwnedByCurrentUser: false,
    createdAt: new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString(),
  },
];

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
