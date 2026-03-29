import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/lib/user-context";
import { AlertTriangle, Ban, Clock, Shield } from "lucide-react";
import { formatUsernameDisplay } from "@/lib/utils";

const MIN_SUSPEND_DAYS = 1;
const MAX_SUSPEND_DAYS = 31;

function trimEnforcementReason(reason: string | null | undefined): string | null {
  const t = typeof reason === "string" ? reason.trim() : "";
  return t.length > 0 ? t : null;
}

function clampSuspendDaysInput(raw: string): string {
  if (raw === "" || raw === "-") return raw;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return raw;
  const clamped = Math.min(MAX_SUSPEND_DAYS, Math.max(MIN_SUSPEND_DAYS, n));
  return String(clamped);
}

interface ModerationActionsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  reportId: string;
  reportedUserId: string;
  reportedUsername: string;
}

export function ModerationActionsDialog({
  isOpen,
  onClose,
  reportId,
  reportedUserId,
  reportedUsername,
}: ModerationActionsDialogProps) {
  const [suspendDays, setSuspendDays] = useState<string>("7");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentUser } = useUser();
  const { data: enforcementHistory } = useQuery<{
    profile: { warningCount: number; suspendedUntil: string | null; banned: boolean };
    history: {
      warnings: { reportId: string; reason: string | null; at: string | null }[];
      suspensions: { reportId: string; reason: string | null; days: number | null; at: string | null }[];
      bans: { reportId: string; reason: string | null; at: string | null }[];
    };
  }>({
    queryKey: ["/api/moderator/users", reportedUserId, "enforcement-history"],
    enabled: isOpen && !!reportedUserId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/moderator/users/${reportedUserId}/enforcement-history`);
      return res.json();
    },
  });

  const formatDateTime = (value: string | null) => {
    if (!value) return "Unknown";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "Unknown";
    return d.toLocaleString();
  };

  /** Compact date for enforcement log lines (mobile-friendly). */
  const formatEnforcementDate = (value: string | null) => {
    if (!value) return "Unknown";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "Unknown";
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  };

  const warnMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/moderator/reports/${reportId}/warn-user`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/moderator/reports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      queryClient.refetchQueries({ queryKey: ["/api/posts"] });
      // Invalidate notifications for the affected user (to show notification icon instantly)
      queryClient.invalidateQueries({ queryKey: ["/api/user", reportedUserId, "notifications"] });
      queryClient.refetchQueries({ queryKey: ["/api/user", reportedUserId, "notifications"] });
      if (currentUser?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/user", currentUser.id, "notifications"] });
        queryClient.refetchQueries({ queryKey: ["/api/user", currentUser.id, "notifications"] });
      }
      toast({
        title: "User Warned",
        description: `${formatUsernameDisplay(reportedUsername)} has been warned, content removed, and notified.`,
      });
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to warn user",
        variant: "destructive",
      });
    },
  });

  const suspendMutation = useMutation({
    mutationFn: async (days: number) => {
      return apiRequest("POST", `/api/moderator/reports/${reportId}/suspend-user`, { days });
    },
    onSuccess: (_, days) => {
      queryClient.invalidateQueries({ queryKey: ["/api/moderator/reports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      queryClient.refetchQueries({ queryKey: ["/api/posts"] });
      // Invalidate notifications for the affected user (to show notification icon instantly)
      queryClient.invalidateQueries({ queryKey: ["/api/user", reportedUserId, "notifications"] });
      queryClient.refetchQueries({ queryKey: ["/api/user", reportedUserId, "notifications"] });
      if (currentUser?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/user", currentUser.id, "notifications"] });
        queryClient.refetchQueries({ queryKey: ["/api/user", currentUser.id, "notifications"] });
      }
      toast({
        title: "User Suspended",
        description: `${formatUsernameDisplay(reportedUsername)} has been suspended for ${days} days, content removed, and notified.`,
      });
      onClose();
    },
    onError: (error: any) => {
      const bodyMsg =
        error?.body && typeof error.body === "object" && "message" in error.body
          ? String((error.body as { message?: string }).message ?? "")
          : "";
      const fallback = error?.message || "Failed to suspend user";
      toast({
        title: "Error",
        description: bodyMsg || fallback,
        variant: "destructive",
      });
    },
  });

  const banMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/moderator/reports/${reportId}/ban-user`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/moderator/reports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      queryClient.refetchQueries({ queryKey: ["/api/posts"] });
      // Invalidate notifications for the affected user (to show notification icon instantly)
      queryClient.invalidateQueries({ queryKey: ["/api/user", reportedUserId, "notifications"] });
      queryClient.refetchQueries({ queryKey: ["/api/user", reportedUserId, "notifications"] });
      if (currentUser?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/user", currentUser.id, "notifications"] });
        queryClient.refetchQueries({ queryKey: ["/api/user", currentUser.id, "notifications"] });
      }
      toast({
        title: "User Banned",
        description: `${formatUsernameDisplay(reportedUsername)} has been permanently banned, content removed, and notified.`,
        variant: "destructive",
      });
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to ban user",
        variant: "destructive",
      });
    },
  });

  const handleWarn = () => {
    if (confirm(`Are you sure you want to warn ${formatUsernameDisplay(reportedUsername)}? They will be notified.`)) {
      warnMutation.mutate();
    }
  };

  const handleSuspend = () => {
    const days = parseInt(suspendDays, 10);
    if (Number.isNaN(days) || days < MIN_SUSPEND_DAYS || days > MAX_SUSPEND_DAYS) {
      toast({
        title: "Invalid duration",
        description: `Enter a whole number of days from ${MIN_SUSPEND_DAYS} to ${MAX_SUSPEND_DAYS}.`,
        variant: "destructive",
      });
      return;
    }
    if (confirm(`Are you sure you want to suspend ${formatUsernameDisplay(reportedUsername)} for ${days} days? They will be notified.`)) {
      suspendMutation.mutate(days);
    }
  };

  const adjustSuspendDays = (delta: number) => {
    const current = parseInt(suspendDays, 10);
    const base = Number.isNaN(current) ? 7 : current;
    const next = Math.min(MAX_SUSPEND_DAYS, Math.max(MIN_SUSPEND_DAYS, base + delta));
    setSuspendDays(String(next));
  };

  const handleBan = () => {
    if (confirm(`⚠️ WARNING: Are you absolutely sure you want to PERMANENTLY BAN ${formatUsernameDisplay(reportedUsername)}? This action cannot be undone and they will be notified.`)) {
      if (confirm(`This is your final confirmation. ${formatUsernameDisplay(reportedUsername)} will be permanently banned. Continue?`)) {
        banMutation.mutate();
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Moderation Actions</DialogTitle>
          <DialogDescription>
            Take action against {formatUsernameDisplay(reportedUsername)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-2">
            <h3 className="text-sm font-semibold inline-flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              Enforcement history
            </h3>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Warnings: <span className="text-foreground font-medium">{enforcementHistory?.profile.warningCount ?? 0}</span></p>
              <p>Currently suspended until: <span className="text-foreground font-medium">{formatDateTime(enforcementHistory?.profile.suspendedUntil ?? null)}</span></p>
              <p>Currently banned: <span className="text-foreground font-medium">{enforcementHistory?.profile.banned ? "Yes" : "No"}</span></p>
            </div>
            <div className="space-y-3 text-[11px]">
              <div>
                <p className="text-muted-foreground font-medium mb-1.5">Warnings</p>
                <div className="max-h-32 overflow-y-auto space-y-1.5 pr-0.5">
                  {(enforcementHistory?.history.warnings ?? []).length === 0 ? (
                    <p className="text-muted-foreground">None</p>
                  ) : (
                    (enforcementHistory?.history.warnings ?? []).map((w, i) => {
                      const r = trimEnforcementReason(w.reason);
                      return (
                        <div
                          key={w.reportId ?? `warn-${w.at ?? ""}-${i}`}
                          className="rounded-md border border-white/10 bg-black/30 px-2 py-1.5"
                        >
                          <p className="font-medium text-foreground">Warning</p>
                          {r ? (
                            <p className="text-muted-foreground mt-0.5 leading-snug line-clamp-2 break-words">
                              Reason: <span className="text-foreground/90">{r}</span>
                            </p>
                          ) : null}
                          <p className="text-muted-foreground mt-0.5">
                            Date: <span className="text-foreground/90">{formatEnforcementDate(w.at)}</span>
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
              <div>
                <p className="text-muted-foreground font-medium mb-1.5">Suspensions</p>
                <div className="max-h-32 overflow-y-auto space-y-1.5 pr-0.5">
                  {(enforcementHistory?.history.suspensions ?? []).length === 0 ? (
                    <p className="text-muted-foreground">None</p>
                  ) : (
                    (enforcementHistory?.history.suspensions ?? []).map((s, i) => {
                      const r = trimEnforcementReason(s.reason);
                      return (
                        <div
                          key={s.reportId ?? `sus-${s.at ?? ""}-${i}`}
                          className="rounded-md border border-white/10 bg-black/30 px-2 py-1.5"
                        >
                          <p className="font-medium text-foreground">Suspension</p>
                          {typeof s.days === "number" && Number.isFinite(s.days) ? (
                            <p className="text-muted-foreground mt-0.5">
                              Duration: <span className="text-foreground/90">{s.days} days</span>
                            </p>
                          ) : null}
                          {r ? (
                            <p className="text-muted-foreground mt-0.5 leading-snug line-clamp-2 break-words">
                              Reason: <span className="text-foreground/90">{r}</span>
                            </p>
                          ) : null}
                          <p className="text-muted-foreground mt-0.5">
                            Date: <span className="text-foreground/90">{formatEnforcementDate(s.at)}</span>
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
              <div>
                <p className="text-muted-foreground font-medium mb-1.5">Bans</p>
                <div className="max-h-28 overflow-y-auto space-y-1.5 pr-0.5">
                  {(enforcementHistory?.history.bans ?? []).length === 0 ? (
                    <p className="text-muted-foreground">None</p>
                  ) : (
                    (enforcementHistory?.history.bans ?? []).map((b, i) => {
                      const r = trimEnforcementReason(b.reason);
                      return (
                        <div
                          key={b.reportId ?? `ban-${b.at ?? ""}-${i}`}
                          className="rounded-md border border-white/10 bg-black/30 px-2 py-1.5"
                        >
                          <p className="font-medium text-foreground">Permanent ban</p>
                          {r ? (
                            <p className="text-muted-foreground mt-0.5 leading-snug line-clamp-2 break-words">
                              Reason: <span className="text-foreground/90">{r}</span>
                            </p>
                          ) : null}
                          <p className="text-muted-foreground mt-0.5">
                            Date: <span className="text-foreground/90">{formatEnforcementDate(b.at)}</span>
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Warn Action */}
          <div className="border rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              <h3 className="font-semibold">Warning</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Removes the reported post or comment, increments their warning count, and notifies them. Does not suspend or ban the account.
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={handleWarn}
              disabled={warnMutation.isPending}
            >
              {warnMutation.isPending ? "Warning..." : "Warn User"}
            </Button>
          </div>

          {/* Suspend Action */}
          <div className="border rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-orange-500" />
              <h3 className="font-semibold">Suspend</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Removes the reported post or comment, suspends the account for the number of days you set (max {MAX_SUSPEND_DAYS}), and notifies them.
            </p>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label htmlFor="suspend-days" className="text-xs">Days ({MIN_SUSPEND_DAYS}–{MAX_SUSPEND_DAYS})</Label>
                <div className="flex gap-1 mt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0 h-9 w-9"
                    aria-label="Decrease days"
                    onClick={() => adjustSuspendDays(-1)}
                    disabled={suspendMutation.isPending || (parseInt(suspendDays, 10) || 0) <= MIN_SUSPEND_DAYS}
                  >
                    −
                  </Button>
                  <Input
                    id="suspend-days"
                    type="number"
                    min={MIN_SUSPEND_DAYS}
                    max={MAX_SUSPEND_DAYS}
                    step={1}
                    inputMode="numeric"
                    className="text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    value={suspendDays}
                    onChange={(e) => setSuspendDays(clampSuspendDaysInput(e.target.value))}
                    onBlur={() => {
                      if (suspendDays === "" || suspendDays === "-") setSuspendDays("7");
                    }}
                    placeholder="7"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0 h-9 w-9"
                    aria-label="Increase days"
                    onClick={() => adjustSuspendDays(1)}
                    disabled={suspendMutation.isPending || (parseInt(suspendDays, 10) || 0) >= MAX_SUSPEND_DAYS}
                  >
                    +
                  </Button>
                </div>
              </div>
              <Button
                variant="outline"
                className="shrink-0"
                onClick={handleSuspend}
                disabled={suspendMutation.isPending}
              >
                {suspendMutation.isPending ? "Suspending..." : "Suspend"}
              </Button>
            </div>
          </div>

          {/* Ban Action */}
          <div className="border border-red-500/50 rounded-lg p-4 space-y-2 bg-red-500/5">
            <div className="flex items-center gap-2">
              <Ban className="w-5 h-5 text-red-500" />
              <h3 className="font-semibold text-red-500">Permanent Ban</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Removes the reported post or comment, permanently bans the account, and notifies them. This action cannot be undone.
            </p>
            <Button
              variant="destructive"
              className="w-full"
              onClick={handleBan}
              disabled={banMutation.isPending}
            >
              {banMutation.isPending ? "Banning..." : "Permanently Ban User"}
            </Button>
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

