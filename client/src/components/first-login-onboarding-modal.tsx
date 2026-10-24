import {
  BadgeCheck,
  Calendar,
  Check,
  Clock,
  EyeOff,
  Film,
  Heart,
  MessageCircle,
  Trophy,
  Upload,
  Users,
  X,
} from "lucide-react";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GoldVerifiedTick } from "@/components/verified-artist";
import {
  STATUS_GLOW_PILL_BG,
  STATUS_GLOW_PILL_CLASS,
  getGenreGlowPillStyle,
} from "@/lib/genre-styles";
import { playInteractionLight, playSuccessNotification } from "@/lib/haptic";
import {
  APP_MATERIAL_DIALOG_CONTENT_CLASS,
  APP_MATERIAL_OVERLAY_BACKDROP_CLASS,
  APP_MATERIAL_OVERLAY_DESCRIPTION_CLASS,
  APP_MATERIAL_OVERLAY_PRIMARY_ACTION_CLASS,
  APP_MATERIAL_OVERLAY_TITLE_CLASS,
} from "@/lib/app-material";
import { AUTH_SURFACE_CLASS } from "@/lib/auth-surface";
import { IDENTIFIED_PILL_LABEL } from "@/lib/post-identification-status";
import { PRELOGIN_AUTH_CANVAS_CLASS } from "@/lib/prelogin-material";
import { cn } from "@/lib/utils";

type OnboardingAudience = "user" | "artist";

interface FirstLoginOnboardingModalProps {
  open: boolean;
  audience: OnboardingAudience;
  onDismiss: () => void;
}

const statusIconBase = "h-3 w-3 shrink-0";
const tipIconClass = "mt-0.5 h-4 w-4 shrink-0 text-foreground";
const statusRowClass = "flex flex-wrap items-center gap-x-2 gap-y-0.5";
const statusDescriptionClass =
  "min-w-[8.5rem] flex-1 text-[11px] leading-snug text-muted-foreground";

/** Community-member core concepts — mental model, not control-level how-tos. */
const communityTips = [
  { text: "Upload clips you want identified", Icon: Upload },
  { text: "Help identify tracks in the feed", Icon: MessageCircle },
  { text: "Save tracks and follow them through to release", Icon: Heart },
  { text: "Compete on the Leaderboard for monthly rewards", Icon: Trophy },
] as const;

/** Verified-artist opening concepts — self-tag mechanics stay contextual. */
const artistTips = [
  { text: "Your tracks get discovered through real clips", Icon: Film },
  { text: "Confirm your own tracks when you spot them", Icon: BadgeCheck },
  {
    text: "Set up releases so interested listeners can follow them through to release",
    Icon: Calendar,
  },
] as const;

const ARTIST_COMMUNITY_LINE =
  "Upload clips, help ID tracks and compete on the leaderboard.";

function TipsList({
  tips,
}: {
  tips: readonly { text: string; Icon: React.ComponentType<{ className?: string }> }[];
}) {
  return (
    <ul className="mt-4 space-y-2.5 text-sm text-foreground/90">
      {tips.map(({ text, Icon }) => (
        <li key={text} className="flex items-start gap-2.5">
          <Icon className={tipIconClass} aria-hidden />
          <span>{text}</span>
        </li>
      ))}
    </ul>
  );
}

function StatusPill({
  icon,
  label,
  tone = "identified",
}: {
  icon: JSX.Element;
  label: string;
  tone?: "identified" | "unidentified";
}) {
  return (
    <span
      className={STATUS_GLOW_PILL_CLASS}
      style={getGenreGlowPillStyle(
        tone === "unidentified" ? STATUS_GLOW_PILL_BG.unidentified : STATUS_GLOW_PILL_BG.identified,
        "text-white",
      )}
    >
      {icon}
      {label}
    </span>
  );
}

