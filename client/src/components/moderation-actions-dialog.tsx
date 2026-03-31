import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/lib/user-context";
import { AlertTriangle, Ban, Clock, Shield, Trash2 } from "lucide-react";
import { formatUsernameDisplay } from "@/lib/utils";
import {
  MODERATION_REPORT_REASONS,
  buildModerationReasonForSubmit,
  defaultModerationReasonSelection,
} from "@shared/moderation-reasons";

const MIN_SUSPEND_DAYS = 1;
const MAX_SUSPEND_DAYS = 31;
const OTHER_NOTES_MAX = 400;

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

export type RemoveModerateContentTarget = "post" | "comment";

type ModerationAccountAction = "remove_only" | "warn" | "suspend" | "ban";

interface ModerationActionsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  reportId: string;
  reportedUserId: string;
  reportedUsername: string;
  contentTarget: RemoveModerateContentTarget;
  /** Original report reason (prefills the dropdown). */
  defaultReportReason: string;
}

export function ModerationActionsDialog({
  isOpen,
  onClose,
  reportId,
  reportedUserId,
  reportedUsername,
  contentTarget,
  defaultReportReason,
}: ModerationActionsDialogProps) {
  const [suspendDays, setSuspendDays] = useState<string>("7");
  const [reasonCategory, setReasonCategory] = useState<string>("");
  const [otherNotes, setOtherNotes] = useState<string>("");

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentUser } = useUser();

  useEffect(() => {
    if (!isOpen) return;
    const { category, otherNotes: pre } = defaultModerationReasonSelection(defaultReportReason);
    setReasonCategory(category);
    setOtherNotes(pre);
    setSuspendDays("7");
  }, [isOpen, reportId, defaultReportReason]);

  const { data: enforcementHistory } = useQuery<{
    profile: { warningCount: number; suspendedUntil: string | null; banned: boolean };
    history: {
      warnings: { reportId: string | null; reason: string | null; at: string | null }[];
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

  const formatEnforcementDate = (value: string | null) => {
    if (!value) return "Unknown";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "Unknown";
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  };

  const moderationMutation = useMutation({
    mutationFn: async (input: { moderationReason: string; accountAction: ModerationAccountAction; days?: number }) => {
      const { moderationReason, accountAction: act, days } = input;
      const body =
        act === "suspend" ? { moderationReason, days } : { moderationReason };
      if (act === "remove_only") {
        const path = contentTarget === "post" ? "remove-post" : "remove-comment";
        return apiRequest("POST", `/api/moderator/reports/${reportId}/${path}`, body);
      }
      if (act === "warn") {
        return apiRequest("POST", `/api/moderator/reports/${reportId}/warn-user`, body);
      }
      if (act === "suspend") {
        return apiRequest("POST", `/api/moderator/reports/${reportId}/suspend-user`, body);
      }
      return apiRequest("POST", `/api/moderator/reports/${reportId}/ban-user`, body);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/moderator/reports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      queryClient.refetchQueries({ queryKey: ["/api/posts"] });
      if (reportedUserId) {
        queryClient.invalidateQueries({ queryKey: ["/api/moderator/users", reportedUserId, "enforcement-history"] });
        queryClient.invalidateQueries({ queryKey: ["/api/user", reportedUserId, "notifications"] });
        queryClient.refetchQueries({ queryKey: ["/api/user", reportedUserId, "notifications"] });
      }
      if (currentUser?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/user", currentUser.id, "notifications"] });
        queryClient.refetchQueries({ queryKey: ["/api/user", currentUser.id, "notifications"] });
      }
      const act = variables.accountAction;
      const days = variables.days;
      if (act === "remove_only") {
        toast({
          title: contentTarget === "post" ? "Post Removed" : "Comment Removed",
          description:
            contentTarget === "post"
              ? "Reported post has been removed"
              : "Reported comment has been removed and user notified",
        });
      } else if (act === "warn") {
        toast({
          title: "User Warned",
          description: `${formatUsernameDisplay(reportedUsername)} has been warned, content removed, and notified.`,
        });
      } else if (act === "suspend" && days != null) {
        toast({
          title: "User Suspended",
          description: `${formatUsernameDisplay(reportedUsername)} has been suspended for ${days} days, content removed, and notified.`,
        });
      } else {
        toast({
          title: "User Banned",
          description: `${formatUsernameDisplay(reportedUsername)} has been permanently banned, content removed, and notified.`,
          variant: "destructive",
        });
      }
      onClose();
    },
    onError: (error: any) => {
      const bodyMsg =
        error?.body && typeof error.body === "object" && "message" in error.body
          ? String((error.body as { message?: string }).message ?? "")
          : "";
      toast({
        title: "Error",
        description: bodyMsg || error?.message || "Moderation action failed",
        variant: "destructive",
      });
    },
  });

  const adjustSuspendDays = (delta: number) => {
    const current = parseInt(suspendDays, 10);
    const base = Number.isNaN(current) ? 7 : current;
    const next = Math.min(MAX_SUSPEND_DAYS, Math.max(MIN_SUSPEND_DAYS, base + delta));
    setSuspendDays(String(next));
  };

  const targetLabel = contentTarget === "post" ? "post" : "comment";

  const getValidatedModerationReason = (): string | null => {
    if (!reasonCategory) {
      toast({
        title: "Select a reason",
        description: "Choose the reason that will be shown to the user.",
        variant: "destructive",
      });
      return null;
    }
    if (reasonCategory === "Other" && !otherNotes.trim()) {
      toast({
        title: "Add details",
        description: 'When "Other" is selected, add a short explanation for the user.',
        variant: "destructive",
      });
      return null;
    }
    const moderationReason = buildModerationReasonForSubmit(reasonCategory, otherNotes);
    if (!moderationReason.trim()) {
      toast({ title: "Invalid reason", variant: "destructive" });
      return null;
    }
    return moderationReason;
  };

  const handleRemoveOnly = () => {
    const moderationReason = getValidatedModerationReason();
    if (!moderationReason) return;
    const msg =
      contentTarget === "post"
        ? "Are you sure you want to remove this post? The user will be notified. This action cannot be undone."
        : "Are you sure you want to remove this comment? The user will be notified. This action cannot be undone.";
    if (!confirm(msg)) return;
    moderationMutation.mutate({ moderationReason, accountAction: "remove_only" });
  };

  const handleWarn = () => {
    const moderationReason = getValidatedModerationReason();
    if (!moderationReason) return;
    if (
      !confirm(
        `Are you sure you want to warn ${formatUsernameDisplay(reportedUsername)}? They will be notified.`
      )
    ) {
      return;
    }
    moderationMutation.mutate({ moderationReason, accountAction: "warn" });
  };

  const handleSuspend = () => {
    const moderationReason = getValidatedModerationReason();
    if (!moderationReason) return;
    const days = parseInt(suspendDays, 10);
    if (Number.isNaN(days) || days < MIN_SUSPEND_DAYS || days > MAX_SUSPEND_DAYS) {
      toast({
        title: "Invalid duration",
        description: `Enter a whole number of days from ${MIN_SUSPEND_DAYS} to ${MAX_SUSPEND_DAYS}.`,
        variant: "destructive",
      });
      return;
    }
    if (
      !confirm(
        `Are you sure you want to suspend ${formatUsernameDisplay(reportedUsername)} for ${days} days? They will be notified.`
      )
    ) {
      return;
    }
    moderationMutation.mutate({ moderationReason, accountAction: "suspend", days });
  };

  const handleBan = () => {
    const moderationReason = getValidatedModerationReason();
    if (!moderationReason) return;
    if (
      !confirm(
        `⚠️ WARNING: Are you absolutely sure you want to PERMANENTLY BAN ${formatUsernameDisplay(reportedUsername)}? This action cannot be undone and they will be notified.`
      )
    ) {
      return;
    }
    if (
      !confirm(
        `This is your final confirmation. ${formatUsernameDisplay(reportedUsername)} will be permanently banned. Continue?`
      )
    ) {
      return;
    }
    moderationMutation.mutate({ moderationReason, accountAction: "ban" });
  };

  const pending = moderationMutation.isPending;
  const pendingAct = moderationMutation.variables?.accountAction;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Moderation Actions</DialogTitle>
          <DialogDescription className="text-left space-y-1">
            <span className="block">Take action against {formatUsernameDisplay(reportedUsername)}</span>
            <span className="block text-xs text-muted-foreground">
              Reported {targetLabel}. Choose a reason above, then use an action below. Removing content is included with
              each action.
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-2">
            <h3 className="text-sm font-semibold inline-flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              Enforcement history
            </h3>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>
                Warnings:{" "}
                <span className="text-foreground font-medium">{enforcementHistory?.profile.warningCount ?? 0}</span>
              </p>
              <p>
                Currently suspended until:{" "}
                <span className="text-foreground font-medium">
                  {formatDateTime(enforcementHistory?.profile.suspendedUntil ?? null)}
                </span>
              </p>
              <p>
                Currently banned:{" "}
                <span className="text-foreground font-medium">{enforcementHistory?.profile.banned ? "Yes" : "No"}</span>
              </p>
            </div>
            <div className="space-y-3 text-[11px]">
              <div>
                <p className="text-muted-foreground font-medium mb-1.5">Warnings</p>
                <div className="max-h-24 overflow-y-auto space-y-1.5 pr-0.5">
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
                <div className="max-h-24 overflow-y-auto space-y-1.5 pr-0.5">
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
                <div className="max-h-20 overflow-y-auto space-y-1.5 pr-0.5">
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

          <div className="space-y-2">
            <Label htmlFor="mod-reason">Reason (shown to user)</Label>
            <Select value={reasonCategory} onValueChange={setReasonCategory}>
              <SelectTrigger id="mod-reason" className="w-full">
                <SelectValue placeholder="Select reason" />
              </SelectTrigger>
              <SelectContent position="popper" className="max-h-[min(70vh,320px)]">
                {MODERATION_REPORT_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {reasonCategory === "Other" ? (
              <div className="space-y-1">
                <Label htmlFor="mod-other-notes" className="text-xs text-muted-foreground">
                  Explain for &quot;Other&quot; (required)
                </Label>
                <Textarea
                  id="mod-other-notes"
                  value={otherNotes}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v.length <= OTHER_NOTES_MAX) setOtherNotes(v);
                  }}
                  placeholder="Short explanation for the affected user…"
                  rows={3}
                  className="resize-none text-sm"
                />
                <p className="text-xs text-muted-foreground text-right">
                  {otherNotes.length}/{OTHER_NOTES_MAX}
                </p>
              </div>
            ) : null}
          </div>

          {/* Remove content only */}
          <div className="border rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-muted-foreground" />
              <h3 className="font-semibold">Remove content only</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Removes the reported {targetLabel} and notifies the user using the reason above. Does not warn, suspend, or
              ban the account.
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={handleRemoveOnly}
              disabled={pending || !reasonCategory}
            >
              {pending && pendingAct === "remove_only"
                ? "Removing…"
                : contentTarget === "post"
                  ? "Remove post only"
                  : "Remove comment only"}
            </Button>
          </div>

          {/* Warn */}
          <div className="border rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              <h3 className="font-semibold">Warning</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Removes the reported post or comment, increments their warning count, and notifies them. Does not suspend
              or ban the account.
            </p>
            <Button variant="outline" className="w-full" onClick={handleWarn} disabled={pending || !reasonCategory}>
              {pending && pendingAct === "warn" ? "Warning..." : "Warn User"}
            </Button>
          </div>

          {/* Suspend */}
          <div className="border rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-orange-500" />
              <h3 className="font-semibold">Suspend</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Removes the reported post or comment, suspends the account for the number of days you set (max{" "}
              {MAX_SUSPEND_DAYS}), and notifies them.
            </p>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label htmlFor="suspend-days" className="text-xs">
                  Days ({MIN_SUSPEND_DAYS}–{MAX_SUSPEND_DAYS})
                </Label>
                <div className="flex gap-1 mt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0 h-9 w-9"
                    aria-label="Decrease days"
                    onClick={() => adjustSuspendDays(-1)}
                    disabled={pending || (parseInt(suspendDays, 10) || 0) <= MIN_SUSPEND_DAYS}
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
                    disabled={pending || (parseInt(suspendDays, 10) || 0) >= MAX_SUSPEND_DAYS}
                  >
                    +
                  </Button>
                </div>
              </div>
              <Button
                variant="outline"
                className="shrink-0"
                onClick={handleSuspend}
                disabled={pending || !reasonCategory}
              >
                {pending && pendingAct === "suspend" ? "Suspending..." : "Suspend"}
              </Button>
            </div>
          </div>

          {/* Ban */}
          <div className="border border-red-500/50 rounded-lg p-4 space-y-2 bg-red-500/5">
            <div className="flex items-center gap-2">
              <Ban className="w-5 h-5 text-red-500" />
              <h3 className="font-semibold text-red-500">Permanent Ban</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Removes the reported post or comment, permanently bans the account, and notifies them. This action cannot be
              undone.
            </p>
            <Button
              variant="destructive"
              className="w-full"
              onClick={handleBan}
              disabled={pending || !reasonCategory}
            >
              {pending && pendingAct === "ban" ? "Banning..." : "Permanently Ban User"}
            </Button>
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
