import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VideoCard } from "@/components/video-card";
import { VinylLoader } from "@/components/ui/vinyl-loader";
import { apiRequest } from "@/lib/queryClient";
import { normalizePostForPreview } from "@/lib/normalize-post-for-preview";
import type { PostWithUser } from "@shared/schema";

type PostClipViewerOverlayProps = {
  postId: string;
  /** When provided, render immediately without fetching. */
  initialPost?: PostWithUser | null;
  onClose: () => void;
  onLoadFailed?: (postId: string) => void;
  testId?: string;
};

export function PostClipViewerOverlay({
  postId,
  initialPost = null,
  onClose,
  onLoadFailed,
  testId = "post-clip-viewer",
}: PostClipViewerOverlayProps) {
  const shouldFetch = !initialPost;

  const { data: fetchedPost, isPending, isError } = useQuery<PostWithUser>({
    queryKey: ["/api/posts", postId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/posts/${postId}`);
      if (!res.ok) {
        throw new Error(`POST_LOOKUP_${res.status}`);
      }
      return res.json();
    },
    enabled: shouldFetch && !!postId,
    retry: false,
    staleTime: 30_000,
  });

  const post = useMemo(() => {
    if (initialPost) return normalizePostForPreview(initialPost);
    if (fetchedPost) return normalizePostForPreview(fetchedPost);
    return null;
  }, [initialPost, fetchedPost]);

  const isLoading = shouldFetch && isPending;

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  useEffect(() => {
    if (!shouldFetch || !isError) return;
    onLoadFailed?.(postId);
    onClose();
  }, [shouldFetch, isError, onLoadFailed, onClose, postId]);

  const [isMuted, setIsMuted] = useState(true);

  return (
    <div
      className="fixed inset-0 z-[100] h-[100dvh] w-screen bg-black"
      data-testid={testId}
    >
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          setIsMuted(true);
          onClose();
        }}
        className="absolute right-3 top-[max(0.75rem,calc(env(safe-area-inset-top,0px)+0.5rem))] z-[110] border-white/20 bg-black/60 text-white hover:bg-black/80"
        data-testid={`${testId}-close`}
      >
        <XCircle className="mr-1 h-4 w-4" />
        Close
      </Button>
      <div className="relative h-full min-h-0 w-full">
        {isLoading ? (
          <div className="flex h-full w-full items-center justify-center bg-black/80">
            <VinylLoader label="Loading video..." />
          </div>
        ) : post?.videoUrl && post.user ? (
          <div className="relative h-full min-h-0 w-full">
            <VideoCard
              post={post}
              embeddedFeed
              moderatorPreview
              clipViewerOverlay
              isActive
              isMuted={isMuted}
              onToggleMute={() => setIsMuted((prev) => !prev)}
            />
          </div>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-black px-6 text-center text-white">
            <FileText className="h-7 w-7 text-muted-foreground" />
            <p className="text-sm font-medium">Video unavailable</p>
            <p className="text-xs text-muted-foreground">This post is missing a playable video source.</p>
          </div>
        )}
      </div>
    </div>
  );
}
