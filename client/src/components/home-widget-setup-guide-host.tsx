/**
 * One-time drawer teaching how to add the Release Countdown Home Screen widget.
 * Does not claim the widget was auto-added.
 */

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useUser } from "@/lib/user-context";
import { isHomeReleaseWidgetSelectionEnabled } from "@/lib/home-widget-selection-flag";
import {
  HOME_WIDGET_SETUP_GUIDE_COPY,
  HOME_WIDGET_SETUP_GUIDE_REQUEST_EVENT,
  hasAcknowledgedHomeWidgetSetupGuide,
  markHomeWidgetSetupGuideAcknowledged,
} from "@/lib/home-widget-setup-guide";

export function HomeWidgetSetupGuideHost() {
  const enabled = isHomeReleaseWidgetSelectionEnabled();
  const { currentUser, isAuthenticated } = useUser();
  const userId = currentUser?.id ?? null;

  const [open, setOpen] = useState(false);
  const dismissedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;

    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      const requestUserId = detail?.userId ?? userId;
      if (!requestUserId) return;
      if (!isAuthenticated) return;
      if (dismissedRef.current.has(requestUserId)) return;
      if (hasAcknowledgedHomeWidgetSetupGuide(requestUserId)) return;
      setOpen(true);
    };

    window.addEventListener(HOME_WIDGET_SETUP_GUIDE_REQUEST_EVENT, onRequest);
    return () => {
      window.removeEventListener(HOME_WIDGET_SETUP_GUIDE_REQUEST_EVENT, onRequest);
    };
  }, [enabled, isAuthenticated, userId]);

  const acknowledgeAndClose = () => {
    if (userId) {
      markHomeWidgetSetupGuideAcknowledged(userId);
      dismissedRef.current.add(userId);
    }
    setOpen(false);
  };

  if (!enabled) return null;

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) acknowledgeAndClose();
        else setOpen(true);
      }}
    >
      <DrawerContent className="border-border/60 bg-background">
        <DrawerHeader className="text-left">
          <DrawerTitle className="text-xl font-semibold tracking-tight">
            {HOME_WIDGET_SETUP_GUIDE_COPY.title}
          </DrawerTitle>
          <p className="text-sm text-muted-foreground pt-1">
            {HOME_WIDGET_SETUP_GUIDE_COPY.body}
          </p>
        </DrawerHeader>
        <ol className="list-decimal space-y-2 px-4 pb-2 text-sm text-foreground/90 pl-8">
          {HOME_WIDGET_SETUP_GUIDE_COPY.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <div className="flex flex-col gap-2 px-4 pb-6 pt-2">
          <Button
            type="button"
            className="w-full"
            onClick={acknowledgeAndClose}
            data-testid="button-home-widget-setup-guide-got-it"
          >
            {HOME_WIDGET_SETUP_GUIDE_COPY.primaryCta}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={acknowledgeAndClose}
            data-testid="button-home-widget-setup-guide-not-now"
          >
            {HOME_WIDGET_SETUP_GUIDE_COPY.secondaryCta}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
