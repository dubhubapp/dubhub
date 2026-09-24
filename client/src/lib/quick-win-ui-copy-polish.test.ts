/**
 * Quick-win polish: UKG label, upload capsule, notifications mark-all removal,
 * standard toast surface, VAT lowercase brand — presentation contracts only.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { APP_MATERIAL_TOAST_SURFACE_CLASS } from "@/lib/app-material";
import { PAYWALL_UI_COPY } from "@/lib/verified-artist-tools-paywall-copy";
import { paywallVinylLoadingCopy } from "@/lib/verified-artist-tools-paywall-lifecycle";

const here = dirname(fileURLToPath(import.meta.url));
const submitSrc = readFileSync(join(here, "../pages/submit-metadata.tsx"), "utf8");
const userProfileSrc = readFileSync(join(here, "../pages/user-profile.tsx"), "utf8");
const toastSrc = readFileSync(join(here, "../components/ui/toast.tsx"), "utf8");
const bannerSrc = readFileSync(
  join(here, "../components/in-app-notification-banner.tsx"),
  "utf8",
);
const cssSrc = readFileSync(join(here, "../index.css"), "utf8");
const paywallCopySrc = readFileSync(
  join(here, "./verified-artist-tools-paywall-copy.ts"),
  "utf8",
);
const paywallLifecycleSrc = readFileSync(
  join(here, "./verified-artist-tools-paywall-lifecycle.ts"),
  "utf8",
);

describe("UKG submit genre label", () => {
  it("shows UKG as the visible Submit metadata genre label", () => {
    assert.match(submitSrc, /\{\s*value:\s*"UKG",\s*label:\s*"UKG"\s*\}/);
    assert.doesNotMatch(submitSrc, /label:\s*"UK Garage"/);
  });

  it("keeps the stored genre value as UKG", () => {
    assert.match(submitSrc, /value:\s*"UKG"/);
    assert.match(submitSrc, /const GENRE_VALUE_SET = new Set\(genres\.map\(\(g\) => g\.value\)\)/);
  });
});

describe("upload progress capsule polish", () => {
  it("keeps the same progress source and portal/fixed contract", () => {
    assert.match(submitSrc, /createPortal\(/);
    assert.match(submitSrc, /showBlockingUploadOverlay/);
    assert.match(submitSrc, /value=\{uploadHandoff \? 100 : uploadProgress\}/);
    assert.match(submitSrc, /Math\.round\(uploadProgress\)/);
    assert.match(submitSrc, /fixed inset-0 z-\[200\]/);
  });

  it("uses compact rounded gradient capsule presentation", () => {
    assert.match(submitSrc, /data-testid="upload-progress-capsule"/);
    assert.match(submitSrc, /APP_MATERIAL_TOAST_SURFACE_CLASS/);
    assert.match(submitSrc, /className="h-1 bg-white\/10"/);
    assert.match(submitSrc, /Uploading… \$\{Math\.round\(uploadProgress\)\}%/);
    assert.doesNotMatch(submitSrc, /bg-black\/55/);
    assert.doesNotMatch(submitSrc, /bg-surface\/90/);
    assert.doesNotMatch(submitSrc, /Uploading\.\.\. \$\{Math\.round\(uploadProgress\)\}%/);
  });

  it("centres the compact capsule in the viewport with a light blocking scrim", () => {
    assert.match(submitSrc, /flex items-center justify-center/);
    assert.match(submitSrc, /bg-black\/30/);
    assert.doesNotMatch(submitSrc, /items-end/);
    assert.doesNotMatch(
      submitSrc,
      /paddingBottom:\s*"calc\(var\(--app-native-nav-exclusion/,
    );
    assert.doesNotMatch(submitSrc, /--app-native-nav-exclusion:\s*/);
  });
});

