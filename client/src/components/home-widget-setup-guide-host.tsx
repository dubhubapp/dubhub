/**
 * Contextual sheet for adding the Release Countdown Home Screen widget.
 * “Got it” and swipe dismiss close only. “Don’t show again” opts out.
 * Does not claim the widget was auto-added.
 */

import { useEffect, useRef, useState } from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
} from "@/components/ui/drawer";
import { HomeWidgetSetupPreview } from "@/components/home-widget-setup-preview";
import { useUser } from "@/lib/user-context";
import { readHomeWidgetPayload } from "@/lib/home-widget-bridge";
import { isHomeReleaseWidgetSelectionEnabled } from "@/lib/home-widget-selection-flag";
import {
  buildHomeWidgetSetupPreview,
  type HomeWidgetSetupPreviewModel,
} from "@/lib/home-widget-setup-preview";
import {
  APP_MATERIAL_FORM_PRIMARY_CLASS,
  APP_MATERIAL_SHEET_BACKDROP_CLASS,
  APP_MATERIAL_SHEET_SURFACE_CLASS,
} from "@/lib/app-material";
import { acquireHomeWidgetSetupGuideNativeNavCover } from "@/lib/home-widget-setup-guide-native-cover";
import {
  NATIVE_NAV_SHEET_CLOSE_FALLBACK_MS,
  nativeNavSheetCoversBar,
  nativeNavSheetPhaseAfterUnfiredClose,
  nativeNavSheetPhaseOnAnimationEnd,
  nativeNavSheetPhaseOnOpenChange,
  type NativeNavSheetPhase,
} from "@/lib/native-nav-sheet-cover";
import {
  HOME_WIDGET_SETUP_GUIDE_COPY,
  HOME_WIDGET_SETUP_GUIDE_REQUEST_EVENT,
  hasOptedOutOfHomeWidgetSetupGuide,
  homeWidgetSetupGuideDismissWritesMarker,
  markHomeWidgetSetupGuideOptedOut,
  type HomeWidgetSetupGuideDismissKind,
  type HomeWidgetSetupGuideRequestDetail,
} from "@/lib/home-widget-setup-guide";
import { cn } from "@/lib/utils";

