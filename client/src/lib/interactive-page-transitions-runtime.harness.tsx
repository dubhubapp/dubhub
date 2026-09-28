/**
 * Runtime harness for the flag-on React #310 regression.
 * Loaded through Vite so the stack and settings pages resolve like the app.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Router, Switch } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { InteractiveSettingsStack } from "@/components/interactive-settings-stack";
import { queryClient } from "@/lib/queryClient";
import { interactivePageTransitionsEnabled } from "@/lib/interactive-page-transitions";
import { UserProvider, setRuntimeMockUser } from "@/lib/user-context";
import UserProfile from "@/pages/user-profile";
import ArtistQuestionsManagePage from "@/pages/artist-questions-manage";
import SettingsManageAccountPage from "@/pages/settings-manage-account";
import SettingsNotificationsPage from "@/pages/settings-notifications";
import SettingsPage from "@/pages/settings";

function ProfileProbe({ nonce }: { nonce: number }) {
  const [seen, setSeen] = useState(nonce);
  useEffect(() => {
    setSeen(nonce);
  }, [nonce]);
  return <div data-testid="profile-probe">profile:{seen}</div>;
}

function UserProfileGate() {
  if (interactivePageTransitionsEnabled()) return null;
  return <UserProfile />;
}

function SettingsNotificationsGate() {
  if (interactivePageTransitionsEnabled()) return null;
  return <SettingsNotificationsPage />;
}

function SettingsArtistQuestionsGate() {
  if (interactivePageTransitionsEnabled()) return null;
  return <ArtistQuestionsManagePage />;
}

const runtimeLocation = memoryLocation({ path: "/profile", record: true });

export function navigateRuntimeHarness(path: string) {
  runtimeLocation.navigate(path);
}

const historyEvents = ["popstate", "pushState", "replaceState"] as const;
const browserHistoryListeners = new Set<() => void>();

export function notifyBrowserHarnessLocation() {
  browserHistoryListeners.forEach((listener) => listener());
}

function subscribeBrowserHistory(onStoreChange: () => void) {
  browserHistoryListeners.add(onStoreChange);
  for (const eventName of historyEvents) window.addEventListener(eventName, onStoreChange);
  return () => {
    browserHistoryListeners.delete(onStoreChange);
    for (const eventName of historyEvents) window.removeEventListener(eventName, onStoreChange);
  };
}

function browserPathname() {
  return window.location.pathname;
}

function browserSearch() {
  return window.location.search.replace(/^\?/, "");
}

/** Same navigate contract as Wouter: push by default, replace and history state when passed. */
export function navigateBrowserHarness(
  to: string,
  opts?: { replace?: boolean; state?: unknown },
) {
  const url = new URL(to, window.location.href);
  const next = `${url.pathname}${url.search}`;
  const state = opts?.state ?? null;
  if (opts?.replace) window.history.replaceState(state, "", next);
  else window.history.pushState(state, "", next);
  window.dispatchEvent(new Event(opts?.replace ? "replaceState" : "pushState"));
  notifyBrowserHarnessLocation();
}

function useBrowserHarnessLocation() {
  const path = useSyncExternalStore(subscribeBrowserHistory, browserPathname, browserPathname);
  return [path, navigateBrowserHarness] as const;
}

useBrowserHarnessLocation.searchHook = function useBrowserHarnessSearch() {
  return useSyncExternalStore(subscribeBrowserHistory, browserSearch, browserSearch);
};

export { setRuntimeMockUser };

export function TransitionRuntimeHarness({ nonce }: { nonce: number }) {
  const SettingsWithSignOut = () =>
    interactivePageTransitionsEnabled() ? null : <SettingsPage onSignOut={() => undefined} />;

  const SettingsManageAccountWithDeletion = () =>
    interactivePageTransitionsEnabled() ? null : (
      <SettingsManageAccountPage onAccountDeleted={() => undefined} />
    );

  return (
    <QueryClientProvider client={queryClient}>
      <UserProvider>
        <div data-app-root="true" className="flex min-h-0 flex-1 flex-col">
          <div data-app-shell="true" className="flex min-h-0 flex-1 flex-col">
            <Router hook={runtimeLocation.hook}>
            <Switch>
              <Route path="/profile">
                <ProfileProbe nonce={nonce} />
                <UserProfileGate />
              </Route>
              <Route path="/settings/notifications" component={SettingsNotificationsGate} />
              <Route path="/settings/artist-questions" component={SettingsArtistQuestionsGate} />
              <Route path="/settings/manage-account" component={SettingsManageAccountWithDeletion} />
              <Route path="/settings" component={SettingsWithSignOut} />
            </Switch>
            <InteractiveSettingsStack onSignOut={() => undefined} />
            </Router>
          </div>
        </div>
      </UserProvider>
    </QueryClientProvider>
  );
}

/** Real History API commits. happy-dom's history.back() does not traverse same-document entries. */
export function BrowserHistoryTransitionHarness({ nonce }: { nonce: number }) {
  const SettingsWithSignOut = () =>
    interactivePageTransitionsEnabled() ? null : <SettingsPage onSignOut={() => undefined} />;

  const SettingsManageAccountWithDeletion = () =>
    interactivePageTransitionsEnabled() ? null : (
      <SettingsManageAccountPage onAccountDeleted={() => undefined} />
    );

  return (
    <QueryClientProvider client={queryClient}>
      <UserProvider>
        <div data-app-root="true" className="flex min-h-0 flex-1 flex-col">
          <div data-app-shell="true" className="flex min-h-0 flex-1 flex-col">
            <Router hook={useBrowserHarnessLocation}>
            <Switch>
              <Route path="/profile">
                <ProfileProbe nonce={nonce} />
                <UserProfileGate />
              </Route>
              <Route path="/settings/notifications" component={SettingsNotificationsGate} />
              <Route path="/settings/artist-questions" component={SettingsArtistQuestionsGate} />
              <Route path="/settings/manage-account" component={SettingsManageAccountWithDeletion} />
              <Route path="/settings" component={SettingsWithSignOut} />
            </Switch>
            <InteractiveSettingsStack onSignOut={() => undefined} />
            </Router>
          </div>
        </div>
      </UserProvider>
    </QueryClientProvider>
  );
}
