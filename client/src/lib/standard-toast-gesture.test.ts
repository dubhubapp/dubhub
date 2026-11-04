/**
 * Standard Radix toast gesture contract.
 * In-app notification banners stay on their own host.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const toasterSrc = readFileSync(join(here, "../components/ui/toaster.tsx"), "utf8");
const toastSrc = readFileSync(join(here, "../components/ui/toast.tsx"), "utf8");
const bannerSrc = readFileSync(
  join(here, "../components/in-app-notification-banner.tsx"),
  "utf8",
);
const appSrc = readFileSync(join(here, "../App.tsx"), "utf8");

describe("standard toast gesture", () => {
  it("dismisses upward with a short flick and does not render a close button", () => {
    assert.match(toasterSrc, /swipeDirection="up"/);
    assert.match(toasterSrc, /swipeThreshold=\{24\}/);
    assert.doesNotMatch(toasterSrc, /swipeThreshold=\{80\}/);
    assert.doesNotMatch(toasterSrc, /<ToastClose/);
    assert.match(toastSrc, /const ToastClose =/);
    assert.match(toastSrc, /\n  ToastClose,/);
  });

  it("lets edge swipes hit the page while the toast itself stays interactive", () => {
    const viewport = toastSrc.slice(
      toastSrc.indexOf("const ToastViewport"),
      toastSrc.indexOf("ToastViewport.displayName"),
    );
    assert.match(viewport, /pointer-events-none/);
    assert.match(viewport, /pl-8/);
    assert.match(toastSrc, /pointer-events-auto relative flex w-full/);
  });

  it("leaves the in-app notification banner host on its own dismiss control", () => {
    assert.match(bannerSrc, /export function InAppNotificationBannerHost/);
    assert.match(bannerSrc, /aria-label="Dismiss notification"/);
    assert.doesNotMatch(bannerSrc, /swipeThreshold|ToastClose|@radix-ui\/react-toast/);
  });

  it("keeps the toaster mounted above routing", () => {
    const authenticated = appSrc.slice(appSrc.lastIndexOf("<Toaster />"));
    assert.match(authenticated, /<Toaster \/>\s*<div[\s\S]*data-app-root="true"[\s\S]*<Switch>/);
  });
});
