import { createContext, useContext, useRef, type ReactNode } from "react";

import type { ReleaseFormLeaveNavigation } from "@/lib/release-form-leave";

/** Run `proceed` now, or hold it until the form's discard dialog confirms. */
export type ReleaseFormRouteLeave = (
  proceed: (navigation?: ReleaseFormLeaveNavigation) => void,
) => void;

const ReleaseFormRouteGuardContext = createContext<ReleaseFormRouteLeave | null>(null);

export function ReleaseFormRouteGuardProvider({
  requestLeave,
  children,
}: {
  requestLeave: ReleaseFormRouteLeave;
  children: ReactNode;
}) {
  const leaveRef = useRef(requestLeave);
  leaveRef.current = requestLeave;
  const stableLeave = useRef<ReleaseFormRouteLeave>((proceed) => {
    leaveRef.current(proceed);
  });
  return (
    <ReleaseFormRouteGuardContext.Provider value={stableLeave.current}>
      {children}
    </ReleaseFormRouteGuardContext.Provider>
  );
}

export function useReleaseFormRouteGuard(): ReleaseFormRouteLeave | null {
  return useContext(ReleaseFormRouteGuardContext);
}