describe("submit metadata quiet success validation", () => {
  it("keeps the green check and quiet success field class", () => {
    assert.match(submitSrc, /function FieldCompleteCheck/);
    assert.match(submitSrc, /fieldSuccessOutlineClass/);
    assert.match(submitSrc, /APP_MATERIAL_FIELD_SUCCESS_CLASS/);
    assert.match(submitSrc, /text-green-400\/90/);
    assert.match(submitSrc, /bg-green-700\/35/);
    assert.match(submitSrc, /border-green-500\/25/);
  });

  it("removes strong green field glow from success CSS", () => {
    const successBlock = cssSrc.match(
      /\.dark \.dubhub-app-field\.dubhub-app-field-success \{[\s\S]*?\}/,
    )?.[0] ?? "";
    assert.ok(successBlock.length > 0, "dark success rule found");
    assert.match(successBlock, /rgba\(34, 197, 94, 0\.22\)/);
    assert.match(successBlock, /rgba\(28, 36, 68, 0\.78\)/);
    assert.doesNotMatch(successBlock, /0 0 0 1px rgba\(34, 197, 94/);
    assert.doesNotMatch(successBlock, /rgba\(20, 40, 32/);
  });

  it("keeps focus distinct from valid and leaves error styling strong", () => {
    assert.match(
      submitSrc,
      /showFieldSuccess = \(key: TrackFieldKey, valid: boolean\) =>\s*valid && !!fieldConfirmed\[key\] && !fieldFocused\[key\]/,
    );
    assert.match(cssSrc, /\.dark \.dubhub-app-field\.dubhub-app-field-success:focus/);
    const invalidBlock = cssSrc.match(
      /\.dark \.dubhub-app-field\[aria-invalid="true"\],\s*\.dark \.dubhub-app-field\.dubhub-app-field-invalid \{[\s\S]*?\}/,
    )?.[0] ?? "";
    assert.ok(invalidBlock.length > 0, "dark invalid rule found");
    assert.match(invalidBlock, /rgba\(239, 68, 68, 0\.65\)/);
    assert.match(invalidBlock, /0 0 0 1px rgba\(239, 68, 68/);
  });
});

describe("notifications mark-all button removal", () => {
  it("removes the Mark all as read control", () => {
    assert.doesNotMatch(userProfileSrc, /Mark all as read/);
    assert.doesNotMatch(userProfileSrc, /data-testid="mark-all-read"/);
    assert.doesNotMatch(userProfileSrc, /All notifications marked as read/);
  });

  it("keeps tab-entry automatic mark-as-read behavior", () => {
    assert.match(userProfileSrc, /markAllNotificationsAsReadMutation/);
    assert.match(userProfileSrc, /markAllReadOnNotificationsTabRef/);
    assert.match(
      userProfileSrc,
      /Mark all notifications as read when opening the Notifications tab/,
    );
    assert.match(
      userProfileSrc,
      /\/api\/user\/\$\{currentUser\.id\}\/notifications\/mark-all-read/,
    );
  });
});

describe("standard toast surface polish", () => {
  it("uses rounded gradient toast surface on the default variant", () => {
    assert.equal(APP_MATERIAL_TOAST_SURFACE_CLASS, "dubhub-app-toast-surface");
    assert.match(toastSrc, /rounded-\[18px\]/);
    assert.match(toastSrc, /dubhub-app-toast-surface/);
    assert.doesNotMatch(toastSrc, /default:\s*"border bg-background text-foreground"/);
    assert.match(cssSrc, /\.dark \.dubhub-app-toast-surface/);
    assert.match(cssSrc, /background-image:\s*linear-gradient/);
  });

  it("leaves in-app notification glass banners on their own surface", () => {
    assert.match(bannerSrc, /bg-\[#0f1324\]\/92/);
    assert.match(bannerSrc, /backdrop-blur-xl/);
    assert.match(bannerSrc, /rounded-xl border border-white\/12/);
    assert.doesNotMatch(bannerSrc, /dubhub-app-toast-surface/);
    assert.doesNotMatch(bannerSrc, /from ["']@\/components\/ui\/toast["']/);
  });
});

describe("VAT lowercase dub hub copy", () => {
  it("uses lowercase dub hub in app-authored purchase confirmation copy", () => {
    assert.equal(
      PAYWALL_UI_COPY.unlockingBody,
      "Confirming your purchase with dub hub.",
    );
    assert.equal(
      paywallVinylLoadingCopy("verifying")?.body,
      "Confirming your purchase with dub hub.",
    );
    assert.equal(
      paywallVinylLoadingCopy("restoring")?.body,
      "Confirming your purchases with dub hub.",
    );
  });

  it("does not leave capitalised Dub Hub in VAT user-facing copy modules", () => {
    assert.doesNotMatch(paywallCopySrc, /Dub Hub/);
    assert.doesNotMatch(paywallLifecycleSrc, /Dub Hub/);
    assert.doesNotMatch(paywallCopySrc, /DUB HUB/);
    assert.doesNotMatch(paywallLifecycleSrc, /DUB HUB/);
  });
});
