import { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/lib/user-context";
import { cn } from "@/lib/utils";

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: "post" | "comment";
  postId: string;
  commentId?: string;
  reportedUserId?: string;
}

const REPORT_REASONS = [
  "Sexual or graphic content",
  "Violent or disturbing content",
  "Non-music content",
  "Copyright / stolen content",
  "Spam / advertising",
  "Harassment / hate speech",
  "False or misleading track ID",
  "Impersonation",
  "Other",
];

/** Report reason menu: full-height list (no inner scroll), subtle dividers, tick-only selection */
const reportReasonSelectTriggerClass = cn(
  "h-10 min-h-10 rounded-md border border-input bg-background px-3 text-left text-sm transition-colors",
  "hover:bg-muted/30 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background",
  "data-[state=open]:ring-2 data-[state=open]:ring-ring data-[state=open]:ring-offset-2 data-[state=open]:ring-offset-background",
);

const reportReasonSelectContentClass = cn(
  "z-[100] max-h-none overflow-visible border border-border bg-popover p-0 text-popover-foreground shadow-md",
);

const reportReasonSelectViewportClass = cn(
  "h-auto max-h-none min-h-0 w-full min-w-[var(--radix-select-trigger-width)]",
);

const reportReasonSelectItemClass = cn(
  "relative cursor-pointer rounded-sm py-2 pl-8 pr-3 text-sm outline-none transition-colors duration-150",
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
  "focus:bg-muted/40 data-[highlighted]:bg-muted/40",
  /* Selected: checkmark + slightly stronger label only */
  "data-[state=checked]:bg-transparent data-[state=checked]:font-medium",
  "data-[state=checked]:data-[highlighted]:bg-muted/45",
  /* Subtle divider after first row only between items */
  "[&:not(:first-child)]:border-t [&:not(:first-child)]:border-border/25",
);

// Safety timeout to re-enable UI if request hangs (10 seconds)
const SAFETY_TIMEOUT_MS = 10000;

