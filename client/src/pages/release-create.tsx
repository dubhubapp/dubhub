import { useState, useRef, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useUser } from "@/lib/user-context";
import { apiRequest } from "@/lib/queryClient";
import { ApiRequestError } from "@/lib/apiDiagnostics";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";
import { scheduleHomeWidgetRefreshAfterAuth } from "@/lib/home-widget-refresh";
import {
  availablePlatformOptions,
  draftHasDuplicatePlatforms,
  normalizePlatformForApi,
} from "@/lib/platforms";
import { INPUT_LIMITS } from "@shared/input-limits";
import { apiUrl } from "@/lib/apiBase";
import { playSuccessNotification } from "@/lib/haptic";
import { SwipeBackPage } from "@/components/swipe-back-page";
import { useIosKeyboardResizeNone } from "@/lib/use-ios-keyboard-resize-none";
import { useIosKeyboardAwareScroll } from "@/lib/use-ios-keyboard-aware-scroll";
import { ReleaseFormHero } from "@/components/release-form-hero";
import { ReleaseTitleSheet } from "@/components/release-title-sheet";
import { ReleaseScheduleSheet } from "@/components/release-schedule-sheet";
import { ReleaseToolsManagementRow } from "@/components/release-tools-management-row";
import { ReleaseLinksSheet } from "@/components/release-links-sheet";
import { ReleaseCollaboratorsSheet } from "@/components/release-collaborators-sheet";
import { buildDraftScheduleHeroSummary } from "@/lib/release-form-hero-schedule";
import { formatReleaseLinksRowSummary } from "@/lib/release-tools-links-summary";
import { RELEASE_TOOLS_SECTION_TITLE } from "@/lib/release-tools-section-title";
import { formatReleaseCollaboratorsRowSummary } from "@/lib/release-tools-collaborators-summary";
import { ReleaseCollaboratorsRowIcon } from "@/lib/release-collaborators-row-icon";
import {
  applyCreateDiscardChoice,
  createBackDecision,
  hasUnsavedReleaseDraft,
} from "@/lib/release-create-dirty";
import {
  CREATE_WITHOUT_POSTS_BACK,
  CREATE_WITHOUT_POSTS_BODY,
  CREATE_WITHOUT_POSTS_CONFIRM,
  CREATE_WITHOUT_POSTS_TITLE,
  nextReleaseCreateSubmitStep,
} from "@/lib/release-create-zero-posts";
import {
  buildReleaseTimingRequestFields,
  defaultMidnightDraft,
  type ReleaseTimingDraft,
} from "@/lib/release-timing-draft";
import { releaseTimingApiErrorToast } from "@/lib/release-timing-api-error";
import {
  ReleaseAttachPostsSection,
  type EligiblePostForAttach,
} from "@/components/release-attach-posts-section";
import { filterEligiblePostsForAttachSearch } from "@/lib/release-attach-clips-overview";
import {
  RELEASE_CREATION_CAPACITY_QUERY_KEY,
  RELEASE_LIMIT_REACHED_TOAST,
  UPGRADE_PLACEHOLDER_HINT,
  isFreeReleaseLimitReachedError,
  parseReleaseCreationCapacity,
  resolveCreateReleaseBottomCapacity,
} from "@/lib/release-creation-capacity";
import { resolveFreeQuotaNoticeProminence } from "@/lib/release-form-limit-prominence";
import {
  ATTACHMENT_ALLOWANCE_QUERY_KEY,
  ATTACHMENT_LIMIT_TOAST,
  isFreeAttachmentLimitReachedError,
  maxSelectableAttachments,
  parseAttachmentAllowance,
} from "@/lib/release-attachment-limit";
import { buildLinkTypeOptions } from "@/components/release-link-type-select";
import { requestVerifiedArtistToolsUpgrade } from "@/lib/verified-artist-tools-upgrade";
import { scheduleReleaseLinksUpgrade } from "@/lib/release-links-upgrade-flow";
import { isVerifiedArtistToolsPaywallEnabled } from "@/lib/verified-artist-tools-paywall-flag";
import {
  FREE_RELEASE_LINK_LIMIT,
  LINK_ALLOWANCE_QUERY_KEY,
  LINK_LIMIT_TOAST,
  PAID_LINK_TYPE_TOAST,
  INVALID_RELEASE_LINK_TYPE_TOAST,
  canAddLinkToDraft,
  isFreeLinkLimitReachedError,
  isInvalidReleaseLinkTypeError,
  isPaidLinkTypeRequiredError,
  isPaidOnlyReleaseLink,
  parseLinkAllowance,
  resolveLinkLimitCardCopy,
} from "@/lib/release-link-limit";
import { isReleaseUpcomingFromTiming } from "@/lib/release-status";
import {
  type CanonicalLinkPurpose,
  defaultPurposeForNewDraft,
  supportedPurposesForPlatform,
} from "@shared/release-link-platforms";

