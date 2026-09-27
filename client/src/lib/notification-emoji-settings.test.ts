import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { SETTINGS_PAGE_SCROLL_CLASS } from "./settings-presentation";
import {
  NOTIFICATION_EMOJI_GLYPH_STYLE,
  notificationEmojiEditorMode,
  notificationEmojiInputDecision,
  notificationEmojiPlainMention,
} from "./notification-emoji-settings";
import { resolveVerifiedArtistToolsPaywallCopy } from "./verified-artist-tools-paywall-copy";

const here = dirname(fileURLToPath(import.meta.url));
const settingsSrc = readFileSync(join(here, "../pages/settings.tsx"), "utf8");
const artistSettingsSrc = readFileSync(join(here, "../pages/settings-artist.tsx"), "utf8");
const rowSrc = readFileSync(
  join(here, "../components/notification-emoji-settings-row.tsx"),
  "utf8",
);
const vatRowSrc = readFileSync(
  join(here, "../components/verified-artist-tools-settings-row.tsx"),
  "utf8",
);
const appSrc = readFileSync(join(here, "../App.tsx"), "utf8");
const navContractSrc = readFileSync(join(here, "./native-nav-contract.ts"), "utf8");

describe("notification emoji settings mode", () => {
  it("maps paid-tool gate modes without a free flash", () => {
    assert.equal(notificationEmojiEditorMode("available"), "editable");
    assert.equal(notificationEmojiEditorMode("locked"), "locked");
    assert.equal(notificationEmojiEditorMode("loading"), "disabled");
    assert.equal(notificationEmojiEditorMode("unavailable"), "disabled");
  });

  it("builds a plain @username and counts one preview emoji", () => {
    assert.equal(notificationEmojiPlainMention("BlueDibby"), "@BlueDibby");
    assert.equal(notificationEmojiPlainMention("Artist1"), "@Artist1");
    assert.equal(notificationEmojiPlainMention("@Artist1"), "@Artist1");
    assert.equal(notificationEmojiPlainMention("  "), "@artist");
    const mention = notificationEmojiPlainMention("Artist1");
    const saved = "⚙️";
    const preview = `${mention} ${saved}`;
    assert.equal(preview, "@Artist1 ⚙️");
    assert.equal(preview.split(saved).length - 1, 1);
    assert.equal(mention.split(saved).length - 1, 0);
    const settingsLib = readFileSync(join(here, "./notification-emoji-settings.ts"), "utf8");
    assert.doesNotMatch(settingsLib, /formatArtistIdentityMention|formatUsernameDisplay/);
  });

  it("accepts one emoji from the keyboard and ignores everything else", () => {
    assert.equal(notificationEmojiInputDecision("⚙️"), "⚙️");
    assert.equal(notificationEmojiInputDecision("❤️"), "❤️");
    assert.equal(notificationEmojiInputDecision("a"), null);
    assert.equal(notificationEmojiInputDecision("1"), null);
    assert.equal(notificationEmojiInputDecision("hello"), null);
    assert.equal(notificationEmojiInputDecision("⚙️ hello"), null);
    assert.equal(notificationEmojiInputDecision("🔥🔥"), null);
    assert.equal(notificationEmojiInputDecision(""), null);
    assert.equal(notificationEmojiInputDecision("   "), null);
  });
});

