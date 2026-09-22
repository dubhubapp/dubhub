/**
 * VAT-ANON-3 — anonymous Identified pill + first-login explanation.
 * Presentation contracts only.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ANONYMOUS_IDENTIFIED_A11Y_LABEL,
  ANONYMOUS_IDENTIFIED_ONBOARDING_BODY,
  ANONYMOUS_IDENTIFIED_SUPPORTING_COPY,
  IDENTIFIED_PILL_LABEL,
  postIdentificationPillLabel,
  postIdentificationSupportingCopy,
  resolvePostIdentificationPresentationKind,
} from "./post-identification-status";
import {
  profileGridStatusPillLabel,
  resolveProfileGridStatusPillKind,
} from "./profile-grid-status-pill";

const here = dirname(fileURLToPath(import.meta.url));
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");
const profilePillSrc = readFileSync(
  join(here, "../components/profile-grid-status-pill.tsx"),
  "utf8",
);
const commentsSrc = readFileSync(join(here, "../components/comments-modal.tsx"), "utf8");
const onboardingSrc = readFileSync(
  join(here, "../components/first-login-onboarding-modal.tsx"),
  "utf8",
);

const anonymousPost = {
  id: "16fa999c-b2fe-477b-84d7-f15995e8de97",
  verificationStatus: "identified",
  isArtistVerifiedAnonymous: true,
  isVerifiedArtist: false,
  artistVerifiedBy: null,
};

const publicArtistPost = {
  verificationStatus: "identified",
  isArtistVerifiedAnonymous: false,
  isVerifiedArtist: true,
  artistVerifiedBy: "artist-1",
};

const communityPost = {
  verificationStatus: "community",
  isArtistVerifiedAnonymous: false,
  isVerifiedArtist: false,
  artistVerifiedBy: null,
};

const unidentifiedPost = {
  verificationStatus: "unverified",
  isArtistVerifiedAnonymous: false,
  isVerifiedArtist: false,
  artistVerifiedBy: null,
};

describe("VAT-ANON-3 presentation resolver", () => {
  it("anonymous identified takes precedence and never leaks public artist identity", () => {
    assert.equal(
      resolvePostIdentificationPresentationKind(anonymousPost),
      "artist_verified_anonymous",
    );
    assert.equal(
      resolvePostIdentificationPresentationKind({
        ...anonymousPost,
        isVerifiedArtist: true,
        artistVerifiedBy: "should-not-win",
      }),
      "artist_verified_anonymous",
    );
    assert.equal(postIdentificationPillLabel("artist_verified_anonymous"), IDENTIFIED_PILL_LABEL);
    assert.equal(
      postIdentificationSupportingCopy("artist_verified_anonymous"),
      ANONYMOUS_IDENTIFIED_SUPPORTING_COPY,
    );
    assert.equal(ANONYMOUS_IDENTIFIED_SUPPORTING_COPY, "artist verified · identity hidden");
    assert.match(ANONYMOUS_IDENTIFIED_A11Y_LABEL, /identity hidden/i);
    assert.doesNotMatch(ANONYMOUS_IDENTIFIED_SUPPORTING_COPY, /community|secret|hidden artist/i);
  });

  it("keeps public artist / community / unidentified treatments unchanged", () => {
    assert.equal(
      resolvePostIdentificationPresentationKind(publicArtistPost),
      "artist_verified",
    );
    assert.equal(resolvePostIdentificationPresentationKind(communityPost), "community");
    assert.equal(
      resolvePostIdentificationPresentationKind(unidentifiedPost),
      "unidentified",
    );
    assert.equal(postIdentificationPillLabel("unidentified"), "Unidentified");
    assert.equal(postIdentificationSupportingCopy("artist_verified"), null);
    assert.equal(postIdentificationSupportingCopy("community"), null);
  });

  it("profile grid maps anonymous to Identified (not Unidentified / community)", () => {
    assert.equal(
      resolveProfileGridStatusPillKind(anonymousPost),
      "artist_verified_anonymous",
    );
    assert.equal(profileGridStatusPillLabel("artist_verified_anonymous"), "Identified");
    assert.equal(resolveProfileGridStatusPillKind(publicArtistPost), "artist_identified");
    assert.equal(resolveProfileGridStatusPillKind(communityPost), "community");
    assert.equal(resolveProfileGridStatusPillKind(unidentifiedPost), "unidentified");
  });
});

describe("VAT-ANON-3 surface wiring", () => {
  it("Home VideoCard renders Identified + EyeOff without feed supporting subtext", () => {
    assert.match(videoCardSrc, /EyeOff/);
    assert.match(videoCardSrc, /artist_verified_anonymous/);
    assert.match(videoCardSrc, /badge-artist-verified-anonymous/);
    assert.match(videoCardSrc, /resolvePostIdentificationPresentationKind/);
    assert.doesNotMatch(videoCardSrc, /ANONYMOUS_IDENTIFIED_SUPPORTING_COPY/);
    assert.doesNotMatch(videoCardSrc, /badge-artist-verified-anonymous-supporting/);
    assert.doesNotMatch(videoCardSrc, /artist verified · identity hidden/);
    assert.doesNotMatch(
      videoCardSrc.slice(
        videoCardSrc.indexOf("artist_verified_anonymous"),
        videoCardSrc.indexOf("artist_verified_anonymous") + 500,
      ),
      /GoldVerifiedTick/,
    );
  });

  it("profile grid pill uses EyeOff for anonymous", () => {
    assert.match(profilePillSrc, /EyeOff/);
    assert.match(profilePillSrc, /artist_verified_anonymous/);
    assert.match(profilePillSrc, /ANONYMOUS_IDENTIFIED_A11Y_LABEL/);
  });

  it("comments modal uses shared anonymous Identified treatment", () => {
    assert.match(commentsSrc, /EyeOff/);
    assert.match(commentsSrc, /artist-verified-anonymous/);
    assert.match(commentsSrc, /CommentsPostIdentificationPill/);
  });

  it("first-login onboarding includes anonymous Identified + EyeOff + wording", () => {
    assert.match(onboardingSrc, /EyeOff/);
    assert.match(onboardingSrc, /first-login-anonymous-identified/);
    assert.match(onboardingSrc, /ANONYMOUS_IDENTIFIED_SUPPORTING_COPY/);
    assert.match(onboardingSrc, /ANONYMOUS_IDENTIFIED_ONBOARDING_BODY/);
    assert.equal(
      ANONYMOUS_IDENTIFIED_ONBOARDING_BODY,
      "A verified artist has confirmed the track but chosen to keep their identity hidden for now.",
    );
    assert.doesNotMatch(ANONYMOUS_IDENTIFIED_ONBOARDING_BODY, /more credible|community guess/i);
  });
});
