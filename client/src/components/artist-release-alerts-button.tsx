import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    <div className={cn("space-y-1", className)} data-testid="artist-release-alerts-control">
      <Button
        type="button"
        variant={enabled ? "secondary" : "outline"}
        size="sm"
        className={cn(
          "ios-press h-9 w-full border-white/20 bg-black/30 text-white hover:bg-black/45",
          enabled && "border-primary/40 bg-primary/15 text-primary hover:bg-primary/20",
        )}
        onClick={handleClick}
        disabled={isLoading || pending}
        aria-pressed={enabled}
        data-testid="button-artist-release-alerts"
      >
        {enabled ? (
          <BellRing className="mr-2 h-4 w-4 shrink-0" aria-hidden />
        ) : (
          <Bell className="mr-2 h-4 w-4 shrink-0" aria-hidden />
        )}
        {enabled ? "Alerts On" : "Release Alerts"}
      </Button>
      <p className="text-center text-[11px] leading-snug text-white/55">
        Get notified when this artist releases new music.
      </p>
    </div>
  );
}