export function HomeWidgetSetupGuideHost() {
  const enabled = isHomeReleaseWidgetSelectionEnabled();
  const { currentUser, isAuthenticated } = useUser();
  const userId = currentUser?.id ?? null;

  const [open, setOpen] = useState(false);
  const [sheetPhase, setSheetPhase] = useState<NativeNavSheetPhase>("closed");
  const [preview, setPreview] = useState<HomeWidgetSetupPreviewModel | null>(null);
  const dismissedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;

    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<HomeWidgetSetupGuideRequestDetail>).detail;
      const requestUserId = detail?.userId ?? userId;
      if (!requestUserId) return;
      if (!isAuthenticated) return;
      if (!hasOptedOutOfHomeWidgetSetupGuide(requestUserId)) {
        dismissedRef.current.delete(requestUserId);
      }
      if (dismissedRef.current.has(requestUserId)) return;
      if (hasOptedOutOfHomeWidgetSetupGuide(requestUserId)) return;
      const openWithRelease = (release: HomeWidgetSetupGuideRequestDetail["release"]) => {
        setPreview(buildHomeWidgetSetupPreview(release ?? null));
        setSheetPhase("open");
        setOpen(true);
      };
      if (detail && "release" in detail) {
        openWithRelease(detail.release);
        return;
      }
      void readHomeWidgetPayload()
        .then((payload) => {
          openWithRelease(payload?.dto.release ?? null);
        })
        .catch(() => {
          openWithRelease(null);
        });
    };

    window.addEventListener(HOME_WIDGET_SETUP_GUIDE_REQUEST_EVENT, onRequest);
    return () => {
      window.removeEventListener(HOME_WIDGET_SETUP_GUIDE_REQUEST_EVENT, onRequest);
    };
  }, [enabled, isAuthenticated, userId]);

  const coversNativeNav = nativeNavSheetCoversBar(sheetPhase);
  useEffect(() => {
    if (!coversNativeNav) return;
    return acquireHomeWidgetSetupGuideNativeNavCover();
  }, [coversNativeNav]);

  // Got it / Don’t show again set `open` false without Vaul `setIsOpen`, so
  // `onAnimationEnd(false)` never runs. Force `"closed"` anyway so the cover drops.
  useEffect(() => {
    if (open) return;
    if (sheetPhase === "closed") return;
    const t = window.setTimeout(() => {
      setSheetPhase((phase) => nativeNavSheetPhaseAfterUnfiredClose(false, phase));
    }, NATIVE_NAV_SHEET_CLOSE_FALLBACK_MS);
    return () => window.clearTimeout(t);
  }, [open, sheetPhase]);

  const closeSheet = (kind: HomeWidgetSetupGuideDismissKind) => {
    if (homeWidgetSetupGuideDismissWritesMarker(kind) && userId) {
      markHomeWidgetSetupGuideOptedOut(userId);
      dismissedRef.current.add(userId);
    }
    setSheetPhase("closing");
    setOpen(false);
  };

  if (!enabled) return null;

  return (
    <Drawer
      open={open}
      shouldScaleBackground={false}
      onOpenChange={(next) => {
        setSheetPhase(nativeNavSheetPhaseOnOpenChange(next));
        if (!next) setOpen(false);
        else setOpen(true);
      }}
      onAnimationEnd={(animationOpen) => {
        setSheetPhase(nativeNavSheetPhaseOnAnimationEnd(animationOpen));
      }}
    >
      <DrawerPortal>
        <DrawerOverlay className={cn("z-[70]", APP_MATERIAL_SHEET_BACKDROP_CLASS)} />
        <DrawerPrimitive.Content
          className={cn(
            APP_MATERIAL_SHEET_SURFACE_CLASS,
            "fixed inset-x-0 bottom-0 z-[70] flex max-h-[92dvh] w-full flex-col overflow-y-auto border outline-none",
          )}
          style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom, 0px))" }}
          data-testid="home-widget-setup-guide-sheet"
        >
          <div className="flex justify-center pt-2.5 pb-1" aria-hidden>
            <div className="h-1 w-10 rounded-full bg-[#101828]/25 dark:bg-white/30" />
          </div>
          <div className="px-5 pb-2 pt-2 text-left">
            <DrawerTitle className="text-xl font-semibold tracking-tight text-foreground">
              {HOME_WIDGET_SETUP_GUIDE_COPY.title}
            </DrawerTitle>
            <p className="pt-1.5 text-sm leading-relaxed text-muted-foreground">
              {HOME_WIDGET_SETUP_GUIDE_COPY.body}
            </p>
            <HomeWidgetSetupPreview model={preview} />
          </div>
          <ol className="mt-4 list-decimal space-y-2.5 px-5 pb-4 pl-9 text-sm leading-snug text-foreground">
            {HOME_WIDGET_SETUP_GUIDE_COPY.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <div className="flex flex-col gap-2 px-5">
            <Button
              type="button"
              className={APP_MATERIAL_FORM_PRIMARY_CLASS}
              onClick={() => closeSheet("temporary")}
              data-testid="button-home-widget-setup-guide-got-it"
            >
              {HOME_WIDGET_SETUP_GUIDE_COPY.primaryCta}
            </Button>
            <button
              type="button"
              className="dubhub-app-secondary-action ios-press h-11 w-full rounded-[15px] border text-sm font-medium"
              onClick={() => closeSheet("opt-out")}
              data-testid="button-home-widget-setup-guide-dont-show-again"
            >
              {HOME_WIDGET_SETUP_GUIDE_COPY.secondaryCta}
            </button>
          </div>
        </DrawerPrimitive.Content>
      </DrawerPortal>
    </Drawer>
  );
}
