import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";

type MockUser = {
  id: string;
  username: string;
  profileImage: null;
  avatarUrl: null;
  level: number;
  currentXP: number;
  memberSince: string;
  userType?: "user" | "artist";
  verifiedArtist?: boolean;
} | null;

const loadedUser: NonNullable<MockUser> = {
  id: "user-1",
  username: "josh",
  profileImage: null,
  avatarUrl: null,
  level: 1,
  currentXP: 0,
  memberSince: "2024-01-01T00:00:00.000Z",
};

let mockUser: MockUser = loadedUser;
const listeners = new Set<() => void>();

function snapshot() {
  return mockUser;
}

export function setRuntimeMockUser(next: MockUser) {
  mockUser = next;
  listeners.forEach((listener) => listener());
}

const valueFor = (user: MockUser) => ({
  currentUser: user,
  userType: user?.userType ?? "user",
  profileImage: null,
  bannerUrl: null,
  username: user?.username ?? null,
  countryCode: null,
  countryPromptPending: false,
  verifiedArtist: user?.verifiedArtist === true,
  isModerator: false,
  isLoading: false,
  isAuthenticated: user != null,
  updateProfileImage: () => undefined,
  updateProfileBanner: () => undefined,
  updateCountryCode: () => undefined,
  updateCountryPromptPending: () => undefined,
});

const UserContext = createContext(valueFor(loadedUser));

export function UserProvider({ children }: { children: ReactNode }) {
  const user = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot,
  );
  return <UserContext.Provider value={valueFor(user)}>{children}</UserContext.Provider>;
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within UserProvider");
  }
  return context;
}
