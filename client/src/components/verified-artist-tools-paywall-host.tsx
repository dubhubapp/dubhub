/**
 * App-level host: registers the paywall opener and renders one shared sheet.
 */

import { useCallback, useEffect, useState, type RefObject } from "react";
import { VerifiedArtistToolsPaywall } from "@/components/verified-artist-tools-paywall";
import { isVerifiedArtistToolsPaywallEnabled } from "@/lib/verified-artist-tools-paywall-flag";
import type { VerifiedArtistToolsPaywallSource } from "@/lib/verified-artist-tools-paywall-copy";
import {
  registerVerifiedArtistToolsPaywallOpener,
  type VerifiedArtistToolsUpgradeContext,
} from "@/lib/verified-artist-tools-upgrade";

export function VerifiedArtistToolsPaywallHost() {
  const enabled = isVerifiedArtistToolsPaywallEnabled();
  const [open, setOpen] = useState(false);
  const [source, setSource] =
    useState<VerifiedArtistToolsPaywallSource>("settings");
  const [returnFocusRef, setReturnFocusRef] = useState<
    RefObject<HTMLElement | null> | undefined
  >(undefined);

  const openPaywall = useCallback((context: VerifiedArtistToolsUpgradeContext) => {
    setSource(context.source);
    setReturnFocusRef(context.returnFocusRef);
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!enabled) {
      registerVerifiedArtistToolsPaywallOpener(null);
      return;
    }
    registerVerifiedArtistToolsPaywallOpener(openPaywall);
    return () => registerVerifiedArtistToolsPaywallOpener(null);
  }, [enabled, openPaywall]);

  if (!enabled) return null;

  return (
    <VerifiedArtistToolsPaywall
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setReturnFocusRef(undefined);
      }}
      source={source}
      returnFocusRef={returnFocusRef}
    />
  );
}
