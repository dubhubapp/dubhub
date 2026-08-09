import { useState, useRef, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, Upload, Plus, Trash2, UserPlus, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUser } from "@/lib/user-context";
import { apiRequest } from "@/lib/queryClient";
import { ApiRequestError } from "@/lib/apiDiagnostics";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";
import { scheduleHomeWidgetRefreshAfterAuth } from "@/lib/home-widget-refresh";
import {
  availablePlatformOptions,
  draftHasDuplicatePlatforms,
  getPlatformLabel,
  normalizePlatformForApi,
  sortLinksByPlatform,
} from "@/lib/platforms";
import { INPUT_LIMITS } from "@shared/input-limits";
import { formatUsernameDisplay } from "@/lib/utils";
import { apiUrl } from "@/lib/apiBase";
import { playSuccessNotification } from "@/lib/haptic";
import { SwipeBackPage } from "@/components/swipe-back-page";
import { useIosKeyboardResizeNone } from "@/lib/use-ios-keyboard-resize-none";
import { useIosKeyboardAwareScroll } from "@/lib/use-ios-keyboard-aware-scroll";
import { SEARCH_INPUT_KEYBOARD_PROPS, preventEnterFormSubmit } from "@/lib/form-search-input";
import { ReleaseStatusFields } from "@/components/release-status-fields";
import {
  ReleaseAttachPostsSection,
  type EligiblePostForAttach,
} from "@/components/release-attach-posts-section";
import { ReleaseCreationCapacityCard } from "@/components/release-creation-capacity-card";
import {
  RELEASE_CREATION_CAPACITY_QUERY_KEY,
  RELEASE_LIMIT_REACHED_TOAST,
  UPGRADE_PLACEHOLDER_HINT,
  isFreeReleaseLimitReachedError,
  parseReleaseCreationCapacity,
  resolveReleaseCapacityCardCopy,
} from "@/lib/release-creation-capacity";
import {
  ATTACHMENT_ALLOWANCE_QUERY_KEY,
  ATTACHMENT_LIMIT_TOAST,
  ATTACHMENT_NEAR_LIMIT_HINT,
  isFreeAttachmentLimitReachedError,
  maxSelectableAttachments,
  parseAttachmentAllowance,
} from "@/lib/release-attachment-limit";
import { PlatformIcon } from "@/components/PlatformIcon";
import { ReleaseLinkPlatformPicker } from "@/components/release-link-platform-picker";
import {
  ReleaseLinkTypeSelect,
  buildLinkTypeOptions,
} from "@/components/release-link-type-select";
import { requestVerifiedArtistToolsUpgrade } from "@/lib/verified-artist-tools-upgrade";
import { isVerifiedArtistToolsPaywallEnabled } from "@/lib/verified-artist-tools-paywall-flag";
import {
  FREE_RELEASE_LINK_LIMIT,
  LINK_ALLOWANCE_QUERY_KEY,
  LINK_LIMIT_CARD_COPY,
  LINK_LIMIT_TOAST,
  LISTENING_LINK_FUTURE_GUIDANCE,
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
import { isReleaseUpcoming } from "@/lib/release-status";
import {
  type CanonicalLinkPurpose,
  defaultPurposeForNewDraft,
  purposeOptionLabel,
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const handleBack = () => navigate("/releases");
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

  const capacityCopy = capacityQuery.data
    ? resolveReleaseCapacityCardCopy(capacityQuery.data)
    : null;
  const createLocked =
    capacityQuery.data != null && capacityQuery.data.canCreate === false;

  const handleUpgrade = (source: "release_limit" | "attachment_limit" | "link_limit") => {
    requestVerifiedArtistToolsUpgrade(toast, { source });
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
    linkAllowanceQuery.data.unlimited === false &&
    draftLinks.length >= (linkAllowanceQuery.data.limit ?? FREE_RELEASE_LINK_LIMIT);
  const releaseIsUpcoming = isReleaseUpcoming(comingSoon, releaseDate || null);
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

  const filteredEligiblePosts = useMemo(() => {
    const posts = (eligiblePosts as EligiblePostForAttach[]) || [];
    if (!searchTerm.trim()) return posts;
    const q = searchTerm.trim().toLowerCase();
    return posts.filter(
      (p) =>
        (p.dj_name || "").toLowerCase().includes(q) ||
        (p.title || "").toLowerCase().includes(q) ||
        (p.verified_comment_body || "").toLowerCase().includes(q)
    );
  }, [eligiblePosts, searchTerm]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (createLocked) return;
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
    if (draftHasDuplicatePlatforms(draftLinks)) {
      toast({
        title: "Duplicate platforms",
        description: "Each platform can only be added once per release.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      console.log("[ReleaseCreate] Creating release", {
        title: title.trim(),
        releaseDate,
        selectedPostIds,
        linkCount: draftLinks.length,
      });
      const res = await apiRequest("POST", "/api/releases", {
        title: title.trim(),
        release_date: comingSoon ? null : releaseDate,
        artwork_url: artworkPath || undefined,
        is_coming_soon: comingSoon,
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
      setSaving(false);
    }
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

        <div className="mb-6">
          <ReleaseCreationCapacityCard
            loading={capacityQuery.isLoading}
            copy={capacityCopy}
            onUpgradeClick={() => handleUpgrade("release_limit")}
          />
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="space-y-4">
            <div>
              <label className="text-sm font-medium block mb-1">Title *</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, INPUT_LIMITS.releaseTitle))}
                placeholder="Release title"
                required
                maxLength={INPUT_LIMITS.releaseTitle}
              />
              <p className="text-xs text-muted-foreground text-right mt-1">
                {title.length} / {INPUT_LIMITS.releaseTitle}
              </p>
            </div>
            <ReleaseStatusFields
              comingSoon={comingSoon}
              onComingSoonChange={setComingSoon}
              releaseDate={releaseDate}
              onReleaseDateChange={setReleaseDate}
            />
            <div>
              <label className="text-sm font-medium block mb-1">Artwork</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleArtworkChange}
              />
              <div className="flex items-center gap-3">
                {(artworkPreviewUrl || artworkPath) && (
                  <div className="w-20 h-20 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                    <img
                      src={
                        artworkPreviewUrl
                          ? artworkPreviewUrl
                          : artworkPath?.startsWith("http")
                          ? artworkPath
                          : artworkPath
                          ? supabase.storage.from("release-artworks").getPublicUrl(artworkPath).data.publicUrl
                          : ""
                      }
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {uploading ? "Uploading…" : artworkPath ? "Change artwork" : "Upload artwork"}
                </Button>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">Collaborators</h2>
            <p className="text-xs text-muted-foreground">
              Invite verified artists. Release stays private until all collaborators accept.
            </p>
            <div className="flex gap-2 mb-2">
              <Input
                placeholder="Search artist username..."
                value={collabSearch}
                onChange={(e) => setCollabSearch(e.target.value)}
                className="flex-1"
                {...SEARCH_INPUT_KEYBOARD_PROPS}
              />
            </div>
            {collabSearch && (
              <div className="mb-2 max-h-32 overflow-y-auto border rounded-lg divide-y">
                {(verifiedArtists as { id: string; username: string }[])
                  .filter(
                    (a) =>
                      a.id !== currentUser?.id &&
                      !stagedCollaborators.some((s) => s.id === a.id) &&
                      stagedCollaborators.length < 4
                  )
                  .slice(0, 5)
                  .map((artist) => (
                    <button
                      key={artist.id}
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center justify-between"
                      onClick={() => {
                        if (stagedCollaborators.length >= 4) return;
                        setStagedCollaborators((prev) =>
                          prev.some((p) => p.id === artist.id)
                            ? prev
                            : [...prev, { id: artist.id, username: artist.username }]
                        );
                        setCollabSearch("");
                      }}
                    >
                      {formatUsernameDisplay(artist.username)}
                      <UserPlus className="w-4 h-4 text-primary" />
                    </button>
                  ))}
              </div>
            )}
            {stagedCollaborators.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Pending invite (max 4):</p>
                {stagedCollaborators.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between py-1.5 px-2 rounded bg-muted"
                  >
                    <span className="text-sm">{formatUsernameDisplay(c.username)}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() =>
                        setStagedCollaborators((prev) => prev.filter((p) => p.id !== c.id))
                      }
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">Links</h2>
            {linkAllowanceQuery.data ? (
              <div
                className="rounded-xl border border-white/10 bg-black/30 backdrop-blur-md p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)] space-y-1.5"
                data-testid="release-link-limit-notice"
                role="status"
              >
                <p
                  className="text-sm font-semibold text-foreground"
                  data-testid="release-link-limit-title"
                >
                  {linkCardCopy.title}
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {linkCardCopy.body}
                </p>
                {showLinkUpgrade ? (
                  <div className="pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs border-white/15 bg-black/20"
                      onClick={() => handleUpgrade("link_limit")}
                      data-testid="release-link-upgrade"
                    >
                      {LINK_LIMIT_CARD_COPY.ctaLabel}
                    </Button>
                    {!isVerifiedArtistToolsPaywallEnabled() ? (
                      <p className="mt-1 text-[10px] text-muted-foreground/80">
                        {LINK_LIMIT_CARD_COPY.ctaHint}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            {showFutureListenGuidance ? (
              <div
                className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-1"
                data-testid="release-listening-link-future-guidance"
                role="status"
              >
                <p className="text-sm font-semibold text-foreground">
                  {LISTENING_LINK_FUTURE_GUIDANCE.title}
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {LISTENING_LINK_FUTURE_GUIDANCE.body}
                </p>
              </div>
            ) : null}
            <div className="space-y-2">
              {sortLinksByPlatform(draftLinks).map((l) => (
                <div key={`${l.platform}-${l.url}`} className="flex items-center gap-2">
                  <PlatformIcon platform={l.platform} />
                  <span className="text-sm">
                    {getPlatformLabel(l.platform)}
                    {l.linkType ? (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({purposeOptionLabel(l.platform, (l.linkType as CanonicalLinkPurpose) || "listen")})
                      </span>
                    ) : null}
                  </span>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary truncate flex-1"
                  >
                    {l.url}
                  </a>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setDraftLinks((links) =>
                        links.filter((link) => !(link.platform === l.platform && link.url === l.url))
                      )
                    }
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 items-end">
              <ReleaseLinkPlatformPicker
                value={linkPlatform}
                options={platformChoices}
                disabled={!canAddDraftLink}
                data-testid="release-link-platform-picker"
                onChange={(nextPlatform) => {
                  setLinkPlatform(nextPlatform);
                  if (
                    !purposeTouched ||
                    !supportedPurposesForPlatform(nextPlatform).includes(linkPurpose)
                  ) {
                    applyPlatformDefaultPurpose(nextPlatform);
                  }
                }}
              />
              {linkPlatform && linkTypeOptions.length > 0 ? (
                <ReleaseLinkTypeSelect
                  platform={linkPlatform}
                  value={linkPurpose}
                  options={linkTypeOptions}
                  disabled={!canAddDraftLink}
                  onChange={(next) => {
                    setLinkPurpose(next);
                    setPurposeTouched(true);
                  }}
                  onLockedSelect={(requested) => {
                    requestVerifiedArtistToolsUpgrade(toast, {
                      source: "release_link_presave",
                      platform: linkPlatform,
                      requestedLinkType: requested,
                    });
                  }}
                />
              ) : null}
              <Input
                placeholder="URL"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                className="flex-1 min-w-[8rem]"
                onKeyDown={preventEnterFormSubmit}
                disabled={!canAddDraftLink}
              />
              <Button
                size="sm"
                type="button"
                onClick={() => {
                  if (!linkPlatform || !linkUrl.trim()) return;
                  if (!canAddDraftLink) {
                    toast({
                      title: LINK_LIMIT_TOAST.title,
                      description: LINK_LIMIT_TOAST.body,
                      variant: "destructive",
                    });
                    return;
                  }
                  if (draftLinks.some((l) => normalizePlatformForApi(l.platform) === normalizePlatformForApi(linkPlatform))) {
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
                    requestVerifiedArtistToolsUpgrade(toast, {
                      source: "release_link_presave",
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
                }}
                disabled={!linkPlatform || !linkUrl.trim() || !canAddDraftLink}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </section>

          <ReleaseAttachPostsSection
            eligiblePosts={(eligiblePosts as EligiblePostForAttach[]) || []}
            filteredEligiblePosts={filteredEligiblePosts}
            selectedPostIds={selectedPostIds}
            onSelectedPostIdsChange={setSelectedPostIds}
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
            helperText="Selected posts will be attached when you create this release."
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
                ? ATTACHMENT_NEAR_LIMIT_HINT
                : null
            }
            showUpgradeCta={showAttachmentUpgrade}
            onUpgradeClick={() => handleUpgrade("attachment_limit")}
          />

          <div className="pt-2 pb-8 space-y-2">
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
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => handleUpgrade("release_limit")}
                  data-testid="release-create-upgrade-locked"
                >
                  Upgrade
                </Button>
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
    </SwipeBackPage>
  );
}
