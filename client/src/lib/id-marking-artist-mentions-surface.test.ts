/**
 * ID-marking family — artist @mention rendering + app-material surface parity.
 * Source-contract tests only; no network / selection-logic changes.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  APP_MATERIAL_OVERLAY_BACKDROP_CLASS,
  APP_MATERIAL_OVERLAY_SURFACE_CLASS,
} from "@/lib/app-material";
import {
  ID_MARKING_DIALOG_CONTENT_CLASS,
  ID_MARKING_DIALOG_OVERLAY_CLASS,
} from "@/components/id-marking-dialog-styles";
import { renderCommentMentionNodes } from "@/lib/comment-mention-render";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

const here = dirname(fileURLToPath(import.meta.url));
const communitySrc = readFileSync(
  join(here, "../components/community-verification-dialog.tsx"),
  "utf8",
);
const artistSrc = readFileSync(
  join(here, "../components/artist-verification-dialog.tsx"),
  "utf8",
);
const moderatorSrc = readFileSync(join(here, "../pages/moderator.tsx"), "utf8");
const stylesSrc = readFileSync(
  join(here, "../components/id-marking-dialog-styles.ts"),
  "utf8",
);
const mentionRenderSrc = readFileSync(
  join(here, "./comment-mention-render.tsx"),
  "utf8",
);

describe("ID-marking artist mentions — CommunityVerificationDialog", () => {
  it("renders comment body via renderCommentMentionNodes (not plain comment.body)", () => {
    assert.match(communitySrc, /from "@\/lib\/comment-mention-render"/);
    assert.match(
      communitySrc,
      /text-white\/92[\s\S]{0,80}renderCommentMentionNodes\(comment\.body, isVerifiedArtistUsername\)/,
    );
    assert.doesNotMatch(
      communitySrc,
      /<p className="break-words text-sm text-white\/92">\{comment\.body\}<\/p>/,
    );
  });

  it("builds verifiedArtistUsernameSet from /api/artists/verified + verified authors + self", () => {
    assert.match(communitySrc, /queryKey:\s*\["\/api\/artists\/verified"\]/);
    assert.match(communitySrc, /verifiedArtistUsernameSet/);
    assert.match(communitySrc, /comment\.user\?\.verified_artist/);
    assert.match(communitySrc, /selfVerifiedArtistUsername/);
    assert.match(communitySrc, /isVerifiedArtistUsername/);
  });

  it("uses UserRoleInlineIcons (GoldVerifiedTick) for verified authors", () => {
    assert.match(communitySrc, /UserRoleInlineIcons/);
    assert.match(
      communitySrc,
      /verifiedArtist=\{comment\.user\.verified_artist === true\}/,
    );
    assert.doesNotMatch(
      communitySrc,
      /comment\.user\.verified_artist && \(\s*<CheckCircle/,
    );
  });

  it("does not change community-verify submit path", () => {
    assert.match(communitySrc, /\/api\/posts\/\$\{postId\}\/community-verify/);
    assert.match(communitySrc, /button-submit-verification/);
    assert.match(communitySrc, /setSelectedCommentId\(trimmed\)/);
  });
});

describe("ID-marking artist mentions — moderator picker parity", () => {
  it("uses the same renderCommentMentionNodes path", () => {
    assert.match(moderatorSrc, /from "@\/lib\/comment-mention-render"/);
    assert.match(
      moderatorSrc,
      /text-white\/92[\s\S]{0,80}renderCommentMentionNodes\(comment\.body, isVerifiedArtistUsername\)/,
    );
    assert.doesNotMatch(
      moderatorSrc,
      /<p className="break-words text-sm text-white\/92">\{comment\.body\}<\/p>/,
    );
  });

  it("reuses /api/artists/verified Set construction", () => {
    assert.match(moderatorSrc, /queryKey:\s*\["\/api\/artists\/verified"\]/);
    assert.match(moderatorSrc, /verifiedArtistUsernameSet/);
    assert.match(moderatorSrc, /isVerifiedArtistUsername/);
  });

  it("uses UserRoleInlineIcons for verified authors in the ID picker", () => {
    assert.match(
      moderatorSrc,
      /UserRoleInlineIcons[\s\S]{0,120}verifiedArtist=\{comment\.user\.verified_artist === true\}/,
    );
  });
});

describe("ID-marking artist mentions — shared renderer semantics", () => {
  it("verified mention gets gold + GoldVerifiedTick; body text stays plain", () => {
    const nodes = renderCommentMentionNodes("@Artist1 is this you?", (u) =>
      u.toLowerCase() === "artist1",
    );
    const html = renderToStaticMarkup(React.createElement(React.Fragment, null, ...nodes));
    assert.match(html, /text-yellow-500/);
    assert.match(html, /@Artist1/);
    assert.match(html, /Verified Artist Profile|title="Verified Artist Profile"/);
    assert.match(html, /is this you\?/);
    assert.doesNotMatch(html, /text-yellow-500[^>]*>is this you/);
  });

  it("non-verified mention inherits body color (text-inherit) without tick", () => {
    const nodes = renderCommentMentionNodes("@Listener1 hello", () => false);
    const html = renderToStaticMarkup(React.createElement(React.Fragment, null, ...nodes));
    assert.match(html, /text-inherit/);
    assert.doesNotMatch(html, /text-yellow-500/);
    assert.doesNotMatch(html, /Verified Artist Profile/);
  });

  it("mention renderer still uses GoldVerifiedTick (canonical tick)", () => {
    assert.match(mentionRenderSrc, /GoldVerifiedTick/);
    assert.match(mentionRenderSrc, /text-\[#FFD700\]/);
  });
});

describe("ID-marking dialog surface — app-material composition", () => {
  it("composes overlay backdrop + overlay surface tokens", () => {
    assert.match(stylesSrc, /APP_MATERIAL_OVERLAY_BACKDROP_CLASS/);
    assert.match(stylesSrc, /APP_MATERIAL_OVERLAY_SURFACE_CLASS/);
    assert.ok(ID_MARKING_DIALOG_OVERLAY_CLASS.includes(APP_MATERIAL_OVERLAY_BACKDROP_CLASS));
    assert.ok(ID_MARKING_DIALOG_CONTENT_CLASS.includes(APP_MATERIAL_OVERLAY_SURFACE_CLASS));
  });

  it("does not reintroduce flat #0f1324 panel or old opaque border/shadow classes", () => {
    assert.doesNotMatch(stylesSrc, /bg-\[#0f1324\]/);
    assert.doesNotMatch(ID_MARKING_DIALOG_CONTENT_CLASS, /bg-\[#0f1324\]/);
    assert.doesNotMatch(ID_MARKING_DIALOG_CONTENT_CLASS, /border-white\/20/);
    assert.doesNotMatch(ID_MARKING_DIALOG_CONTENT_CLASS, /shadow-\[0_20px_60px/);
    assert.doesNotMatch(ID_MARKING_DIALOG_OVERLAY_CLASS, /bg-black\/58/);
  });

  it("preserves z-[120], max-w-[30rem], max-h-[80vh], and entrance animation", () => {
    assert.match(ID_MARKING_DIALOG_OVERLAY_CLASS, /z-\[120\]/);
    assert.match(ID_MARKING_DIALOG_CONTENT_CLASS, /z-\[120\]/);
    assert.match(ID_MARKING_DIALOG_CONTENT_CLASS, /max-w-\[30rem\]/);
    assert.match(ID_MARKING_DIALOG_CONTENT_CLASS, /max-h-\[80vh\]/);
    assert.match(ID_MARKING_DIALOG_CONTENT_CLASS, /overflow-y-auto/);
    assert.match(ID_MARKING_DIALOG_CONTENT_CLASS, /data-\[state=open\]:animate-in/);
    assert.match(ID_MARKING_DIALOG_CONTENT_CLASS, /data-\[state=open\]:zoom-in-95/);
    assert.match(ID_MARKING_DIALOG_CONTENT_CLASS, /motion-reduce:animate-none/);
    assert.doesNotMatch(ID_MARKING_DIALOG_CONTENT_CLASS, /\bmax-w-md\b/);
  });

  it("all three ID-marking consumers still use shared ID_MARKING_* tokens", () => {
    assert.match(communitySrc, /ID_MARKING_DIALOG_CONTENT_CLASS/);
    assert.match(communitySrc, /ID_MARKING_DIALOG_OVERLAY_CLASS/);
    assert.match(artistSrc, /ID_MARKING_DIALOG_CONTENT_CLASS/);
    assert.match(artistSrc, /ID_MARKING_DIALOG_OVERLAY_CLASS/);
    assert.match(moderatorSrc, /ID_MARKING_DIALOG_CONTENT_CLASS/);
    assert.match(moderatorSrc, /ID_MARKING_DIALOG_OVERLAY_CLASS/);
  });
});
