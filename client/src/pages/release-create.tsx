import { useState, useRef, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, Upload, Plus, Trash2, UserPlus, ImageOff } from "lucide-react";
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
      toast({ title: "Release date is required for scheduled releases", variant: "destructive" });
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
                onKeyDown={preventEnterFormSubmit}
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

          <ReleaseAttachPostsSection
            eligiblePosts={(eligiblePosts as EligiblePostForAttach[]) || []}
            filteredEligiblePosts={filteredEligiblePosts}
            selectedPostIds={selectedPostIds}
            onSelectedPostIdsChange={setSelectedPostIds}
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
            helperText="Selected posts will be attached when you create this release."
          />

          <div className="pt-2 pb-8">
            <Button type="submit" disabled={saving} className="w-full">
              {saving ? "Creating…" : "Create Release"}
            </Button>
          </div>
        </form>
      </div>
      </div>
    </SwipeBackPage>
  );
}
