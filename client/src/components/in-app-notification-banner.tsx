import { useInAppNotificationToasts } from "@/hooks/use-in-app-notification-toasts";
import {
  getInAppNotificationBadgeIcon,
  type InAppNotificationBadgeKind,
} from "@/lib/in-app-notification-banner-icons";
import { useUser } from "@/lib/user-context";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { X, Bell } from "lucide-react";

type InAppNotificationBannerHostProps = {
  suppressOnboardingModal: boolean;
  suppressPushPrompt: boolean;
};

function InAppNotificationThumbnail({
  avatarUrl,
  badgeKind,
}: {
  avatarUrl: string | null;
  badgeKind: InAppNotificationBadgeKind;
}) {
  const { Icon, color } = getInAppNotificationBadgeIcon(badgeKind);

  return (
    <div className="relative mt-0.5 h-9 w-9 shrink-0">
      <div className="h-full w-full overflow-hidden rounded-lg border border-white/10 bg-white/8 ring-1 ring-[#4ae9df]/20">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-white/70">
            <Bell className="h-4 w-4" aria-hidden />
          </div>
        )}
      </div>
      <div
        className={cn(
          "absolute -bottom-1 -right-1 z-10 flex h-[21px] w-[21px] items-center justify-center rounded-full",
          "border border-[#4ae9df]/45 bg-[#0f1324]/92 supports-[backdrop-filter]:bg-[#0f1324]/88 backdrop-blur-sm",
          "shadow-[0_2px_8px_rgba(0,0,0,0.45)]",
        )}
        aria-hidden
      >
        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} strokeWidth={2.25} />
      </div>
    </div>
  );
}

function InAppNotificationBannerView({
  title,
  description,
  avatarUrl,
  badgeKind,
  onTap,
  onDismiss,
}: {
  title: string;
  description: string;
  avatarUrl: string | null;
  badgeKind: InAppNotificationBadgeKind;
  onTap: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[100] px-3"
      style={{ top: "max(0.5rem, calc(env(safe-area-inset-top, 0px) + 0.25rem))" }}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div
        className={cn(
          "pointer-events-auto mx-auto flex w-full max-w-md items-start gap-3 rounded-xl border border-white/12",
          "bg-[#0f1324]/92 supports-[backdrop-filter]:bg-[#0f1324]/88 backdrop-blur-xl",
          "px-3 py-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.45),0_0_0_1px_rgba(74,233,223,0.08)]",
          "animate-in slide-in-from-top-full fade-in duration-300",
        )}
      >
        <button
          type="button"
          onClick={onTap}
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
        >
          <InAppNotificationThumbnail avatarUrl={avatarUrl} badgeKind={badgeKind} />
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="truncate text-sm font-semibold text-white">{title}</p>
            <p className="line-clamp-2 text-xs leading-snug text-white/72">{description}</p>
          </div>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="mt-0.5 shrink-0 rounded-md p-1 text-white/55 hover:bg-white/10 hover:text-white"
          aria-label="Dismiss notification"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function InAppNotificationBannerHost({
  suppressOnboardingModal,
  suppressPushPrompt,
}: InAppNotificationBannerHostProps) {
  const { currentUser, userType } = useUser();
  const [location] = useLocation();
  const { banner, dismissBanner, handleBannerTap } = useInAppNotificationToasts({
    userId: currentUser?.id,
    userType,
    location,
    suppressOnboardingModal,
    suppressPushPrompt,
  });

  if (!banner) return null;

  return (
    <InAppNotificationBannerView
      title={banner.title}
      description={banner.description}
      avatarUrl={banner.avatarUrl}
      badgeKind={banner.badgeKind}
      onTap={handleBannerTap}
      onDismiss={dismissBanner}
    />
  );
}
