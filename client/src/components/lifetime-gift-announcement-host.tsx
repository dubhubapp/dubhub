/**
 * One-time success sheet when a verified artist is newly gifted lifetime VAT access.
 */

import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useAuthoritativeSubscriptionStatus } from "@/hooks/use-authoritative-subscription-status";
import { useUser } from "@/lib/user-context";
import {
  LIFETIME_GIFT_COPY,
  markLifetimeGiftAcknowledged,
  resolveLifetimeGiftAnnouncement,
} from "@/lib/lifetime-gift-announcement";
import { isVerifiedArtistToolsPaywallEnabled } from "@/lib/verified-artist-tools-paywall-flag";
import { triggerSuccessHaptic } from "@/lib/verified-artist-tools-haptics";
import {
  PAYWALL_SHELL_CLASS,
  PAYWALL_SUCCESS_CONFIRMATION_LINES,
  PAYWALL_FOOTER_GEOMETRY,
} from "@/lib/verified-artist-tools-paywall-lifecycle";
import { cn } from "@/lib/utils";

const SENSITIVE_PATH_PREFIXES = [
  "/reset-password",
  "/auth-callback",
  "/auth/callback",
] as const;

function isSensitiveAuthPath(path: string): boolean {
  return SENSITIVE_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

export function LifetimeGiftAnnouncementHost() {
  const enabled = isVerifiedArtistToolsPaywallEnabled();
  const { currentUser, verifiedArtist, isAuthenticated, isLoading: userLoading } =
    useUser();
  const [location] = useLocation();
  const subscription = useAuthoritativeSubscriptionStatus({
    enabled: enabled && isAuthenticated && verifiedArtist,
  });

  const [open, setOpen] = useState(false);
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const hapticFiredRef = useRef(false);
  /** Survives storage write failures so a rerender cannot replay in-session. */
  const dismissedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;
    if (userLoading || !isAuthenticated || !verifiedArtist) return;
    if (!currentUser?.id) return;
    if (isSensitiveAuthPath(location)) return;
    if (subscription.loading || subscription.error) return;
    if (!subscription.selection.ok) return;

    const decision = resolveLifetimeGiftAnnouncement({
      userId: currentUser.id,
      selection: subscription.selection,
    });

    if (!decision.shouldShow || !decision.fingerprint) return;
    if (dismissedRef.current.has(`${currentUser.id}:${decision.fingerprint}`)) return;

    setFingerprint(decision.fingerprint);
    setOpen(true);
  }, [
    enabled,
    userLoading,
    isAuthenticated,
    verifiedArtist,
    currentUser?.id,
    location,
    subscription.loading,
    subscription.error,
    subscription.selection,
  ]);

  useEffect(() => {
    if (!open || hapticFiredRef.current) return;
    hapticFiredRef.current = true;
    triggerSuccessHaptic();
  }, [open]);

  useEffect(() => {
    if (!open) hapticFiredRef.current = false;
  }, [open]);

  /** Acknowledge only after the sheet has actually been presented and dismissed. */
  const dismiss = () => {
    if (!open) return;
    if (currentUser?.id && fingerprint) {
      dismissedRef.current.add(`${currentUser.id}:${fingerprint}`);
      markLifetimeGiftAcknowledged({
        userId: currentUser.id,
        fingerprint,
      });
    }
    setOpen(false);
  };

  if (!enabled) return null;

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
        else setOpen(true);
      }}
    >
      <DrawerContent
        className={cn(PAYWALL_SHELL_CLASS, "outline-none")}
        data-testid="lifetime-gift-announcement"
      >
        <DrawerHeader className="relative px-5 pb-2 pt-4 text-left">
          <DrawerTitle className="pr-10 text-base font-semibold text-foreground">
            {LIFETIME_GIFT_COPY.title}
          </DrawerTitle>
          <DrawerClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-3 top-3 h-9 w-9 text-muted-foreground"
              aria-label="Close"
              data-testid="lifetime-gift-close"
              onClick={dismiss}
            >
              <X className="h-4 w-4" aria-hidden />
            </Button>
          </DrawerClose>
        </DrawerHeader>

        <div className="space-y-4 px-5 pb-6 pt-1">
          <div className="space-y-1.5">
            <p className="text-sm leading-relaxed text-muted-foreground">
              {LIFETIME_GIFT_COPY.body}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {LIFETIME_GIFT_COPY.secondary}
            </p>
          </div>

          <ul className="space-y-1.5" aria-label="Included with your plan">
            {PAYWALL_SUCCESS_CONFIRMATION_LINES.map((line) => (
              <li
                key={line}
                className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"
              >
                <Check
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#4ae9df]"
                  aria-hidden
                />
                <span>{line}</span>
              </li>
            ))}
          </ul>

          <Button
            type="button"
            className={cn("w-full", PAYWALL_FOOTER_GEOMETRY.primaryButtonMinHeightClass)}
            onClick={dismiss}
            data-testid="lifetime-gift-done"
          >
            {LIFETIME_GIFT_COPY.done}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
