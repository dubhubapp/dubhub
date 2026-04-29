import { useState, useRef, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, Upload, Plus, Trash2, Search, UserPlus, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { SwipeBackPage } from "@/components/swipe-back-page";

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
  const [attachWarningAccepted, setAttachWarningAccepted] = useState(false);
  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [draftLinks, setDraftLinks] = useState<
    { platform: string; url: string; linkType?: string | null }[]
  >([]);
  const [saving, setSaving] = useState(false);
  const [stagedCollaborators, setStagedCollaborators] = useState<{ id: string; username: string }[]>([]);
  const [collabSearch, setCollabSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleBack = () => navigate("/releases");

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
      toast({ title: "Release date is required unless Coming soon", variant: "destructive" });
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
      if (process.env.NODE_ENV === "development") {
        console.log("[ReleaseCreate] Success: created release", releaseId, "removed feed cache");
      }

      if (!releaseCreateHapticFiredRef.current) {
        playSuccessNotification();
        releaseCreateHapticFiredRef.current = true;
      }
      toast({ title: "Release created" });
      navigate("/releases");
    } catch (error) {
      console.error("[ReleaseCreate] Create failed", error);
      toast({
        title: "Failed to create release",
        description: error instanceof Error ? error.message : "Unknown error",
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
      onBack={handleBack}
      className="flex-1 min-h-0 bg-background overflow-y-auto pb-[clamp(0.75rem,2.5vw,1rem)]"
    >
      <div className="app-page-top-pad px-4 pb-4 max-w-md mx-auto">
        <Button variant="ghost" size="sm" className="mb-4 -ml-1" onClick={handleBack}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        <h1 className="text-xl font-bold mb-4">Add Release</h1>

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
            <div>
              <label className="text-sm font-medium block mb-1">Release date *</label>
              <div className="flex items-center gap-2 mb-2">
                <input
                  id="coming-soon"
                  type="checkbox"
                  checked={comingSoon}
                  onChange={(e) => setComingSoon(e.target.checked)}
                />
                <label htmlFor="coming-soon" className="text-sm">
                  Coming soon (date TBC - you can update this later)
                </label>
              </div>
              {!comingSoon && (
                <Input
                  type="date"
                  value={releaseDate}
                  onChange={(e) => setReleaseDate(e.target.value)}
                  required
                />
              )}
            </div>
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
            <div className="space-y-2">
              {sortLinksByPlatform(draftLinks).map((l) => (
                <div key={`${l.platform}-${l.url}`} className="flex items-center gap-2">
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
                        links.filter((link) => !(link.platform === l.platform && link.url === l.url))
                      )
                    }
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
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
                type="button"
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

          <section>
            <h2 className="text-sm font-medium text-muted-foreground mb-2">Attach posts</h2>
            <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
              Only attach posts that you have artist-verified. Attaching incorrect posts may result in a ban.
            </p>
            <p className="text-xs text-muted-foreground mb-2">
              Selected posts will be attached when you create this release.
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
                    disabled={!attachWarningAccepted}
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
            {eligiblePosts.length === 0 && (
              <p className="text-sm text-muted-foreground py-4">
                No eligible posts (artist-verified by you).
              </p>
            )}
            {eligiblePosts.length > 0 && filteredEligiblePosts.length === 0 && (
              <p className="text-sm text-muted-foreground py-2">
                No posts match your search.
              </p>
            )}

            <div className="flex items-center gap-2 mt-3">
              <span className="text-sm text-muted-foreground">
                Selected ({selectedPostIds.length})
              </span>
              <Button
                size="sm"
                type="button"
                variant="outline"
                onClick={() => setSelectedPostIds([])}
                disabled={selectedPostIds.length === 0}
              >
                Detach all
              </Button>
            </div>
          </section>

          <div className="pt-2 pb-8">
            <Button type="submit" disabled={saving} className="w-full">
              {saving ? "Creating…" : "Create Release"}
            </Button>
          </div>
        </form>
      </div>
    </SwipeBackPage>
  );
}
