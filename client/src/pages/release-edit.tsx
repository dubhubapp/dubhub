import { useState, useRef, useEffect, useMemo } from "react";
import { useRoute, useLocation, useSearch } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Link as LinkIcon, MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUser } from "@/lib/user-context";
import { apiRequest } from "@/lib/queryClient";
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
import { VinylLoader } from "@/components/ui/vinyl-loader";
import { SwipeBackPage } from "@/components/swipe-back-page";
import { useIosKeyboardResizeNone } from "@/lib/use-ios-keyboard-resize-none";
import { useIosKeyboardAwareScroll } from "@/lib/use-ios-keyboard-aware-scroll";
import { ReleaseFormHero } from "@/components/release-form-hero";
import { ReleaseTitleSheet } from "@/components/release-title-sheet";
import { ReleaseScheduleSheet } from "@/components/release-schedule-sheet";
import { ReleaseToolsManagementRow } from "@/components/release-tools-management-row";
import { ReleaseLinksSheet } from "@/components/release-links-sheet";
import { ReleaseCollaboratorsSheet } from "@/components/release-collaborators-sheet";
import {
  buildReleaseTimingRequestFields,
  defaultMidnightDraft,
  hydrateTimingDraftFromRelease,
  type ReleaseTimingDraft,
} from "@/lib/release-timing-draft";
import {
  buildDraftScheduleHeroSummary,
  buildReleasedScheduleHeroSummary,
} from "@/lib/release-form-hero-schedule";
import { formatReleaseLinksRowSummary } from "@/lib/release-tools-links-summary";
import { RELEASE_TOOLS_SECTION_TITLE } from "@/lib/release-tools-section-title";
import {
  formatReleaseCollaboratorsRowSummary,
  isCollaboratorInviteSetLocked,
} from "@/lib/release-tools-collaborators-summary";
import { ReleaseCollaboratorsRowIcon } from "@/lib/release-collaborators-row-icon";
import { RELEASE_LIVE_ATTACH_NOTICE } from "@/lib/release-attach-post-release";
import { filterEligiblePostsForAttachSearch } from "@/lib/release-attach-clips-overview";
import { resolveFreeQuotaNoticeProminence } from "@/lib/release-form-limit-prominence";
import { releaseTimingApiErrorToast } from "@/lib/release-timing-api-error";
import { resolveReleaseDetailBackPath } from "@/lib/release-detail-navigation";
import { buildOwnerReleaseEditPatchBody } from "@/lib/release-edit-patch";
import {
  ReleaseAttachPostsSection,
  type EligiblePostForAttach,
} from "@/components/release-attach-posts-section";
import {
  ATTACHMENT_LIMIT_TOAST,
  maxSelectableAttachments,
  parseAttachmentCapacity,
  releaseAttachmentCapacityQueryKey,
} from "@/lib/release-attachment-limit";
import { buildLinkTypeOptions } from "@/components/release-link-type-select";
import { requestVerifiedArtistToolsUpgrade } from "@/lib/verified-artist-tools-upgrade";
import { scheduleReleaseLinksUpgrade } from "@/lib/release-links-upgrade-flow";
import {
  FREE_RELEASE_LINK_LIMIT,
  LINK_LIMIT_TOAST,
  PAID_LINK_TYPE_TOAST,
  INVALID_RELEASE_LINK_TYPE_TOAST,
  canAddLinkToDraft,
  isFreeLinkLimitReachedError,
  isInvalidReleaseLinkTypeError,
  isPaidLinkTypeRequiredError,
  isPaidOnlyReleaseLink,
  parseLinkCapacity,
  releaseLinkCapacityQueryKey,
  resolveLinkLimitCardCopy,
} from "@/lib/release-link-limit";
import { planReleaseLinkSync } from "@/lib/sync-release-links";
import {
  isReleaseUpcomingFromTiming,
  isReleaseLiveLockedFromTiming,
} from "@/lib/release-status";
import {
  type CanonicalLinkPurpose,
  defaultPurposeForNewDraft,
  supportedPurposesForPlatform,
} from "@shared/release-link-platforms";
import { fetchReleaseById } from "@/lib/release-cache";

