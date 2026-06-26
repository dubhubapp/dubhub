import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

type ArtistReleaseAlertResponse = {
  enabled: boolean;
};

type ArtistReleaseAlertsButtonProps = {
  artistId: string;
  className?: string;
};

export function artistReleaseAlertQueryKey(artistId: string) {
  return ["/api/artists", artistId, "release-alert"] as const;
}

export function ArtistReleaseAlertsButton({ artistId, className }: ArtistReleaseAlertsButtonProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, isError } = useQuery<ArtistReleaseAlertResponse>({
    queryKey: artistReleaseAlertQueryKey(artistId),
    enabled: Boolean(artistId),
    retry: false,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/artists/${encodeURIComponent(artistId)}/release-alert`);
      if (!res.ok) {
        throw new Error("Failed to load release alert status");
      }
      return res.json();
    },
  });

  const setEnabled = (enabled: boolean) => {
    queryClient.setQueryData<ArtistReleaseAlertResponse>(artistReleaseAlertQueryKey(artistId), { enabled });
  };

  const enableMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/artists/${encodeURIComponent(artistId)}/release-alert`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? "Failed to enable release alerts");
      }
      return res.json() as Promise<ArtistReleaseAlertResponse>;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: artistReleaseAlertQueryKey(artistId) });
      const previous = queryClient.getQueryData<ArtistReleaseAlertResponse>(artistReleaseAlertQueryKey(artistId));
      setEnabled(true);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(artistReleaseAlertQueryKey(artistId), context.previous);
      }
    },
    onSuccess: (result) => {
      setEnabled(!!result.enabled);
      if (result.enabled) {
        toast({ title: "You'll be notified when this artist releases new music." });
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: artistReleaseAlertQueryKey(artistId) });
    },
  });

  const disableMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/artists/${encodeURIComponent(artistId)}/release-alert`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? "Failed to disable release alerts");
      }
      return res.json() as Promise<ArtistReleaseAlertResponse>;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: artistReleaseAlertQueryKey(artistId) });
      const previous = queryClient.getQueryData<ArtistReleaseAlertResponse>(artistReleaseAlertQueryKey(artistId));
      setEnabled(false);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(artistReleaseAlertQueryKey(artistId), context.previous);
      }
    },
    onSuccess: (result) => {
      setEnabled(!!result.enabled);
      if (!result.enabled) {
        toast({ title: "Release Alerts turned off." });
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: artistReleaseAlertQueryKey(artistId) });
    },
  });

  const enabled = data?.enabled === true;
  const pending = enableMutation.isPending || disableMutation.isPending;

  const handleClick = () => {
    if (pending || isLoading) return;
    if (enabled) {
      disableMutation.mutate();
    } else {
      enableMutation.mutate();
    }
  };

  if (isError) {
    return null;
  }

  return (
    <button
      type="button"
      className={cn(
        "ios-press inline-flex min-h-[1.625rem] w-full items-center justify-center gap-1 rounded px-2.5 py-1 text-[10px] font-semibold leading-none ring-1 backdrop-blur-md transition-colors drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]",
        enabled
          ? "border border-green-500/40 bg-green-500/[0.06] text-white ring-green-500/35 hover:bg-green-500/[0.1]"
          : "border border-white/15 bg-black/40 text-white/90 ring-white/20 hover:bg-black/50",
        (isLoading || pending) && "pointer-events-none opacity-70",
        className,
      )}
      onClick={handleClick}
      disabled={isLoading || pending}
      aria-pressed={enabled}
      data-testid="button-artist-release-alerts"
    >
      {enabled ? (
        <Check className="h-3 w-3 shrink-0 text-green-400" aria-hidden strokeWidth={2.5} />
      ) : (
        <Bell className="h-3 w-3 shrink-0 text-white/85" aria-hidden />
      )}
      {enabled ? (
        <span className="whitespace-nowrap">Release Alerts On</span>
      ) : (
        <>
          <span className="hidden whitespace-nowrap min-[400px]:inline">Turn on Future Release Alerts</span>
          <span className="whitespace-nowrap min-[400px]:hidden">Turn on Release Alerts</span>
        </>
      )}
    </button>
  );
}
