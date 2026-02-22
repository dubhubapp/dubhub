import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/lib/user-context";
import { AlertTriangle, Ban, Clock, Shield } from "lucide-react";

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
      queryClient.invalidateQueries({ queryKey: ["/api/user", reportedUserId, "notifications", "unread-count"] });
      queryClient.refetchQueries({ queryKey: ["/api/user", reportedUserId, "notifications"] });
      queryClient.refetchQueries({ queryKey: ["/api/user", reportedUserId, "notifications", "unread-count"] });
      if (currentUser?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/moderator", currentUser.id, "notifications", "unread-count"] });
        queryClient.refetchQueries({ queryKey: ["/api/moderator", currentUser.id, "notifications", "unread-count"] });
      }
      toast({
        title: "User Warned",
        description: `${reportedUsername} has been warned, content removed, and notified.`,
      });
      onClose();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to warn user",
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
      queryClient.invalidateQueries({ queryKey: ["/api/user", reportedUserId, "notifications", "unread-count"] });
      queryClient.refetchQueries({ queryKey: ["/api/user", reportedUserId, "notifications"] });
      queryClient.refetchQueries({ queryKey: ["/api/user", reportedUserId, "notifications", "unread-count"] });
      if (currentUser?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/moderator", currentUser.id, "notifications", "unread-count"] });
        queryClient.refetchQueries({ queryKey: ["/api/moderator", currentUser.id, "notifications", "unread-count"] });
      }
      toast({
        title: "User Suspended",
        description: `${reportedUsername} has been suspended for ${days} days, content removed, and notified.`,
      });
      onClose();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to suspend user",
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
      queryClient.invalidateQueries({ queryKey: ["/api/user", reportedUserId, "notifications", "unread-count"] });
      queryClient.refetchQueries({ queryKey: ["/api/user", reportedUserId, "notifications"] });
      queryClient.refetchQueries({ queryKey: ["/api/user", reportedUserId, "notifications", "unread-count"] });
      if (currentUser?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/moderator", currentUser.id, "notifications", "unread-count"] });
        queryClient.refetchQueries({ queryKey: ["/api/moderator", currentUser.id, "notifications", "unread-count"] });
      }
      toast({
        title: "User Banned",
        description: `${reportedUsername} has been permanently banned, content removed, and notified.`,
        variant: "destructive",
      });
      onClose();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to ban user",
        variant: "destructive",
      });
    },
  });

  const handleWarn = () => {
    if (confirm(`Are you sure you want to warn @${reportedUsername}? They will be notified.`)) {
      warnMutation.mutate();
    }
  };

  const handleSuspend = () => {
    const days = parseInt(suspendDays, 10);
    if (isNaN(days) || days < 1) {
      toast({
        title: "Invalid Duration",
        description: "Please enter a valid number of days (1 or more).",
        variant: "destructive",
      });
      return;
    }
    if (confirm(`Are you sure you want to suspend @${reportedUsername} for ${days} days? They will be notified.`)) {
      suspendMutation.mutate(days);
    }
  };

  const handleBan = () => {
    if (confirm(`⚠️ WARNING: Are you absolutely sure you want to PERMANENTLY BAN @${reportedUsername}? This action cannot be undone and they will be notified.`)) {
      if (confirm(`This is your final confirmation. @${reportedUsername} will be permanently banned. Continue?`)) {
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
            Take action against @{reportedUsername}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Warn Action */}
          <div className="border rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              <h3 className="font-semibold">Warning</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Send a warning notification to the user. This is recorded but does not restrict their account.
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
              Temporarily suspend the user's account for a specified number of days.
            </p>
            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="suspend-days" className="text-xs">Days</Label>
                <Input
                  id="suspend-days"
                  type="number"
                  min="1"
                  max="365"
                  value={suspendDays}
                  onChange={(e) => setSuspendDays(e.target.value)}
                  placeholder="7"
                />
              </div>
              <Button
                variant="outline"
                className="mt-6"
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
              Permanently ban the user's account. This action cannot be undone.
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

