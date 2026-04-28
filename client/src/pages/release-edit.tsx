import { useState, useRef, useEffect, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Upload, Plus, Trash2, Search, UserPlus, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { PLATFORM_OPTIONS, normalizePlatformForApi, sortLinksByPlatform } from "@/lib/platforms";
import { INPUT_LIMITS } from "@shared/input-limits";
import { formatUsernameDisplay } from "@/lib/utils";
import { apiUrl } from "@/lib/apiBase";
import { resolveMediaUrl } from "@/lib/media-url";
import { playSuccessNotification } from "@/lib/haptic";
import { VinylLoader } from "@/components/ui/vinyl-loader";

function EligiblePostPreview({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  const shouldShowVideo = !!src && !failed;
  const showFallback = !src || failed;

  return (
    <div className="w-20 h-20 flex-shrink-0 rounded overflow-hidden bg-muted relative">
      {shouldShowVideo ? (
        <video
          src={src ?? undefined}
          muted
          playsInline
          preload="auto"
          disablePictureInPicture
          className="w-full h-full object-cover pointer-events-none"
          onLoadedData={(e) => {
            const el = e.currentTarget;
            try {
              if (el.currentTime < 0.05) el.currentTime = 0.05;
              el.pause();
            } catch {
              // no-op
            }
          }}
          onError={() => setFailed(true)}
        />
      ) : null}
      {showFallback ? (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          <div className="flex flex-col items-center gap-1">
            <ImageOff className="h-4 w-4" />
            <span className="text-[10px] font-medium">No preview</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function ReleaseEdit() {
  const [, params] = useRoute("/releases/:id/edit");
  const [, navigate] = useLocation();
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
  const [attachWarningAccepted, setAttachWarningAccepted] = useState(false);
  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [draftLinks, setDraftLinks] = useState<
    { id?: string; platform: string; url: string; linkType?: string | null }[]
  >([]);
  const [saving, setSaving] = useState(false);
  const [collabSearch, setCollabSearch] = useState("");
  const [stagedCollaborators, setStagedCollaborators] = useState<{ id: string; username: string }[]>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  type EligiblePost = {
    id: string;
    video_url?: string;
    dj_name?: string;
    title?: string;
    verified_comment_body?: string;
    created_at?: string;
  };

  const getEligiblePostPreviewUrl = (post: EligiblePost) => {
    return resolveMediaUrl(post.video_url);
  };

  const filteredEligiblePosts = useMemo(() => {
    const posts = (eligiblePosts as EligiblePost[]) || [];
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
        toast({ title: "Release date is required unless Coming soon", variant: "destructive" });
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
    <div className="flex-1 min-h-0 bg-background overflow-y-auto pb-[clamp(0.75rem,2.5vw,1rem)]">
      <div className="app-page-top-pad px-4 pb-4 max-w-md mx-auto">
        <Button variant="ghost" size="sm" className="mb-4 -ml-1" onClick={() => navigate("/releases")}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Releases
        </Button>
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
            <div>
              <label className="text-sm font-medium block mb-1">Release date</label>
              <div className="flex items-center gap-2 mb-2">
                <input
                  id="edit-coming-soon"
                  type="checkbox"
                  checked={comingSoon}
                  onChange={(e) => setComingSoon(e.target.checked)}
                  disabled={isReleaseLocked}
                />
                <label htmlFor="edit-coming-soon" className="text-sm">
                  Coming soon (date TBC - you can update this later)
                </label>
              </div>
              {!comingSoon && (
                <Input
                  type="date"
                  value={releaseDate}
                  onChange={(e) => setReleaseDate(e.target.value)}
                  disabled={isReleaseLocked}
                />
              )}
            </div>
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
            {(release.collaborators || []).map((c: any) => (
              <div key={c.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{formatUsernameDisplay(c.username)}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      c.status === "ACCEPTED"
                        ? "bg-green-500/20 text-green-600"
                        : c.status === "REJECTED"
                        ? "bg-red-500/20 text-red-600"
                        : "bg-amber-500/20 text-amber-600"
                    }`}
                  >
                    {c.status}
                  </span>
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
            ))}
          </div>
        </section>
        )}

        <section>
          <h2 className="text-sm font-medium text-muted-foreground mb-2">Attach posts</h2>
          {isReleaseLocked && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
              This release is live. You can add more posts; posts already attached can’t be removed.
            </p>
          )}
          <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
            Only attach posts that you have artist-verified. Attaching incorrect posts may result in a ban.
          </p>
          <p className="text-xs text-muted-foreground mb-2">
            Selected posts will be attached when you save changes.
          </p>
          <label className="flex items-center gap-2 mb-3">
            <input
              type="checkbox"
              checked={attachWarningAccepted}
              onChange={(e) => setAttachWarningAccepted(e.target.checked)}
            />
            <span className="text-sm">I confirm these posts are my verified IDs</span>
          </label>

          <div className="relative mb-3">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by DJ, title, or verified comment..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>

          <div className="grid gap-3 max-h-80 overflow-y-auto">
            {filteredEligiblePosts.map((p: EligiblePost) => (
              <label
                key={p.id}
                className={`flex gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                  selectedPostIds.includes(p.id)
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50 bg-muted/30"
                } ${!attachWarningAccepted ? "opacity-60 pointer-events-none" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={selectedPostIds.includes(p.id)}
                  onChange={(e) => {
                    e.stopPropagation();
                    if (e.target.checked) setSelectedPostIds((s) => [...s, p.id]);
                    else setSelectedPostIds((s) => s.filter((id) => id !== p.id));
                  }}
                  disabled={!attachWarningAccepted || (isReleaseLocked && attachedSet.has(p.id))}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex gap-3">
                    <EligiblePostPreview src={getEligiblePostPreviewUrl(p)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {p.dj_name || "DJ unknown"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {p.verified_comment_body || "No verified comment found"}
                      </p>
                    </div>
                  </div>
                </div>
              </label>
            ))}
          </div>
          {eligiblePosts.length === 0 && <p className="text-sm text-muted-foreground py-4">No eligible posts (artist-verified by you).</p>}
          {eligiblePosts.length > 0 && filteredEligiblePosts.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">No posts match your search.</p>
          )}

          <div className="flex items-center gap-2 mt-3">
            <span className="text-sm text-muted-foreground">
              Selected ({selectedPostIds.length})
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSelectedPostIds([]);
              }}
              disabled={selectedPostIds.length === 0 || isReleaseLocked}
            >
              Detach all
            </Button>
          </div>
        </section>

        <div className="pt-6 pb-8 space-y-3">
          <Button
            className="w-full"
            size="lg"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save Changes"}
          </Button>
          {isOwner && (
            <Button
              variant="destructive"
              className="w-full"
              size="lg"
              onClick={() => setShowDeleteModal(true)}
              disabled={saving}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Release
            </Button>
          )}
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
  );
}
