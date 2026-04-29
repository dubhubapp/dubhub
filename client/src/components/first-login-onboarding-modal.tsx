import { Check, Clock, Users } from "lucide-react";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GoldVerifiedTick } from "@/components/verified-artist";
import { STATUS_GLOW_PILL_BG, getGenreGlowPillStyle } from "@/lib/genre-styles";
import { playInteractionLight, playSuccessNotification } from "@/lib/haptic";

type OnboardingAudience = "user" | "artist";

interface FirstLoginOnboardingModalProps {
  open: boolean;
  audience: OnboardingAudience;
  onDismiss: () => void;
}

const statusPillBase =
  "inline-flex w-fit items-center gap-1 rounded px-1.5 py-1 text-[10px] leading-snug ring-1 ring-white/15";
const statusIconBase = "h-3 w-3 shrink-0";

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
      className={statusPillBase}
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
  const userCommunityBullets = [
    "Upload clips you want ID’d",
    "Comment on posts if you think you know the track",
    "Filter by genre, status and order at the top",
    "Like posts to get notified when tracks release",
  ];
  const bullets = isArtist
    ? [
        "Your tracks get discovered through real clips",
        "Verify your own tracks to confirm IDs",
        "Set up releases to notify interested users",
        "Track performance in your profile",
      ]
    : userCommunityBullets;

  const secondaryTitle = isArtist
    ? "You’re also part of the community"
    : "Compete on the leaderboard";
  const secondaryText = "Identify tracks, climb the leaderboard, and win artist rewards like studio time, remix opportunities and production gear.";
  const ctaLabel = isArtist ? "Explore" : "Start exploring";

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onDismiss()}>
      <DialogContent
        forceMount
        overlayClassName="fixed inset-0 z-50 bg-black/58 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 duration-200"
        className="w-[calc(100%-2rem)] max-w-md rounded-2xl border-white/20 bg-[#0f1324]/92 p-0 text-white shadow-[0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur-xl"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 6 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="p-5 sm:p-6"
        >
          <DialogHeader className="space-y-1.5 text-left">
            <DialogTitle className="text-xl font-semibold text-white">Welcome to dub hub</DialogTitle>
            <DialogDescription className="text-sm text-white/70">
              Quick tips to get the most out of your feed.
            </DialogDescription>
          </DialogHeader>

          <ul className="mt-3.5 space-y-2.5 text-sm text-white/90">
            {bullets.map((bullet) => (
              <li key={bullet} className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#4ae9df]" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>

          <div className="mt-4 rounded-lg border border-white/15 bg-black/20 p-3">
            <p className="text-sm font-medium text-white">{secondaryTitle}</p>
            {isArtist ? (
              <>
                <ul className="mt-2 space-y-1.5 text-xs text-white/80">
                  {userCommunityBullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#4ae9df]" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs leading-relaxed text-white/75">{secondaryText}</p>
              </>
            ) : (
              <p className="mt-1 text-xs leading-relaxed text-white/75">
                Top users each month win tickets, unreleased dubs, merch & more.
              </p>
            )}
          </div>

          <div className="mt-4 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-white/60">ID Status Key</p>
            <div className="flex flex-wrap gap-2">
              <StatusPill icon={<Clock className={statusIconBase} />} label="Unidentified" tone="unidentified" />
              <StatusPill icon={<Users className={statusIconBase} />} label="Community Identified" />
              <StatusPill icon={<Check className={`${statusIconBase} text-white`} />} label="Identified" />
              <StatusPill
                icon={<GoldVerifiedTick className={`${statusIconBase} text-[#FFD700]`} />}
                label="Artist Identified"
              />
            </div>
            <p className="text-[11px] leading-relaxed text-white/65">
              IDs can be suggested by the community, confirmed by moderators, or confirmed by artists.
            </p>
          </div>

          <Button
            type="button"
            onClick={() => {
              playInteractionLight();
              onDismiss();
            }}
            className="mt-4 w-full bg-[#4ae9df] text-black hover:bg-[#4ae9df]/90"
            data-testid="button-first-login-onboarding-dismiss"
          >
            {ctaLabel}
          </Button>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