export default function ReleaseCreate() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentUser, userType } = useUser();
  const releaseCreateHapticFiredRef = useRef(false);
  const [title, setTitle] = useState("");
  const [releaseDate, setReleaseDate] = useState("");
  const [comingSoon, setComingSoon] = useState(false);
  const [timingDraft, setTimingDraft] = useState<ReleaseTimingDraft>(() =>
    defaultMidnightDraft(),
  );
  const [artworkPath, setArtworkPath] = useState<string | null>(null);
  const [artworkPreviewUrl, setArtworkPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [linkPlatform, setLinkPlatform] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkPurpose, setLinkPurpose] = useState<CanonicalLinkPurpose>("listen");
  const [purposeTouched, setPurposeTouched] = useState(false);
  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [draftLinks, setDraftLinks] = useState<
    { platform: string; url: string; linkType?: string | null }[]
  >([]);
  const [saving, setSaving] = useState(false);
  const [stagedCollaborators, setStagedCollaborators] = useState<{ id: string; username: string }[]>([]);
  const [collabSearch, setCollabSearch] = useState("");
  const [titleSheetOpen, setTitleSheetOpen] = useState(false);
  const [scheduleSheetOpen, setScheduleSheetOpen] = useState(false);
  const [linksSheetOpen, setLinksSheetOpen] = useState(false);
  const [collaboratorsSheetOpen, setCollaboratorsSheetOpen] = useState(false);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [zeroPostConfirmOpen, setZeroPostConfirmOpen] = useState(false);
  const createSubmitStartedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const navigateToReleases = () => navigate("/releases");
  const isDirty = hasUnsavedReleaseDraft({
    title,
    artworkPath,
    comingSoon,
    releaseDate,
    timingDraft,
    draftLinksCount: draftLinks.length,
    stagedCollaboratorsCount: stagedCollaborators.length,
    selectedPostIdsCount: selectedPostIds.length,
  });
  const handleBack = () => {
    if (createBackDecision(isDirty) === "confirm") {
      setDiscardDialogOpen(true);
      return;
    }
    navigateToReleases();
  };
  const handleDiscardConfirm = () => {
    setDiscardDialogOpen(false);
    if (applyCreateDiscardChoice("discard") === "navigate") {
      navigateToReleases();
    }
  };
  useIosKeyboardResizeNone(true);
  const { isNativeIos, keyboardHeight, prefersReducedMotion } = useIosKeyboardAwareScroll({
    enabled: true,
    scrollContainerRef,
  });

  const capacityQuery = useQuery({
    queryKey: [...RELEASE_CREATION_CAPACITY_QUERY_KEY],
    enabled: !!currentUser?.id && userType === "artist",
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/releases/creation-capacity");
      const json = await res.json();
      const parsed = parseReleaseCreationCapacity(json);
      if (!parsed) throw new Error("Invalid release capacity response");
      return parsed;
    },
  });

  const createLocked =
    capacityQuery.data != null && capacityQuery.data.canCreate === false;
  const createBottomCapacity = resolveCreateReleaseBottomCapacity(
    capacityQuery.data,
  );

  const handleUpgrade = (source: "release_limit" | "attachment_limit" | "link_limit") => {
    if (source === "link_limit") {
      scheduleReleaseLinksUpgrade({
        suspendLinks: () => setLinksSheetOpen(false),
        restoreLinks: () => setLinksSheetOpen(true),
        openUpgrade: (onDismissed) => {
          requestVerifiedArtistToolsUpgrade(toast, { source, onDismissed });
        },
      });
      return;
    }
    requestVerifiedArtistToolsUpgrade(toast, { source });
  };

  const openLinksPremiumUpgrade = (args: {
    platform: string;
    requestedLinkType: string;
  }) => {
    scheduleReleaseLinksUpgrade({
      suspendLinks: () => setLinksSheetOpen(false),
      restoreLinks: () => setLinksSheetOpen(true),
      openUpgrade: (onDismissed) => {
        requestVerifiedArtistToolsUpgrade(toast, {
          source: "release_link_presave",
          platform: args.platform,
          requestedLinkType: args.requestedLinkType,
          onDismissed,
        });
      },
    });
  };

  const attachmentAllowanceQuery = useQuery({
    queryKey: [...ATTACHMENT_ALLOWANCE_QUERY_KEY],
    enabled: !!currentUser?.id && userType === "artist",
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/artists/me/release-attachment-allowance");
      const json = await res.json();
      const parsed = parseAttachmentAllowance(json);
      if (!parsed) throw new Error("Invalid attachment allowance response");
      return parsed;
    },
  });

  const linkAllowanceQuery = useQuery({
    queryKey: [...LINK_ALLOWANCE_QUERY_KEY],
    enabled: !!currentUser?.id && userType === "artist",
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/artists/me/release-link-allowance");
      const json = await res.json();
      const parsed = parseLinkAllowance(json);
      if (!parsed) throw new Error("Invalid link allowance response");
      return parsed;
    },
  });

  const attachmentMaxSelectable = attachmentAllowanceQuery.data
    ? maxSelectableAttachments({
        unlimited: attachmentAllowanceQuery.data.unlimited,
        limit: attachmentAllowanceQuery.data.limit,
      })
    : null;
  const showAttachmentUpgrade =
    attachmentAllowanceQuery.data != null &&
    attachmentAllowanceQuery.data.unlimited === false &&
    selectedPostIds.length >= (attachmentAllowanceQuery.data.limit ?? 3);

  const linkUnlimited = linkAllowanceQuery.data?.unlimited === true;
  const canAddDraftLink = canAddLinkToDraft({
    unlimited: linkAllowanceQuery.data?.unlimited ?? false,
    draftCount: draftLinks.length,
    limit: linkAllowanceQuery.data?.limit ?? FREE_RELEASE_LINK_LIMIT,
  });
  const linkCardCopy = resolveLinkLimitCardCopy({
    unlimited: linkUnlimited,
    used: draftLinks.length,
    limit: linkAllowanceQuery.data?.limit ?? FREE_RELEASE_LINK_LIMIT,
  });
  const showLinkUpgrade =
    linkAllowanceQuery.data != null &&
    linkAllowanceQuery.data.unlimited === false;
  const linkLimitProminence = resolveFreeQuotaNoticeProminence({
    unlimited: linkUnlimited,
    used: draftLinks.length,
    limit: linkAllowanceQuery.data?.limit ?? FREE_RELEASE_LINK_LIMIT,
  });
  const releaseIsUpcoming = isReleaseUpcomingFromTiming({
    isComingSoon: comingSoon,
    releaseDate: releaseDate || null,
    releaseTimingMode: timingDraft.mode,
  });
  const showFutureListenGuidance =
    !linkUnlimited &&
    releaseIsUpcoming &&
    draftLinks.some((l) => !isPaidOnlyReleaseLink(l.platform, l.linkType));
  const platformChoices = useMemo(
    () => availablePlatformOptions(draftLinks.map((l) => l.platform)),
    [draftLinks],
  );
  const heroSchedule = useMemo(
    () =>
      buildDraftScheduleHeroSummary({
        comingSoon,
        releaseDateYmd: releaseDate,
        timingDraft,
      }),
    [comingSoon, releaseDate, timingDraft],
  );
  const heroArtworkUrl = useMemo(() => {
    if (artworkPreviewUrl) return artworkPreviewUrl;
    if (!artworkPath) return null;
    if (artworkPath.startsWith("http")) return artworkPath;
    return supabase.storage.from("release-artworks").getPublicUrl(artworkPath).data
      .publicUrl;
  }, [artworkPreviewUrl, artworkPath]);
  const linkTypeOptions = useMemo(() => {
    if (!linkPlatform) return [];
    return buildLinkTypeOptions({
      platform: linkPlatform,
      supported: supportedPurposesForPlatform(linkPlatform),
      unlimited: linkUnlimited,
    });
  }, [linkPlatform, linkUnlimited]);

  const applyPlatformDefaultPurpose = (platform: string) => {
    const next = defaultPurposeForNewDraft({
      platform,
      isUpcoming: releaseIsUpcoming,
      unlimited: linkUnlimited,
    });
    setLinkPurpose(next);
    setPurposeTouched(false);
  };

  const handleAddDraftLink = () => {
    if (!linkPlatform || !linkUrl.trim()) return;
    if (!canAddDraftLink) {
      toast({
        title: LINK_LIMIT_TOAST.title,
        description: LINK_LIMIT_TOAST.body,
        variant: "destructive",
      });
      return;
    }
    if (
      draftLinks.some(
        (l) =>
          normalizePlatformForApi(l.platform) ===
          normalizePlatformForApi(linkPlatform),
      )
    ) {
      toast({
        title: "Platform already added",
        description: "Each platform can only be added once per release.",
        variant: "destructive",
      });
      return;
    }
    const unlocked = linkTypeOptions.filter((o) => !o.locked).map((o) => o.purpose);
    const purpose = unlocked.includes(linkPurpose)
      ? linkPurpose
      : (unlocked[0] ?? "listen");
    if (isPaidOnlyReleaseLink(linkPlatform, purpose)) {
      openLinksPremiumUpgrade({
        platform: linkPlatform,
        requestedLinkType: purpose,
      });
      return;
    }
    setDraftLinks((links) => [
      ...links,
      {
        platform: linkPlatform,
        url: linkUrl.trim(),
        linkType: purpose === "listen" ? null : purpose,
      },
    ]);
    setLinkPlatform("");
    setLinkUrl("");
    setLinkPurpose("listen");
    setPurposeTouched(false);
  };

  const { data: verifiedArtists = [] } = useQuery({
    queryKey: ["/api/artists/verified", collabSearch],
    queryFn: async () => {
      const url = collabSearch
        ? `/api/artists/verified?search=${encodeURIComponent(collabSearch)}`
        : "/api/artists/verified";
      const res = await fetch(apiUrl(url));
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!currentUser?.id && userType === "artist",
  });

  const { data: eligiblePosts = [] } = useQuery({
    queryKey: ["/api/posts/eligible-for-release"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return [];
      const res = await fetch(apiUrl("/api/posts/eligible-for-release"), {
        headers: { Authorization: `Bearer ${session.access_token}` },
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!currentUser?.id && userType === "artist",
  });

  const filteredEligiblePosts = useMemo(
    () =>
      filterEligiblePostsForAttachSearch(
        (eligiblePosts as EligiblePostForAttach[]) || [],
        searchTerm,
      ),
    [eligiblePosts, searchTerm],
  );

  const handleArtworkChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setArtworkPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not signed in");
      const form = new FormData();
      form.append("artwork", file);
      const res = await fetch(apiUrl("/api/releases/upload-artwork"), {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form,
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Upload failed");
      }
      const json = await res.json();
      setArtworkPath(json.path ?? null);
    } catch (err) {
      toast({ title: "Artwork upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => () => {
    if (artworkPreviewUrl) URL.revokeObjectURL(artworkPreviewUrl);
  }, [artworkPreviewUrl]);

  async function attachPostsWithAuth(releaseId: string, postIds: string[]) {
    if (postIds.length === 0) return;
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
    const res = await fetch(apiUrl(`/api/releases/${releaseId}/attach-posts`), {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify({ post_ids: postIds }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.code === "FREE_ATTACHMENT_LIMIT_REACHED") {
        toast({
          title: ATTACHMENT_LIMIT_TOAST.title,
          description: ATTACHMENT_LIMIT_TOAST.body,
          variant: "destructive",
        });
        void queryClient.invalidateQueries({ queryKey: [...ATTACHMENT_ALLOWANCE_QUERY_KEY] });
        throw new Error(ATTACHMENT_LIMIT_TOAST.body);
      }
      toast({
        title: "Attach failed",
        description: data.message || "Failed to attach posts",
        variant: "destructive",
      });
      throw new Error(data.message || "Failed to attach posts");
    }
  }

  const submitCreatedRelease = async () => {
    if (createLocked || createSubmitStartedRef.current) return;
    const timingFields = buildReleaseTimingRequestFields({
      comingSoon,
      releaseDateYmd: releaseDate,
      draft: timingDraft,
    });
    if ("error" in timingFields) {
      toast({ title: timingFields.error, variant: "destructive" });
      return;
    }
    createSubmitStartedRef.current = true;
    setSaving(true);
    try {
      console.log("[ReleaseCreate] Creating release", {
        title: title.trim(),
        releaseDate,
        selectedPostIds,
        linkCount: draftLinks.length,
        timingMode: timingFields.release_timing_mode,
      });
      const res = await apiRequest("POST", "/api/releases", {
        title: title.trim(),
        release_date: comingSoon ? null : releaseDate,
        artwork_url: artworkPath || undefined,
        is_coming_soon: comingSoon,
        ...timingFields,
      });
      const data = await res.json();
      const releaseId = (data.id ?? data.release_id) as string;
      if (process.env.NODE_ENV === "development") {
        console.log("[ReleaseCreate] Release created, id:", releaseId, "response keys:", Object.keys(data));
      }
      if (!releaseId) {
        toast({ title: "Release created but could not get release ID", variant: "destructive" });
        return;
      }

      // 2) Collaborators: invite each staged artist (using single invite endpoint)
      if (stagedCollaborators.length > 0) {
        let inviteFailures = 0;
        for (const c of stagedCollaborators) {
          try {
            if (process.env.NODE_ENV === "development") {
              console.log("[ReleaseCreate] Inviting collaborator:", c.id, "@" + c.username, "to release", releaseId, "POST /api/releases/" + releaseId + "/collaborators/invite");
            }
            await apiRequest("POST", `/api/releases/${releaseId}/collaborators/invite`, {
              artist_id: c.id,
            });
          } catch (e) {
            inviteFailures++;
            if (process.env.NODE_ENV === "development") {
              console.warn("[ReleaseCreate] Invite failed for", c.id, e);
            }
          }
        }
        if (inviteFailures > 0) {
          toast({
            title: "Release created, but collaborator invites failed.",
            description: "You can retry inviting from the release edit page.",
            variant: "destructive",
          });
          void queryClient.invalidateQueries({ queryKey: [...RELEASE_CREATION_CAPACITY_QUERY_KEY] });
          navigate(`/releases/${releaseId}/edit`);
          return;
        }
        if (process.env.NODE_ENV === "development") {
          console.log("[ReleaseCreate] Collaborators invited", { releaseId, count: stagedCollaborators.length });
        }
      }

      // 3) Links
      for (const link of draftLinks) {
        await apiRequest("POST", `/api/releases/${releaseId}/links`, {
          platform: normalizePlatformForApi(link.platform),
          url: link.url.trim(),
          link_type: link.linkType ?? null,
        });
      }
      console.log("[ReleaseCreate] Links saved", { releaseId, saved: draftLinks.length });

      // 4) Attachments
      if (selectedPostIds.length > 0) {
        await attachPostsWithAuth(releaseId, selectedPostIds);
        console.log("[ReleaseCreate] Attached posts", { releaseId, attached: selectedPostIds });
      }

      await queryClient.removeQueries({ queryKey: ["/api/releases/feed"] });
      await queryClient.invalidateQueries({ queryKey: [...RELEASE_CREATION_CAPACITY_QUERY_KEY] });
      if (process.env.NODE_ENV === "development") {
        console.log("[ReleaseCreate] Success: created release", releaseId, "removed feed cache");
      }

      if (!releaseCreateHapticFiredRef.current) {
        playSuccessNotification();
        releaseCreateHapticFiredRef.current = true;
      }
      toast({ title: "Release created" });
      scheduleHomeWidgetRefreshAfterAuth();
      navigate("/releases");
    } catch (error) {
      console.error("[ReleaseCreate] Create failed", error);
      const timingToast = releaseTimingApiErrorToast(error);
      if (timingToast) {
        toast({
          title: timingToast.title,
          description: timingToast.description,
          variant: "destructive",
        });
        return;
      }
      if (isFreeReleaseLimitReachedError(error)) {
        // Preserve entered form data; never surface raw 403 / JSON / codes.
        toast({
          title: RELEASE_LIMIT_REACHED_TOAST.title,
          description: RELEASE_LIMIT_REACHED_TOAST.body,
          variant: "destructive",
        });
        void queryClient.invalidateQueries({ queryKey: [...RELEASE_CREATION_CAPACITY_QUERY_KEY] });
        return;
      }
      if (isFreeLinkLimitReachedError(error)) {
        toast({
          title: LINK_LIMIT_TOAST.title,
          description: LINK_LIMIT_TOAST.body,
          variant: "destructive",
        });
        void queryClient.invalidateQueries({ queryKey: [...LINK_ALLOWANCE_QUERY_KEY] });
        return;
      }
      if (isPaidLinkTypeRequiredError(error)) {
        toast({
          title: PAID_LINK_TYPE_TOAST.title,
          description: PAID_LINK_TYPE_TOAST.body,
          variant: "destructive",
        });
        void queryClient.invalidateQueries({ queryKey: [...LINK_ALLOWANCE_QUERY_KEY] });
        return;
      }
      if (isInvalidReleaseLinkTypeError(error)) {
        toast({
          title: INVALID_RELEASE_LINK_TYPE_TOAST.title,
          description: INVALID_RELEASE_LINK_TYPE_TOAST.body,
          variant: "destructive",
        });
        return;
      }
      if (isFreeAttachmentLimitReachedError(error)) {
        toast({
          title: ATTACHMENT_LIMIT_TOAST.title,
          description: ATTACHMENT_LIMIT_TOAST.body,
          variant: "destructive",
        });
        void queryClient.invalidateQueries({ queryKey: [...ATTACHMENT_ALLOWANCE_QUERY_KEY] });
        return;
      }
      toast({
        title: "Failed to create release",
        description:
          error instanceof ApiRequestError
            ? "Something went wrong. Please try again."
            : error instanceof Error
              ? error.message
              : "Unknown error",
        variant: "destructive",
      });
    } finally {
      createSubmitStartedRef.current = false;
      setSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (createLocked || saving) return;
    releaseCreateHapticFiredRef.current = false;
    if (!title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    if (title.trim().length > INPUT_LIMITS.releaseTitle) {
      toast({
        title: `Title must be at most ${INPUT_LIMITS.releaseTitle} characters`,
        variant: "destructive",
      });
      return;
    }
    if (!comingSoon && !releaseDate) {
      toast({ title: "Release date is required for scheduled releases", variant: "destructive" });
      return;
    }
    const timingFields = buildReleaseTimingRequestFields({
      comingSoon,
      releaseDateYmd: releaseDate,
      draft: timingDraft,
    });
    if ("error" in timingFields) {
      toast({ title: timingFields.error, variant: "destructive" });
      return;
    }
    if (draftHasDuplicatePlatforms(draftLinks)) {
      toast({
        title: "Duplicate platforms",
        description: "Each platform can only be added once per release.",
        variant: "destructive",
      });
      return;
    }
    const submitStep = nextReleaseCreateSubmitStep({
      isCreate: true,
      formValid: true,
      selectedPostIdsCount: selectedPostIds.length,
    });
    if (submitStep === "confirm-zero-posts") {
      setZeroPostConfirmOpen(true);
      return;
    }
    await submitCreatedRelease();
  };

  if (userType !== "artist" || !currentUser) {
    navigate("/releases");
    return null;
  }

  return (
    <SwipeBackPage
      enabled={false}
      onBack={handleBack}
      className="flex-1 min-h-0 bg-background overflow-x-hidden overflow-y-auto overscroll-x-none pb-[clamp(0.75rem,2.5vw,1rem)]"
    >
      <div
        ref={scrollContainerRef}
        className="min-h-full min-w-0 max-w-full overflow-x-hidden"
        style={{
          WebkitOverflowScrolling: "touch",
          transition:
            isNativeIos && !prefersReducedMotion
              ? "padding-bottom 300ms ease-in-out"
              : undefined,
          paddingBottom:
            isNativeIos && keyboardHeight > 0
              ? `calc(${keyboardHeight}px + env(safe-area-inset-bottom, 0px) + 1rem)`
              : undefined,
        }}
      >
      <div className="app-page-top-pad px-4 pb-4 max-w-md mx-auto min-w-0 w-full">
        <Button variant="ghost" size="sm" className="mb-4 -ml-1" onClick={handleBack}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        <h1 className="text-xl font-bold mb-4">Add Release</h1>

        <form onSubmit={handleSubmit} className="space-y-8">
          <section className="space-y-4" aria-labelledby="release-create-core-heading">
            <h2 id="release-create-core-heading" className="sr-only">
              Release
            </h2>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleArtworkChange}
            />
            <ReleaseFormHero
              artworkUrl={heroArtworkUrl}
              uploading={uploading}
              onArtworkPress={() => fileInputRef.current?.click()}
              title={title}
              titleEditable
              onTitlePress={() => setTitleSheetOpen(true)}
              schedule={heroSchedule}
              onSchedulePress={() => setScheduleSheetOpen(true)}
            />
            <ReleaseTitleSheet
              open={titleSheetOpen}
              onOpenChange={setTitleSheetOpen}
              value={title}
              onChange={setTitle}
            />
            <ReleaseScheduleSheet
              open={scheduleSheetOpen}
              onOpenChange={setScheduleSheetOpen}
              comingSoon={comingSoon}
              onComingSoonChange={setComingSoon}
              releaseDate={releaseDate}
              onReleaseDateChange={setReleaseDate}
              timingDraft={timingDraft}
              onTimingDraftChange={setTimingDraft}
            />
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">
              {RELEASE_TOOLS_SECTION_TITLE}
            </h2>
            <div className="min-w-0">
              <ReleaseToolsManagementRow
                label="Links"
                icon={LinkIcon}
                summary={formatReleaseLinksRowSummary(draftLinks)}
                onClick={() => setLinksSheetOpen(true)}
                testId="release-tools-links-row"
              />
              <ReleaseToolsManagementRow
                label="Collaborators"
                icon={ReleaseCollaboratorsRowIcon}
                summary={formatReleaseCollaboratorsRowSummary({
                  existing: [],
                  staged: stagedCollaborators,
                })}
                onClick={() => setCollaboratorsSheetOpen(true)}
                testId="release-tools-collaborators-row"
              />
              <ReleaseAttachPostsSection
                eligiblePosts={(eligiblePosts as EligiblePostForAttach[]) || []}
                filteredEligiblePosts={filteredEligiblePosts}
                selectedPostIds={selectedPostIds}
                onSelectedPostIdsChange={setSelectedPostIds}
                searchTerm={searchTerm}
                onSearchTermChange={setSearchTerm}
                maxSelectable={attachmentMaxSelectable}
                attachmentUsage={
                  attachmentAllowanceQuery.data && !attachmentAllowanceQuery.data.unlimited
                    ? {
                        used: selectedPostIds.length,
                        limit: attachmentAllowanceQuery.data.limit,
                      }
                    : null
                }
                attachmentLimitNotice={
                  attachmentAllowanceQuery.data && !attachmentAllowanceQuery.data.unlimited
                    ? undefined
                    : null
                }
                showUpgradeCta={showAttachmentUpgrade}
                onUpgradeClick={(onDismissed) => {
                  requestVerifiedArtistToolsUpgrade(toast, {
                    source: "attachment_limit",
                    onDismissed,
                  });
                }}
              />
            </div>
            <ReleaseLinksSheet
              open={linksSheetOpen}
              onOpenChange={setLinksSheetOpen}
              draftLinks={draftLinks}
              onRemoveLink={(link) =>
                setDraftLinks((links) =>
                  links.filter(
                    (l) => !(l.platform === link.platform && l.url === link.url),
                  ),
                )
              }
              linkPlatform={linkPlatform}
              onLinkPlatformChange={(nextPlatform) => {
                setLinkPlatform(nextPlatform);
                if (
                  !purposeTouched ||
                  !supportedPurposesForPlatform(nextPlatform).includes(linkPurpose)
                ) {
                  applyPlatformDefaultPurpose(nextPlatform);
                }
              }}
              linkPurpose={linkPurpose}
              onLinkPurposeChange={(next) => {
                setLinkPurpose(next);
                setPurposeTouched(true);
              }}
              onLockedPurposeSelect={(requested) => {
                openLinksPremiumUpgrade({
                  platform: linkPlatform,
                  requestedLinkType: requested,
                });
              }}
              linkUrl={linkUrl}
              onLinkUrlChange={setLinkUrl}
              platformChoices={platformChoices}
              linkTypeOptions={linkTypeOptions}
              canAddDraftLink={canAddDraftLink}
              onAddLink={handleAddDraftLink}
              limitNotice={{
                show: !!linkAllowanceQuery.data && linkLimitProminence !== "hidden",
                prominence: linkLimitProminence,
                title: linkCardCopy.title,
                body: linkCardCopy.body,
                showUpgrade: showLinkUpgrade,
                onUpgradeClick: () => handleUpgrade("link_limit"),
              }}
              showFutureListenGuidance={showFutureListenGuidance}
            />
            <ReleaseCollaboratorsSheet
              open={collaboratorsSheetOpen}
              onOpenChange={setCollaboratorsSheetOpen}
              existingCollaborators={[]}
              stagedCollaborators={stagedCollaborators}
              invitesLocked={false}
              collabSearch={collabSearch}
              onCollabSearchChange={setCollabSearch}
              searchResults={verifiedArtists as { id: string; username: string }[]}
              onStageCollaborator={(artist) => {
                if (stagedCollaborators.length >= 4) return;
                setStagedCollaborators((prev) =>
                  prev.some((p) => p.id === artist.id)
                    ? prev
                    : [...prev, { id: artist.id, username: artist.username }],
                );
                setCollabSearch("");
              }}
              onUnstageCollaborator={(id) =>
                setStagedCollaborators((prev) => prev.filter((p) => p.id !== id))
              }
              currentUserId={currentUser?.id}
            />
          </section>

          <div className="pt-2 pb-8 space-y-2">
            {createBottomCapacity.countLabel ? (
              <p
                className="text-xs text-muted-foreground text-center"
                data-testid="release-create-capacity-count"
                role="status"
              >
                {createBottomCapacity.countLabel}
              </p>
            ) : null}
            {createLocked ? (
              <>
                <Button
                  type="button"
                  disabled
                  className="w-full"
                  data-testid="release-create-submit-locked"
                >
                  Create Release
                </Button>
                {createBottomCapacity.showUpgrade ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => handleUpgrade("release_limit")}
                    data-testid="release-create-upgrade-locked"
                  >
                    {createBottomCapacity.upgradeLabel}
                  </Button>
                ) : null}
                {!isVerifiedArtistToolsPaywallEnabled() ? (
                  <p className="text-[10px] text-center text-muted-foreground">
                    {UPGRADE_PLACEHOLDER_HINT}
                  </p>
                ) : null}
              </>
            ) : (
              <Button
                type="submit"
                disabled={saving || capacityQuery.isLoading}
                className="w-full"
                data-testid="release-create-submit"
              >
                {saving ? "Creating…" : "Create Release"}
              </Button>
            )}
          </div>
        </form>
      </div>
      </div>

      <AlertDialog open={zeroPostConfirmOpen} onOpenChange={setZeroPostConfirmOpen}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{CREATE_WITHOUT_POSTS_TITLE}</AlertDialogTitle>
            <AlertDialogDescription>
              {CREATE_WITHOUT_POSTS_BODY}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={saving}
              data-testid="release-create-zero-posts-back"
            >
              {CREATE_WITHOUT_POSTS_BACK}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              data-testid="release-create-zero-posts-confirm"
              onClick={(e) => {
                e.preventDefault();
                setZeroPostConfirmOpen(false);
                void submitCreatedRelease();
              }}
            >
              {saving ? "Creating…" : CREATE_WITHOUT_POSTS_CONFIRM}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={discardDialogOpen} onOpenChange={setDiscardDialogOpen}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard release?</AlertDialogTitle>
            <AlertDialogDescription>
              Your changes haven&apos;t been saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                applyCreateDiscardChoice("keep");
              }}
            >
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDiscardConfirm}
              data-testid="release-create-discard-confirm"
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SwipeBackPage>
  );
}