export function ReportModal({ isOpen, onClose, type, postId, commentId, reportedUserId }: ReportModalProps) {
  const [reason, setReason] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [isReasonSelectOpen, setIsReasonSelectOpen] = useState<boolean>(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentUser } = useUser();
  const safetyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const attemptIdRef = useRef<number>(0);
  const isMountedRef = useRef(true);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current);
        safetyTimeoutRef.current = null;
      }
    };
  }, []);

  const reportMutation = useMutation({
    mutationFn: async () => {
      // Increment attempt ID for this mutation attempt
      const currentAttemptId = ++attemptIdRef.current;
      
      // Set safety timeout to show toast if request hangs (but do NOT close modal)
      safetyTimeoutRef.current = setTimeout(() => {
        // Only act if this is still the current attempt and component is mounted
        if (currentAttemptId === attemptIdRef.current && isMountedRef.current) {
          console.warn("[ReportModal] Request timeout - showing toast only");
          toast({
            title: "Request Timeout",
            description: "The request is taking longer than expected. You can close this dialog and try again.",
            variant: "destructive",
          });
        }
      }, SAFETY_TIMEOUT_MS);

      const endpoint = type === "post" 
        ? `/api/posts/${postId}/report`
        : `/api/comments/${commentId}/report`;
      
      try {
        const response = await apiRequest("POST", endpoint, {
          reason,
          description: description.trim() || null,
          reported_user_id: type === "comment" ? reportedUserId : null,
        });

        // Clear safety timeout on success
        if (safetyTimeoutRef.current && currentAttemptId === attemptIdRef.current) {
          clearTimeout(safetyTimeoutRef.current);
          safetyTimeoutRef.current = null;
        }

        return response;
      } catch (error) {
        // Clear safety timeout on error
        if (safetyTimeoutRef.current && currentAttemptId === attemptIdRef.current) {
          clearTimeout(safetyTimeoutRef.current);
          safetyTimeoutRef.current = null;
        }
        throw error;
      }
    },
    onSuccess: () => {
      toast({
        title: "Report Submitted",
        description: "Thanks — our moderation team will review this shortly.",
      });

      if (currentUser?.id && isMountedRef.current) {
        queryClient.invalidateQueries({ queryKey: ["/api/moderator", currentUser.id, "notifications", "unread-count"] });
      }
      if (isMountedRef.current) {
        queryClient.invalidateQueries({ queryKey: ["/api/moderator/reports"] });
      }

      // Close after success; `useEffect` on `isOpen` clears reason, description, and select state
      if (isMountedRef.current) {
        onClose();
      }
    },
    onError: (error: any) => {
      // Do NOT close modal on error - keep it open so user can retry
      // Just show error toast
      let errorMessage = "Failed to submit report";
      try {
        const bodyMsg =
          error?.body && typeof error.body === "object" && "message" in error.body
            ? String((error.body as { message?: string }).message ?? "")
            : "";
        if (bodyMsg) {
          errorMessage = bodyMsg;
        } else if (error?.message) {
          errorMessage = error.message;
        } else if (typeof error === "string") {
          errorMessage = error;
        }
      } catch {
        // If parsing fails, use default message
      }

      const isDuplicate =
        error?.status === 409 ||
        error?.body?.code === "DUPLICATE_REPORT" ||
        /already reported this (post|comment)/i.test(errorMessage) ||
        errorMessage.includes("Already reported");

      if (isDuplicate) {
        toast({
          title: "Already reported",
          description:
            type === "comment"
              ? "You’ve already reported this comment. Our team will review it."
              : "You’ve already reported this post. Our team will review it.",
          variant: "destructive",
        });
      } else if (errorMessage.toLowerCase().includes("rate limit") || error?.status === 429) {
        toast({
          title: "Rate Limit Exceeded",
          description: "You've submitted too many reports. Please try again later.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
      }
    },
    onSettled: () => {
      // Always cleanup timeout
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current);
        safetyTimeoutRef.current = null;
      }
    },
  });

  const handleSubmit = () => {
    if (!reason) {
      toast({
        title: "Reason Required",
        description: "Please select a reason for reporting.",
        variant: "destructive",
      });
      return;
    }
    reportMutation.mutate();
  };

  // Track focus when modal opens, cleanup when modal closes
  useEffect(() => {
    if (isOpen) {
      // Store the element that had focus before modal opened
      if (document.activeElement instanceof HTMLElement) {
        previousFocusRef.current = document.activeElement;
      }
    } else {
      // Force close nested Select dropdown (prevents stuck portal overlay)
      setIsReasonSelectOpen(false);
      
      // Clear any pending timeout when modal closes
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current);
        safetyTimeoutRef.current = null;
      }
      
      // Reset form state synchronously (no setTimeout to avoid state thrash)
      setReason("");
      setDescription("");
      
      // Diagnostic logging (dev only)
      if (process.env.NODE_ENV === 'development') {
        // Use requestAnimationFrame to log after DOM updates
        requestAnimationFrame(() => {
          const root = document.getElementById('root');
          const activeElement = document.activeElement;
          
          console.log("[ReportModal] Modal closed - diagnostics", {
            activeElementTag: activeElement?.tagName || 'none',
            activeElementClass: activeElement instanceof HTMLElement ? activeElement.className : 'none',
            activeElementId: activeElement instanceof HTMLElement ? activeElement.id : 'none',
            bodyPointerEvents: document.body.style.pointerEvents,
            bodyOverflow: document.body.style.overflow,
            rootAriaHidden: root?.getAttribute('aria-hidden'),
            rootInert: root?.hasAttribute('inert'),
          });
        });
      }
    }
  }, [isOpen]);

  // User dismiss (overlay, Escape, Cancel): notify parent. Success path calls `onClose()` from `onSuccess`.
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setIsReasonSelectOpen(false);
      onClose();
    }
  };

  return (
    <Dialog 
      open={isOpen} 
      onOpenChange={handleOpenChange}
    >
      <DialogContent 
        className="max-w-md"
        onOpenAutoFocus={(e) => {
          // Optional: prevent auto-focus if needed, but let Radix handle it by default
        }}
        onCloseAutoFocus={(e) => {
          // Prevent Radix's default focus restoration
          e.preventDefault();
          
          // Blur any element that might be focused (especially in portaled popovers)
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
          
          // Don't restore focus here - let the caller (video-card) handle it
          // This prevents conflicts when modal is opened from a DropdownMenu
          // The caller will restore focus to the appropriate element after Dialog cleanup
          previousFocusRef.current = null;
        }}
      >
        <DialogHeader>
          <DialogTitle>Report {type === "post" ? "Post" : "Comment"}</DialogTitle>
          <DialogDescription>
            Help us keep the community safe by reporting inappropriate content.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Reason *</label>
            <Select 
              value={reason} 
              onValueChange={setReason}
              open={isReasonSelectOpen}
              onOpenChange={setIsReasonSelectOpen}
            >
              <SelectTrigger
                className={cn(
                  reportReasonSelectTriggerClass,
                  reason && "bg-muted/25",
                )}
              >
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent
                className={reportReasonSelectContentClass}
                viewportClassName={reportReasonSelectViewportClass}
                position="popper"
              >
                {REPORT_REASONS.map((r) => (
                  <SelectItem key={r} value={r} className={reportReasonSelectItemClass}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Additional Details (Optional)</label>
            <Textarea
              value={description}
              onChange={(e) => {
                if (e.target.value.length <= 200) {
                  setDescription(e.target.value);
                }
              }}
              placeholder="Provide any additional context... (max 200 characters)"
              rows={4}
              maxLength={200}
            />
            <div className="text-xs text-muted-foreground text-right mt-1">
              {description.length}/200
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button 
              variant="outline" 
              onClick={() => handleOpenChange(false)} 
              disabled={reportMutation.isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={reportMutation.isPending || !reason}>
              {reportMutation.isPending ? "Submitting..." : "Report"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