export default function ReleaseEdit() {
  const [, params] = useRoute("/releases/:id/edit");
  const [, navigate] = useLocation();
  const search = useSearch();
  const releaseId = params?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentUser, userType } = useUser();
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
    { id?: string; platform: string; url: string; linkType?: string | null }[]
  >([]);
  const [saving, setSaving] = useState(false);
  const [collabSearch, setCollabSearch] = useState("");
  const [stagedCollaborators, setStagedCollaborators] = useState<{ id: string; username: string }[]>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [releaseMenuOpen, setReleaseMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [titleSheetOpen, setTitleSheetOpen] = useState(false);
  const [scheduleSheetOpen, setScheduleSheetOpen] = useState(false);
  const [linksSheetOpen, setLinksSheetOpen] = useState(false);
  const [collaboratorsSheetOpen, setCollaboratorsSheetOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const handleBack = () => navigate(resolveReleaseDetailBackPath(search));
  useIosKeyboardResizeNone(true);
  const { isNativeIos, keyboardHeight, prefersReducedMotion } = useIosKeyboardAwareScroll({
    enabled: true,
    scrollContainerRef,
  });

  const { data: release, isLoading } = useQuery({
    queryKey: ["/api/releases", releaseId],
    queryFn: () => fetchReleaseById(releaseId!),
    enabled: !!releaseId,
  });

  useEffect(() => {
    if (release) {
      setTitle(release.title ?? "");
      setReleaseDate(release.releaseDate ? new Date(release.releaseDate).toISOString().slice(0, 10) : "");
      setComingSoon(!!release.isComingSoon);
      setTimingDraft(hydrateTimingDraftFromRelease(release));
      setArtworkPath(release.artworkPath ?? (release.artworkUrl && !String(release.artworkUrl).startsWith("http") ? release.artworkUrl : null));
      setSelectedPostIds((release.postIds as string[]) || []);
      setStagedCollaborators([]);
      setDraftLinks(
        (release.links as any[] | undefined)?.map((l) => ({
          id: l.id,
          platform: l.platform,
          url: l.url,
          linkType: (l as any).linkType ?? (l as any).link_type ?? null,
        })) || []
      );
    }
  }, [release]);

  useEffect(() => () => {
    if (artworkPreviewUrl) URL.revokeObjectURL(artworkPreviewUrl);
  }, [artworkPreviewUrl]);

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
    enabled: !!releaseId && !!currentUser?.id && userType === "artist",
  });

  const { data: eligiblePosts = [] } = useQuery({
    queryKey: ["/api/posts/eligible-for-release", releaseId ?? null],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return [];
      const url = releaseId
        ? `/api/posts/eligible-for-release?release_id=${encodeURIComponent(releaseId)}`
        : "/api/posts/eligible-for-release";
      const res = await fetch(apiUrl(url), {
        headers: { Authorization: `Bearer ${session.access_token}` },
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!currentUser?.id && userType === "artist" && !!releaseId,
  });

  const attachmentCapacityQuery = useQuery({
    queryKey: releaseId ? [...releaseAttachmentCapacityQueryKey(releaseId)] : ["attachment-capacity-idle"],
    enabled: !!releaseId && !!currentUser?.id && userType === "artist",
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/releases/${releaseId}/attachment-capacity`);
      const json = await res.json();
      const parsed = parseAttachmentCapacity(json);
      if (!parsed) throw new Error("Invalid attachment capacity response");
      return parsed;
    },
  });

  const linkCapacityQuery = useQuery({
    queryKey: releaseId ? [...releaseLinkCapacityQueryKey(releaseId)] : ["link-capacity-idle"],
    enabled:
      !!releaseId &&
      !!currentUser?.id &&
      userType === "artist" &&
      !!release &&
      release.artistId === currentUser.id,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/releases/${releaseId}/link-capacity`);
      const json = await res.json();
      const parsed = parseLinkCapacity(json);
      if (!parsed) throw new Error("Invalid link capacity response");
      return parsed;
    },
  });

  const attachmentMaxSelectable = attachmentCapacityQuery.data
    ? maxSelectableAttachments({
        unlimited: attachmentCapacityQuery.data.unlimited,
        limit: attachmentCapacityQuery.data.limit,
      })
    : null;
  const showAttachmentUpgrade =
    attachmentCapacityQuery.data != null &&
    attachmentCapacityQuery.data.unlimited === false &&
    selectedPostIds.length >= attachmentCapacityQuery.data.limit;

  const linkUnlimited = linkCapacityQuery.data?.unlimited === true;
  const canAddDraftLink = canAddLinkToDraft({
    unlimited: linkCapacityQuery.data?.unlimited ?? false,
    draftCount: draftLinks.length,
    limit: linkCapacityQuery.data?.limit ?? FREE_RELEASE_LINK_LIMIT,
  });
  const linkCardCopy = resolveLinkLimitCardCopy({
    unlimited: linkUnlimited,
    used: draftLinks.length,
    limit: linkCapacityQuery.data?.limit ?? FREE_RELEASE_LINK_LIMIT,
  });
  const showLinkUpgrade =
    linkCapacityQuery.data != null &&
    linkCapacityQuery.data.unlimited === false;
  const linkLimitProminence = resolveFreeQuotaNoticeProminence({
    unlimited: linkUnlimited,
    used: draftLinks.length,
    limit: linkCapacityQuery.data?.limit ?? FREE_RELEASE_LINK_LIMIT,
  });
  const releaseIsUpcoming = (() => {
    if (comingSoon) return true;
    if (timingDraft.mode === "exact" && releaseDate && timingDraft.timezone) {
      // Prefer persisted releaseAt when still Exact; else presentation approx for draft CTA defaults.
      const releaseAt =
        release?.releaseTimingMode === "exact" && release?.releaseAt
          ? release.releaseAt
          : null;
      if (releaseAt) {
        return isReleaseUpcomingFromTiming({
          isComingSoon: false,
          releaseDate,
          releaseTimingMode: "exact",
          releaseAt,
          releaseTimezone: timingDraft.timezone,
        });
      }
    }
    return isReleaseUpcomingFromTiming({
      isComingSoon: comingSoon,
      releaseDate: releaseDate || null,
      releaseTimingMode: timingDraft.mode,
      releaseAt: release?.releaseAt,
      releaseTimezone: timingDraft.timezone,
    });
  })();
  const showFutureListenGuidance =
    !linkUnlimited &&
    releaseIsUpcoming &&
    draftLinks.some((l) => !isPaidOnlyReleaseLink(l.platform, l.linkType));
  const platformChoices = useMemo(
    () => availablePlatformOptions(draftLinks.map((l) => l.platform)),
    [draftLinks],
  );
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

  const handleUpgrade = (source: "attachment_limit" | "link_limit") => {
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
      if (!res.ok) throw new Error("Upload failed");
      const json = await res.json();
      setArtworkPath(json.path ?? null);
      toast({ title: "Artwork uploaded" });
    } catch {
      toast({ title: "Artwork upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const attachedSet = new Set((release?.postIds as string[]) || []);

  const filteredEligiblePosts = useMemo(
    () =>
      filterEligiblePostsForAttachSearch(
        (eligiblePosts as EligiblePostForAttach[]) || [],
        searchTerm,
      ),
    [eligiblePosts, searchTerm],
  );

  async function attachPostsWithAuth(targetReleaseId: string, postIds: string[]) {
    if (postIds.length === 0) return;
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
    const res = await fetch(apiUrl(`/api/releases/${targetReleaseId}/attach-posts`), {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify({ post_ids: postIds }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.code === "POST_ALREADY_ATTACHED") {
        toast({
          title: "Post already attached",
          description: "One or more posts are already attached to another release.",
          variant: "destructive",
        });
        if (Array.isArray(data.postIds) && data.postIds.length) {
          setSelectedPostIds((prev) => prev.filter((id) => !data.postIds.includes(id)));
        }
      } else if (data.code === "FREE_ATTACHMENT_LIMIT_REACHED") {
        toast({
          title: ATTACHMENT_LIMIT_TOAST.title,
          description: ATTACHMENT_LIMIT_TOAST.body,
          variant: "destructive",
        });
        if (releaseId) {
          void queryClient.invalidateQueries({
            queryKey: [...releaseAttachmentCapacityQueryKey(releaseId)],
          });
        }
      } else {
        toast({
          title: "Attach failed",
          description: data.message || "Failed to attach posts",
          variant: "destructive",
        });
      }
      throw new Error(data.message || "Failed to attach posts");
    }
  }

  const handleSave = async () => {
    if (!releaseId || !release) return;
    const isOwner = release.artistId === currentUser?.id;
    const liveLockedForSave = isReleaseLiveLockedFromTiming({
      isComingSoon: release.isComingSoon,
      releaseDate: release.releaseDate,
      releaseTimingMode: release.releaseTimingMode,
      releaseAt: release.releaseAt,
      releaseTimezone: release.releaseTimezone,
    });
    if (isOwner) {
      if (!liveLockedForSave && !title.trim()) {
        toast({ title: "Title is required", variant: "destructive" });
        return;
      }
      if (!liveLockedForSave && title.trim().length > INPUT_LIMITS.releaseTitle) {
        toast({
          title: `Title must be at most ${INPUT_LIMITS.releaseTitle} characters`,
          variant: "destructive",
        });
        return;
      }
      if (!liveLockedForSave && !comingSoon && !releaseDate) {
        toast({ title: "Release date is required for scheduled releases", variant: "destructive" });
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
    }
    const timingFields =
      isOwner && !liveLockedForSave
        ? buildReleaseTimingRequestFields({
            comingSoon,
            releaseDateYmd: releaseDate,
            draft: timingDraft,
          })
        : null;
    if (timingFields && "error" in timingFields) {
      toast({ title: timingFields.error, variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      console.log("[ReleaseEdit] Saving release", {
        releaseId,
        title: title.trim(),
        releaseDate,
        selectedPostIds,
        linkCount: draftLinks.length,
        liveLockedForSave,
      });

      if (isOwner) {
      // 1) Basic release fields (owner only). Post-live omits timing/status.
      await apiRequest(
        "PATCH",
        `/api/releases/${releaseId}`,
        buildOwnerReleaseEditPatchBody({
          liveLocked: liveLockedForSave,
          title: title.trim(),
          artworkUrl: artworkPath?.trim() || null,
          comingSoon,
          releaseDateYmd: releaseDate,
          timingFields:
            timingFields && !("error" in timingFields) ? timingFields : null,
        }),
      );
      console.log("[ReleaseEdit] Basic fields saved", { releaseId });

      // 2) Collaborators: send invites for staged (only when no existing collaborators)
      if (stagedCollaborators.length > 0 && (release.collaborators || []).length === 0) {
        if (process.env.NODE_ENV === "development") {
          console.log("[ReleaseEdit] Inviting collaborators, release", releaseId, "endpoint: POST /api/releases/" + releaseId + "/collaborators/invite", "ids:", stagedCollaborators.map((c) => c.id));
        }
        let inviteFailures = 0;
        for (const c of stagedCollaborators) {
          try {
            await apiRequest("POST", `/api/releases/${releaseId}/collaborators/invite`, {
              artist_id: c.id,
            });
          } catch {
            inviteFailures++;
          }
        }
        if (inviteFailures > 0) {
          toast({
            title: "Release updated, but collaborator invites failed.",
            description: "You can retry from the release edit page.",
            variant: "destructive",
          });
          await queryClient.invalidateQueries({ queryKey: ["/api/releases", releaseId] });
          setSaving(false);
          return;
        }
        console.log("[ReleaseEdit] Collaborators invited", { releaseId, count: stagedCollaborators.length });
      }

      // 3) Links: diff-based sync (never clear-all-and-recreate)
      const existingLinks: {
        platform: string;
        url: string;
        linkType?: string | null;
      }[] = ((release.links as any[]) || []).map((l: any) => ({
        platform: l.platform,
        url: l.url,
        linkType: l.linkType ?? l.link_type ?? null,
      }));
      const plan = planReleaseLinkSync({
        existing: existingLinks,
        draft: draftLinks.map((l) => ({
          platform: normalizePlatformForApi(l.platform),
          url: l.url.trim(),
          linkType: l.linkType ?? null,
        })),
      });

      if (plan.primaryReplace) {
        await apiRequest("POST", `/api/releases/${releaseId}/links/replace`, {
          from_platform: plan.primaryReplace.fromPlatform,
          platform: plan.primaryReplace.next.platform,
          url: plan.primaryReplace.next.url,
          link_type: plan.primaryReplace.next.linkType ?? null,
        });
      } else {
        // Updates and inserts before removals so a failed insert cannot wipe links.
        for (const link of [...plan.updates, ...plan.inserts]) {
          await apiRequest("POST", `/api/releases/${releaseId}/links`, {
            platform: link.platform,
            url: link.url,
            link_type: link.linkType ?? null,
          });
        }
        for (const platform of plan.removals) {
          await apiRequest("DELETE", `/api/releases/${releaseId}/links/${platform}`);
        }
      }
      console.log("[ReleaseEdit] Links synced", {
        releaseId,
        unchanged: plan.unchanged.length,
        updates: plan.updates.length,
        inserts: plan.inserts.length,
        removals: plan.removals.length,
        primaryReplace: !!plan.primaryReplace,
      });
      }

      // 4) Attachments: diff vs current (owner or accepted collaborator)
      const currentAttached = new Set((release.postIds as string[]) || []);
      const toDetach = Array.from(currentAttached).filter((id) => !selectedPostIds.includes(id));
      const toAttach = selectedPostIds.filter((id) => !currentAttached.has(id));
      console.log("[ReleaseEdit] Attachment diff", {
        releaseId,
        toDetach,
        toAttach,
      });

      const detachIds = liveLockedForSave ? [] : toDetach;
      if (detachIds.length > 0) {
        const { data: { session } } = await supabase.auth.getSession();
        const detachHeaders: Record<string, string> = { "Content-Type": "application/json" };
        if (session?.access_token) detachHeaders["Authorization"] = `Bearer ${session.access_token}`;
        const detachRes = await fetch(apiUrl(`/api/releases/${releaseId}/attach-posts`), {
          method: "DELETE",
          headers: detachHeaders,
          credentials: "include",
          body: JSON.stringify({ post_ids: detachIds }),
        });
        if (detachRes.status === 409) {
          const data = await detachRes.json().catch(() => ({}));
          if (data.code === "RELEASE_LOCKED") {
            toast({
              title: "Can’t remove posts",
              description: data.message || "Posts cannot be removed after a release is live.",
              variant: "destructive",
            });
            return;
          }
        }
        if (!detachRes.ok) throw new Error("Detach failed");
        console.log("[ReleaseEdit] Detached posts", { releaseId, toDetach: detachIds });
      }
      if (toAttach.length > 0) {
        await attachPostsWithAuth(releaseId, toAttach);
        console.log("[ReleaseEdit] Attached posts", { releaseId, toAttach });
      }

      // Mark caches stale without awaiting refetches. TanStack Query v5's
      // invalidateQueries resolves only after active observers finish refetching;
      // awaiting here blocked navigation on release detail + capacity GETs
      // (subscription snapshot lookups) for several seconds after a durable save.
      void queryClient.invalidateQueries({ queryKey: ["/api/releases", releaseId] });
      void queryClient.invalidateQueries({ queryKey: ["/api/releases/feed"] });
      void queryClient.invalidateQueries({
        queryKey: [...releaseAttachmentCapacityQueryKey(releaseId)],
      });
      void queryClient.invalidateQueries({
        queryKey: [...releaseLinkCapacityQueryKey(releaseId)],
      });
      console.log("[ReleaseEdit] Invalidated queries and navigating", {
        releaseId,
        feedKey: "/api/releases/feed",
      });

      playSuccessNotification();
      toast({ title: "Release updated" });
      scheduleHomeWidgetRefreshAfterAuth();
      navigate("/releases");
    } catch (error) {
      console.error("[ReleaseEdit] Save failed", error);
      const timingToast = releaseTimingApiErrorToast(error);
      if (timingToast) {
        toast({
          title: timingToast.title,
          description: timingToast.description,
          variant: "destructive",
        });
        return;
      }
      if (isFreeLinkLimitReachedError(error)) {
        toast({
          title: LINK_LIMIT_TOAST.title,
          description: LINK_LIMIT_TOAST.body,
          variant: "destructive",
        });
        if (releaseId) {
          void queryClient.invalidateQueries({
            queryKey: [...releaseLinkCapacityQueryKey(releaseId)],
          });
        }
        return;
      }
      if (isPaidLinkTypeRequiredError(error)) {
        toast({
          title: PAID_LINK_TYPE_TOAST.title,
          description: PAID_LINK_TYPE_TOAST.body,
          variant: "destructive",
        });
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
      toast({ title: "Update failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!releaseId || !release) {
    if (!isLoading) navigate("/releases");
    return (
      <div className="flex-1 flex items-center justify-center">
        <VinylLoader />
      </div>
    );
  }

  const isOwner = currentUser?.id === release.artistId;
  const myCollab = (release.collaborators || []).find((c: any) => c.artistId === currentUser?.id);
  const canManage = isOwner || myCollab?.status === "ACCEPTED";
  if (!canManage || userType !== "artist") {
    navigate(`/releases/${releaseId}`);
    return null;
  }

  const releaseTimingInput = {
    isComingSoon: release.isComingSoon,
    releaseDate: release.releaseDate,
    releaseTimingMode: release.releaseTimingMode,
    releaseAt: release.releaseAt,
    releaseTimezone: release.releaseTimezone,
  };
  const isReleaseLocked = isReleaseLiveLockedFromTiming(releaseTimingInput);
  const heroSchedule = isReleaseLocked
    ? buildReleasedScheduleHeroSummary(releaseTimingInput)
    : buildDraftScheduleHeroSummary({
        comingSoon,
        releaseDateYmd: releaseDate,
        timingDraft,
      });
  const heroArtworkUrl =
    artworkPreviewUrl ||
    release?.artworkUrl ||
    (artworkPath
      ? artworkPath.startsWith("http")
        ? artworkPath
        : supabase.storage.from("release-artworks").getPublicUrl(artworkPath).data
            .publicUrl
      : null);
  const existingCollaboratorsCount = (release.collaborators || []).length;

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
        <div className="mb-4 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" className="ios-press -ml-1" onClick={handleBack}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Releases
          </Button>
          {isOwner ? (
            <DropdownMenu open={releaseMenuOpen} onOpenChange={setReleaseMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="ios-press h-9 w-9 shrink-0"
                  aria-label="Release options"
                  data-testid="button-release-edit-menu"
                >
                  <MoreHorizontal className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[12rem]">
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  disabled={saving}
                  onSelect={(e) => {
                    e.preventDefault();
                    setReleaseMenuOpen(false);
                    requestAnimationFrame(() => setShowDeleteModal(true));
                  }}
                  data-testid="menu-delete-release"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Release
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="h-9 w-9 shrink-0" aria-hidden />
          )}
        </div>
        <h1 className="text-xl font-bold mb-4">
          {isOwner ? "Edit release" : "Manage attachments"}
        </h1>

        {isOwner && (
        <div className="space-y-8">
        <section className="space-y-4" aria-labelledby="release-edit-core-heading">
          <h2 id="release-edit-core-heading" className="sr-only">
            Release
          </h2>
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              className="hidden"
              onChange={handleArtworkChange}
            />
            <ReleaseFormHero
              artworkUrl={heroArtworkUrl}
              uploading={uploading}
              onArtworkPress={() => fileInputRef.current?.click()}
              title={title}
              titleEditable={!isReleaseLocked}
              onTitlePress={() => setTitleSheetOpen(true)}
              schedule={heroSchedule}
              onSchedulePress={
                isReleaseLocked ? undefined : () => setScheduleSheetOpen(true)
              }
            />
            {!isReleaseLocked ? (
              <>
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
              </>
            ) : null}
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
                existing: (release.collaborators || []).map((c: any) => ({
                  username: c.username,
                  status: c.status,
                })),
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
              lockedNotice={isReleaseLocked ? RELEASE_LIVE_ATTACH_NOTICE : undefined}
              isToggleDisabled={(postId) => isReleaseLocked && attachedSet.has(postId)}
              detachAllDisabled={isReleaseLocked}
              maxSelectable={attachmentMaxSelectable}
              attachmentUsage={
                attachmentCapacityQuery.data && !attachmentCapacityQuery.data.unlimited
                  ? {
                      used: attachmentCapacityQuery.data.used,
                      limit: attachmentCapacityQuery.data.limit,
                    }
                  : null
              }
              attachmentLimitNotice={null}
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
                links.filter((l) => {
                  if (link.id && l.id) return l.id !== link.id;
                  return !(l.platform === link.platform && l.url === link.url);
                }),
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
              show: !!linkCapacityQuery.data && linkLimitProminence !== "hidden",
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
            existingCollaborators={(release.collaborators || []).map((c: any) => ({
              id: c.id,
              artistId: c.artistId,
              username: c.username,
              status: c.status,
            }))}
            stagedCollaborators={stagedCollaborators}
            invitesLocked={isCollaboratorInviteSetLocked(existingCollaboratorsCount)}
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
            canRemoveExisting={(c) =>
              release.artistId === currentUser?.id &&
              (c.status === "PENDING" || c.status === "REJECTED")
            }
            onRemoveExisting={async (c) => {
              try {
                await apiRequest(
                  "DELETE",
                  `/api/releases/${releaseId}/collaborators/${c.id}`,
                );
                queryClient.invalidateQueries({
                  queryKey: ["/api/releases", releaseId],
                });
                toast({ title: "Collaborator removed" });
              } catch {
                toast({ title: "Failed to remove", variant: "destructive" });
              }
            }}
            ownerArtistId={release.artistId}
            currentUserId={currentUser?.id}
            searchDisabled={saving}
          />
        </section>
        </div>
        )}

        {!isOwner ? (
        <div className="mt-8">
        <ReleaseAttachPostsSection
          eligiblePosts={(eligiblePosts as EligiblePostForAttach[]) || []}
          filteredEligiblePosts={filteredEligiblePosts}
          selectedPostIds={selectedPostIds}
          onSelectedPostIdsChange={setSelectedPostIds}
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          lockedNotice={isReleaseLocked ? RELEASE_LIVE_ATTACH_NOTICE : undefined}
          isToggleDisabled={(postId) => isReleaseLocked && attachedSet.has(postId)}
          detachAllDisabled={isReleaseLocked}
          maxSelectable={attachmentMaxSelectable}
          attachmentUsage={
            attachmentCapacityQuery.data && !attachmentCapacityQuery.data.unlimited
              ? {
                  used: attachmentCapacityQuery.data.used,
                  limit: attachmentCapacityQuery.data.limit,
                }
              : null
          }
          attachmentLimitNotice={null}
          showUpgradeCta={showAttachmentUpgrade}
          onUpgradeClick={(onDismissed) => {
            requestVerifiedArtistToolsUpgrade(toast, {
              source: "attachment_limit",
              onDismissed,
            });
          }}
        />
        </div>
        ) : null}

        <div className="pt-6 pb-8">
          <Button
            className="w-full"
            size="lg"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>

        <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete release?</DialogTitle>
              <DialogDescription>
                This will permanently remove the release and all its data (links, collaborators, attachments). You can’t undo this.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeleteModal(false)} disabled={deleting}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  if (!releaseId || !release || release.artistId !== currentUser?.id) return;
                  setDeleting(true);
                  try {
                    const { data: { session } } = await supabase.auth.getSession();
                    const headers: Record<string, string> = {};
                    if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
                    const res = await fetch(apiUrl(`/api/releases/${releaseId}`), {
                      method: "DELETE",
                      credentials: "include",
                      headers,
                    });
                    if (!res.ok) {
                      const data = await res.json().catch(() => ({}));
                      throw new Error(data.message || "Failed to delete");
                    }
                    await queryClient.invalidateQueries({ queryKey: ["/api/releases/feed"] });
                    await queryClient.invalidateQueries({ queryKey: ["/api/releases", releaseId] });
                    await queryClient.invalidateQueries({ queryKey: ["/api/posts/eligible-for-release"] });
                    toast({ title: "Release deleted" });
                    setShowDeleteModal(false);
                    scheduleHomeWidgetRefreshAfterAuth();
                    navigate("/releases");
                  } catch (e) {
                    toast({
                      title: "Could not delete release",
                      description: e instanceof Error ? e.message : "Unknown error",
                      variant: "destructive",
                    });
                  } finally {
                    setDeleting(false);
                  }
                }}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      </div>
    </SwipeBackPage>
  );
}
