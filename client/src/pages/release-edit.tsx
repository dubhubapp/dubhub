import { useState, useRef, useEffect, useMemo } from "react";
import { useRoute, useLocation, useSearch } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Upload, Plus, Trash2, UserPlus, ImageOff, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { getCollaborationStatusDisplay } from "@/lib/collaboration-status-display";
import { useUser } from "@/lib/user-context";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";
import { PLATFORM_OPTIONS, normalizePlatformForApi, sortLinksByPlatform } from "@/lib/platforms";
import { INPUT_LIMITS } from "@shared/input-limits";
import { formatUsernameDisplay } from "@/lib/utils";
import { apiUrl } from "@/lib/apiBase";
import { playSuccessNotification } from "@/lib/haptic";
import { VinylLoader } from "@/components/ui/vinyl-loader";
import { SwipeBackPage } from "@/components/swipe-back-page";
import { useIosKeyboardResizeNone } from "@/lib/use-ios-keyboard-resize-none";
import { useIosKeyboardAwareScroll } from "@/lib/use-ios-keyboard-aware-scroll";
import { SEARCH_INPUT_KEYBOARD_PROPS } from "@/lib/form-search-input";
import { ReleaseStatusFields } from "@/components/release-status-fields";
import { resolveReleaseDetailBackPath } from "@/lib/release-detail-navigation";
import {
  ReleaseAttachPostsSection,
  type EligiblePostForAttach,
} from "@/components/release-attach-posts-section";

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
  const [artworkPath, setArtworkPath] = useState<string | null>(null);
  const [artworkPreviewUrl, setArtworkPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [linkPlatform, setLinkPlatform] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
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
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/releases/${releaseId}`), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!releaseId,
  });

  useEffect(() => {
    if (release) {
      setTitle(release.title ?? "");
      setReleaseDate(release.releaseDate ? new Date(release.releaseDate).toISOString().slice(0, 10) : "");
      setComingSoon(!!release.isComingSoon);
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
    if (isOwner) {
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
    }
    setSaving(true);
    try {
      console.log("[ReleaseEdit] Saving release", {
        releaseId,
        title: title.trim(),
        releaseDate,
        selectedPostIds,
        linkCount: draftLinks.length,
      });

      if (isOwner) {
      // 1) Basic release fields (owner only)
      await apiRequest("PATCH", `/api/releases/${releaseId}`, {
        title: title.trim(),
        release_date: comingSoon ? null : releaseDate,
        artwork_url: artworkPath?.trim() || null,
        is_coming_soon: comingSoon,
      });
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

      // 3) Links: clear existing then re-create from draft
      const existingLinks: { platform: string }[] = (release.links as any[]) || [];
      for (const l of existingLinks) {
        await apiRequest("DELETE", `/api/releases/${releaseId}/links/${l.platform}`);
      }
      console.log("[ReleaseEdit] Existing links cleared", {
        releaseId,
        cleared: existingLinks.length,
      });
      for (const link of draftLinks) {
        await apiRequest("POST", `/api/releases/${releaseId}/links`, {
          platform: normalizePlatformForApi(link.platform),
          url: link.url.trim(),
          link_type: link.linkType ?? null,
        });
      }
      console.log("[ReleaseEdit] Draft links saved", {
        releaseId,
        saved: draftLinks.length,
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

      const releaseDateCheck = release.releaseDate ? new Date(release.releaseDate) : null;
      const isLiveRelease = !!(releaseDateCheck && releaseDateCheck <= new Date());
      const detachIds = isLiveRelease ? [] : toDetach;
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

      await queryClient.invalidateQueries({ queryKey: ["/api/releases", releaseId] });
      await queryClient.invalidateQueries({ queryKey: ["/api/releases/feed"] });
      console.log("[ReleaseEdit] Invalidated queries and navigating", {
        releaseId,
        feedKey: "/api/releases/feed",
      });

      playSuccessNotification();
      toast({ title: "Release updated" });
      navigate("/releases");
    } catch (error) {
      console.error("[ReleaseEdit] Save failed", error);
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

  const releaseDateObj = release.releaseDate ? new Date(release.releaseDate as string | number) : null;
  const isReleaseLocked = !!releaseDateObj && releaseDateObj.getTime() <= Date.now();
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
        <section className="mb-8">
          <h2 className="text-sm font-medium text-muted-foreground mb-2">Details</h2>
            <div className="space-y-3">
            <div>
              <label className="text-sm font-medium block mb-1">Title *</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, INPUT_LIMITS.releaseTitle))}
                placeholder="Title"
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
              statusDisabled={isReleaseLocked}
              dateFieldDisabled={isReleaseLocked}
            />
            <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleArtworkChange} />
            <div className="flex items-center gap-3">
              {(artworkPreviewUrl || artworkPath || release?.artworkUrl) && (
                <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                  <img
                    src={
                      artworkPreviewUrl
                        ? artworkPreviewUrl
                        : release?.artworkUrl
                        ? release.artworkUrl
                        : artworkPath?.startsWith("http")
                        ? artworkPath
                        : artworkPath
                        ? supabase.storage.from("release-artworks").getPublicUrl(artworkPath).data.publicUrl
                        : undefined
                    }
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                <Upload className="w-4 h-4 mr-2" />
                {artworkPath ? "Change artwork" : "Upload artwork"}
              </Button>
            </div>
          </div>
        </section>
        )}

        {isOwner && (
        <section className="mb-8">
          <h2 className="text-sm font-medium text-muted-foreground mb-2">Links</h2>
          <div className="space-y-2">
            {sortLinksByPlatform(draftLinks).map((l, idx) => (
              <div key={l.id ?? `${l.platform}-${l.url}-${idx}`} className="flex items-center gap-2">
                <span className="text-sm">
                  {PLATFORM_OPTIONS.find((p) => p.value === l.platform)?.label ?? l.platform.replace("_", " ")}
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
                      links.filter((link, linkIndex) => linkIndex !== idx)
                    )
                  }
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <select
              value={linkPlatform}
              onChange={(e) => setLinkPlatform(e.target.value)}
              className="border rounded px-2 py-1.5 text-sm bg-background"
            >
              <option value="">Platform</option>
              {PLATFORM_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <Input
              placeholder="URL"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              className="flex-1"
            />
            <Button
              size="sm"
              onClick={() => {
                if (!linkPlatform || !linkUrl.trim()) return;
                setDraftLinks((links) => [
                  ...links,
                  { platform: linkPlatform, url: linkUrl.trim(), linkType: null },
                ]);
                setLinkPlatform("");
                setLinkUrl("");
              }}
              disabled={!linkPlatform || !linkUrl.trim()}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </section>
        )}

        {isOwner && (
        <section className="mb-8">
          <h2 className="text-sm font-medium text-muted-foreground mb-2">Collaborators</h2>
          {existingCollaboratorsCount > 0 ? (
            <p className="text-xs text-muted-foreground mb-2">
              Collaborator set is locked for this release once invitations have been sent.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mb-2">
              Invite verified artists. Release stays private until all collaborators accept. Max 4.
            </p>
          )}
          {existingCollaboratorsCount === 0 && (
            <>
              <div className="flex gap-2 mb-3">
                <Input
                  placeholder="Search artist username..."
                  value={collabSearch}
                  onChange={(e) => setCollabSearch(e.target.value)}
                  className="flex-1"
                  disabled={saving}
                  {...SEARCH_INPUT_KEYBOARD_PROPS}
                />
              </div>
              {collabSearch && (
                <div className="mb-2 max-h-32 overflow-y-auto border rounded-lg divide-y">
                  {(verifiedArtists as { id: string; username: string }[])
                    .filter(
                      (a) =>
                        a.id !== release.artistId &&
                        !(release.collaborators || []).some((c: any) => c.artistId === a.id) &&
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
                            prev.some((p) => p.id === artist.id) ? prev : [...prev, { id: artist.id, username: artist.username }]
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
                <div className="mb-3 space-y-2">
                  <p className="text-xs text-muted-foreground">Pending invite:</p>
                  {stagedCollaborators.map((c) => (
                    <div key={c.id} className="flex items-center justify-between py-1.5 px-2 rounded bg-muted">
                      <span className="text-sm">{formatUsernameDisplay(c.username)}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setStagedCollaborators((prev) => prev.filter((p) => p.id !== c.id))}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          <div className="space-y-2">
            {(release.collaborators || []).map((c: any) => {
              const collabDisplay = getCollaborationStatusDisplay(c.status);
              return (
              <div key={c.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{formatUsernameDisplay(c.username)}</span>
                  {collabDisplay && (
                    <span className={collabDisplay.className}>{collabDisplay.label}</span>
                  )}
                </div>
                {release.artistId === currentUser?.id && (c.status === "PENDING" || c.status === "REJECTED") && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={async () => {
                      try {
                        await apiRequest("DELETE", `/api/releases/${releaseId}/collaborators/${c.id}`);
                        queryClient.invalidateQueries({ queryKey: ["/api/releases", releaseId] });
                        toast({ title: "Collaborator removed" });
                      } catch {
                        toast({ title: "Failed to remove", variant: "destructive" });
                      }
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            );
            })}
          </div>
        </section>
        )}

        <ReleaseAttachPostsSection
          eligiblePosts={(eligiblePosts as EligiblePostForAttach[]) || []}
          filteredEligiblePosts={filteredEligiblePosts}
          selectedPostIds={selectedPostIds}
          onSelectedPostIdsChange={setSelectedPostIds}
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          helperText="Selected posts will be attached when you save changes."
          lockedNotice={
            isReleaseLocked
              ? "This release is live. You can add more posts; posts already attached can’t be removed."
              : undefined
          }
          isToggleDisabled={(postId) => isReleaseLocked && attachedSet.has(postId)}
          detachAllDisabled={isReleaseLocked}
        />

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