describe("settings artist information architecture", () => {
  it("keeps a single Artist row on root Settings", () => {
    assert.match(settingsSrc, /data-testid="button-settings-artist"/);
    assert.match(settingsSrc, />Artist</);
    assert.match(settingsSrc, /Manage artist tools and preferences/);
    assert.match(settingsSrc, /navigate\("\/settings\/artist"\)/);
    assert.match(appSrc, /path="\/settings\/artist"/);
    assert.doesNotMatch(settingsSrc, /VerifiedArtistToolsSettingsRow/);
    assert.doesNotMatch(settingsSrc, /NotificationEmojiSettingsRow/);
    assert.doesNotMatch(settingsSrc, /button-artist-questions-settings/);
    assert.doesNotMatch(settingsSrc, /Notification emoji/);
    assert.match(settingsSrc, /\{verifiedArtist \? \(/);
  });

  it("moves VAT, notification emoji, and Artist Questions onto Artist Settings", () => {
    const vatAt = artistSettingsSrc.indexOf("<VerifiedArtistToolsSettingsRow");
    const emojiAt = artistSettingsSrc.indexOf("<NotificationEmojiSettingsRow");
    const questionsAt = artistSettingsSrc.indexOf("button-artist-questions-settings");
    assert.ok(vatAt >= 0 && emojiAt > vatAt && questionsAt > emojiAt);
    assert.match(artistSettingsSrc, /navigate\("\/settings\/artist-questions"\)/);
    assert.match(artistSettingsSrc, /data-testid="settings-artist-page"/);
    assert.doesNotMatch(artistSettingsSrc, /SETTINGS_SECTION_LABEL_CLASS/);
    assert.match(artistSettingsSrc, /userType !== "artist" \|\| !verifiedArtist/);
    assert.doesNotMatch(vatRowSrc, /Sparkles/);
    assert.match(vatRowSrc, /Verified Artist Tools|view\.title/);
  });

  it("keeps the native bar and stops keyboard resize on this page only", () => {
    assert.match(artistSettingsSrc, /useIosKeyboardResizeNone\(true\)/);
    assert.doesNotMatch(navContractSrc, /notification-emoji|notificationEmoji|\/settings\/artist/);
    assert.equal(
      resolveVerifiedArtistToolsPaywallCopy("notification_emoji").emphasizeBenefit,
      "Custom notification emoji",
    );
  });

  it("stays scrollable and adds bottom reach only while the keyboard is open", () => {
    assert.match(artistSettingsSrc, /SETTINGS_PAGE_SCROLL_CLASS/);
    assert.match(SETTINGS_PAGE_SCROLL_CLASS, /overflow-y-auto/);
    assert.match(SETTINGS_PAGE_SCROLL_CLASS, /min-h-0/);
    assert.match(artistSettingsSrc, /settings-artist-scroll-pad/);
    assert.match(artistSettingsSrc, /keyboardInset > 0 \? \{ paddingBottom: keyboardInset \}/);
    assert.doesNotMatch(artistSettingsSrc, /scrollIntoView/);
    assert.doesNotMatch(artistSettingsSrc, /pb-96|min-h-screen|h-screen/);
  });
});

describe("notification emoji control", () => {
  it("shows Plus when empty and one emoji when saved, with a plain preview", () => {
    assert.match(rowSrc, /emoji \?\? <Plus/);
    assert.match(rowSrc, /notificationEmojiPlainMention\(username\)/);
    assert.doesNotMatch(rowSrc, /formatArtistIdentityMention|formatUsernameDisplay|notificationEmojiPreview/);
    const previewAt = rowSrc.indexOf('data-testid="settings-notification-emoji-preview"');
    const preview = rowSrc.slice(previewAt);
    assert.equal(preview.split("{savedEmoji}").length - 1, 1);
    assert.match(preview, /settings-notification-emoji-preview-mention/);
    assert.match(preview, /settings-notification-emoji-preview-glyph/);
    const mentionAt = preview.indexOf("settings-notification-emoji-preview-mention");
    assert.doesNotMatch(preview.slice(Math.max(0, mentionAt - 80), mentionAt), /savedEmoji|GLYPH_STYLE/);
    assert.match(preview, /className="ml-1"/);
    assert.doesNotMatch(preview, /justify-between|flex-grow|gap-|absolute|{" "}/);
    assert.equal(`${notificationEmojiPlainMention("BlueDibby")} ⚙️`, "@BlueDibby ⚙️");
  });

  it("keeps one in-flow glyph and one native input", () => {
    assert.equal(rowSrc.split('data-testid="settings-notification-emoji-glyph"').length - 1, 1);
    assert.equal(rowSrc.split("<input").length - 1, 1);
    assert.match(rowSrc, /inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden/);
    assert.match(rowSrc, /flex items-center justify-center text-\[22px\] leading-none/);
    const glyphAt = rowSrc.indexOf("settings-notification-emoji-glyph");
    const glyphClass = rowSrc.slice(Math.max(0, glyphAt - 240), glyphAt);
    assert.doesNotMatch(glyphClass, /absolute|inset-|translate-|transform|-m-|left-|top-/);
    const inputAt = rowSrc.indexOf("input-notification-emoji-native");
    const inputClass = rowSrc.slice(inputAt, inputAt + 280);
    assert.match(inputClass, /absolute inset-0 h-full w-full/);
    assert.match(inputClass, /opacity-0/);
    assert.match(inputClass, /text-transparent/);
    assert.match(inputClass, /caret-transparent/);
    assert.match(inputClass, /\[-webkit-text-fill-color:transparent\]/);
    assert.match(rowSrc, /clearInput\(\);\s*const emoji = notificationEmojiInputDecision\(raw\);\s*if \(!emoji\) return;/);
    assert.match(rowSrc, /PATCH", "\/api\/user\/notification-emoji"/);
    assert.match(rowSrc, /void persist\(null\)/);
    assert.match(rowSrc, /inputRef\.current\.value = ""/);
    assert.doesNotMatch(rowSrc, /parsedSaved|selectedEmoji|previewEmoji|notification-emoji-picker|>\s*Save\s*</);
  });

  it("locks without an input and keeps the lock beside the button", () => {
    const elseAt = rowSrc.indexOf(") : (");
    const previewAt = rowSrc.indexOf('data-testid="settings-notification-emoji-preview"');
    const locked = rowSrc.slice(elseAt, previewAt);
    assert.doesNotMatch(locked, /<input/);
    assert.match(locked, /button-notification-emoji-upgrade/);
    assert.match(locked, /source: "notification_emoji"/);
    const buttonClose = locked.indexOf("</button>");
    const lockAt = locked.indexOf("<Lock");
    assert.ok(buttonClose > 0 && lockAt > buttonClose);
    assert.match(NOTIFICATION_EMOJI_GLYPH_STYLE.fontFamily, /Apple Color Emoji/);
    assert.match(NOTIFICATION_EMOJI_GLYPH_STYLE.fontFamily, /Segoe UI Emoji/);
    assert.match(NOTIFICATION_EMOJI_GLYPH_STYLE.fontFamily, /Noto Color Emoji/);
  });
});