export function FirstLoginOnboardingModal({
  open,
  audience,
  onDismiss,
}: FirstLoginOnboardingModalProps) {
  useEffect(() => {
    if (!open) return;
    playSuccessNotification();
  }, [open]);

  const isArtist = audience === "artist";
  const ctaLabel = isArtist ? "Explore" : "Start exploring";

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onDismiss()}>
      <DialogContent
        forceMount
        hideCloseButton
        overlayClassName={APP_MATERIAL_OVERLAY_BACKDROP_CLASS}
        className={cn(
          AUTH_SURFACE_CLASS,
          PRELOGIN_AUTH_CANVAS_CLASS,
          APP_MATERIAL_DIALOG_CONTENT_CLASS,
          "w-[calc(100%-2rem)] max-h-[min(90dvh,40rem)] gap-0 overflow-y-auto scrollbar-hide p-5 sm:p-6",
        )}
        // Prevent Radix autofocus on the close control — iOS shows :focus-visible as a blue ring.
        onOpenAutoFocus={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        data-testid="first-login-onboarding-modal"
      >
        <DialogClose asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-3 top-3 h-11 w-11 text-muted-foreground"
            aria-label="Close"
            data-testid="button-first-login-onboarding-close"
            onClick={() => playInteractionLight()}
          >
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </DialogClose>

        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 6 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          {/* pr-8 clears the absolute X for title only — not the full-width CTA */}
          <DialogHeader className="space-y-1.5 pr-8 text-left">
            <DialogTitle className={APP_MATERIAL_OVERLAY_TITLE_CLASS}>
              Welcome to dub hub
            </DialogTitle>
            <DialogDescription className={APP_MATERIAL_OVERLAY_DESCRIPTION_CLASS}>
              {isArtist
                ? "Here’s how artists get the most out of dub hub."
                : "Here’s how to get the most out of your feed."}
            </DialogDescription>
          </DialogHeader>

          <TipsList tips={isArtist ? artistTips : communityTips} />

          {isArtist ? (
            <div className="mt-4 space-y-1" data-testid="first-login-artist-community">
              <p className="text-sm font-medium text-foreground">
                You’re also part of the community
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {ARTIST_COMMUNITY_LINE}
              </p>
            </div>
          ) : null}

          <div className="mt-5 space-y-2" data-testid="first-login-id-status-key">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              ID Status Key
            </p>
            <ul className="space-y-1.5">
              <li className={statusRowClass}>
                <StatusPill
                  icon={<Clock className={statusIconBase} />}
                  label="Unidentified"
                  tone="unidentified"
                />
                <span className={statusDescriptionClass}>
                  {"Track hasn't been identified yet."}
                </span>
              </li>
              <li className={statusRowClass}>
                <StatusPill
                  icon={<Users className={statusIconBase} />}
                  label="Community Identified"
                />
                <span className={statusDescriptionClass}>Suggested by the community.</span>
              </li>
              <li className={statusRowClass}>
                <StatusPill
                  icon={<Check className={`${statusIconBase} text-white`} />}
                  label="Moderator Confirmed"
                />
                <span className={statusDescriptionClass}>Confirmed by our moderators.</span>
              </li>
              <li className={statusRowClass}>
                <StatusPill
                  icon={<GoldVerifiedTick className={`${statusIconBase} text-[#FFD700]`} />}
                  label="Artist Identified"
                />
                <span className={statusDescriptionClass}>Confirmed by the artist.</span>
              </li>
              <li className={statusRowClass} data-testid="first-login-anonymous-identified">
                <StatusPill
                  icon={<EyeOff className={`${statusIconBase} text-white`} aria-hidden />}
                  label={IDENTIFIED_PILL_LABEL}
                />
                <span className="whitespace-nowrap text-[11px] leading-snug text-muted-foreground">
                  Artist confirmed. Hidden until release.
                </span>
              </li>
            </ul>
          </div>

          <Button
            type="button"
            onClick={() => {
              playInteractionLight();
              onDismiss();
            }}
            className={cn("mt-5 w-full", APP_MATERIAL_OVERLAY_PRIMARY_ACTION_CLASS)}
            data-testid="button-first-login-onboarding-dismiss"
          >
            {ctaLabel}
          </Button>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
