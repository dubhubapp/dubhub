import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { AUTH_SURFACE_CLASS } from "./auth-surface";
import { THEME_STORAGE_KEY } from "./theme";

const here = dirname(fileURLToPath(import.meta.url));
const authPageSrc = readFileSync(join(here, "../pages/auth.tsx"), "utf8");
const signInSrc = readFileSync(join(here, "../components/auth/SignIn.tsx"), "utf8");
const forgotSrc = readFileSync(join(here, "../components/auth/ForgotPasswordDialog.tsx"), "utf8");
const authSurfaceSrc = readFileSync(join(here, "./auth-surface.ts"), "utf8");
const cssSrc = readFileSync(join(here, "../index.css"), "utf8");
const themeSrc = readFileSync(join(here, "./theme.ts"), "utf8");
const settingsSrc = readFileSync(join(here, "../pages/settings.tsx"), "utf8");
const appSrc = readFileSync(join(here, "../App.tsx"), "utf8");
const inputSrc = readFileSync(join(here, "../components/ui/input.tsx"), "utf8");

const themeWriteRe = /localStorage\.setItem\(\s*['"]dubhub-theme['"]|applyTheme\(|THEME_STORAGE_KEY/;

describe("login auth-surface dark control consistency", () => {
  it("keeps the login canvas navy regardless of saved Light Mode", () => {
    assert.equal(AUTH_SURFACE_CLASS, "dubhub-auth-surface");
    assert.match(authPageSrc, /AUTH_SURFACE_CLASS/);
    assert.match(authPageSrc, /data-auth-surface=/);
    assert.match(authPageSrc, /PRELOGIN_AUTH_CANVAS_CLASS|dubhub-prelogin-auth/);
    assert.match(cssSrc, /\.dubhub-prelogin-auth\s*\{[\s\S]*?background-color:\s*#0f1324/);
    assert.doesNotMatch(authPageSrc, /getStoredTheme|applyTheme|dubhub-theme/);
  });

  it("scopes dark tokens and color-scheme to the auth surface only", () => {
    const surfaceBlockStart = cssSrc.indexOf(".dubhub-auth-surface {");
    assert.ok(surfaceBlockStart >= 0, "expected .dubhub-auth-surface rule");
    const surfaceBlock = cssSrc.slice(surfaceBlockStart, cssSrc.indexOf("}", surfaceBlockStart) + 1);
    assert.match(surfaceBlock, /color-scheme:\s*dark/);
    assert.match(surfaceBlock, /--input:\s*hsl\(227,\s*28%,\s*20%\)/);
    assert.match(surfaceBlock, /--foreground:\s*hsl\(210,\s*25%,\s*96%\)/);
    assert.match(cssSrc, /\.dubhub-auth-surface input:-webkit-autofill/);
    assert.doesNotMatch(cssSrc, /html\s*\{\s*color-scheme:\s*dark/);
  });

  it("uses dark-compatible login control presentation", () => {
    assert.match(signInSrc, /PRELOGIN_FIELD_CLASS/);
    assert.match(signInSrc, /PRELOGIN_PRIMARY_CTA_CLASS/);
    assert.doesNotMatch(
      signInSrc,
      /\bbg-red-50\b|\bbg-green-50\b|\btext-red-600\b|\btext-green-800\b/,
    );
    assert.match(signInSrc, /border-red-500\/40 bg-red-500\/10/);
    assert.match(signInSrc, /text-red-300/);
    assert.match(forgotSrc, /AUTH_SURFACE_CLASS/);
    assert.match(forgotSrc, /overlayClassName=\{AUTH_SURFACE_CLASS\}/);
    assert.doesNotMatch(inputSrc, /dubhub-auth-surface/);
  });

  it("does not write or change dubhub-theme when Login mounts", () => {
    assert.doesNotMatch(authSurfaceSrc, themeWriteRe);
    assert.doesNotMatch(authPageSrc, themeWriteRe);
    assert.doesNotMatch(signInSrc, themeWriteRe);
    assert.doesNotMatch(forgotSrc, themeWriteRe);
    assert.equal(THEME_STORAGE_KEY, "dubhub-theme");
  });

  it("leaves authenticated Light Mode persistence untouched", () => {
    assert.match(themeSrc, /export function getStoredTheme/);
    assert.match(themeSrc, /export function applyTheme/);
    assert.match(themeSrc, /localStorage\.setItem\(THEME_STORAGE_KEY, mode\)/);
    assert.match(settingsSrc, /applyTheme\(next\)/);
    assert.match(settingsSrc, /data-testid="switch-light-mode"/);
    assert.match(appSrc, /Keep device-level preferences \(e\.g\. theme\) intact across logout\/login\./);
    assert.doesNotMatch(appSrc, /localStorage\.removeItem\(['"]dubhub-theme['"]\)/);
  });

  it("does not change SignIn auth mechanics", () => {
    assert.match(signInSrc, /supabase\.auth\.signInWithPassword/);
    assert.match(signInSrc, /supabase\.auth\.getUser/);
    assert.match(signInSrc, /from\('profiles'\)/);
    assert.match(signInSrc, /onAuthSuccess\(userRole\)/);
    assert.match(forgotSrc, /supabase\.auth\.resetPasswordForEmail/);
  });
});
