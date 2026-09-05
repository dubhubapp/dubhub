/**
 * Profile-triggered Verified Artist Tools introduction — awareness only, not a purchase UI.
 */

import { Check } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { playInteractionLight } from "@/lib/haptic";
import {
  APP_MATERIAL_DIALOG_CONTENT_CLASS,
  APP_MATERIAL_OVERLAY_BACKDROP_CLASS,
  APP_MATERIAL_OVERLAY_DESCRIPTION_CLASS,
  APP_MATERIAL_OVERLAY_PRIMARY_ACTION_CLASS,
  APP_MATERIAL_OVERLAY_SECONDARY_ACTION_CLASS,
  APP_MATERIAL_OVERLAY_TITLE_CLASS,
} from "@/lib/app-material";
import {
  ARTIST_SUBSCRIPTION_INTRO_BENEFIT_CHECK_CLASS,
  ARTIST_SUBSCRIPTION_INTRO_BRAND_EMPHASIS_CLASS,
  ARTIST_SUBSCRIPTION_INTRO_COPY,
} from "@/lib/artist-subscription-intro";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onViewTools: () => void;
  onMaybeLater: () => void;
};

export function ArtistSubscriptionIntroModal({
  open,
  onViewTools,
  onMaybeLater,
}: Props) {
  const brand = ARTIST_SUBSCRIPTION_INTRO_COPY.bodyBrand;
  const bodyRest = ARTIST_SUBSCRIPTION_INTRO_COPY.body.startsWith(brand)
    ? ARTIST_SUBSCRIPTION_INTRO_COPY.body.slice(brand.length)
    : ARTIST_SUBSCRIPTION_INTRO_COPY.body;

  return (
    <Dialog open={open}>
      <DialogContent
        forceMount
        hideCloseButton
        overlayClassName={APP_MATERIAL_OVERLAY_BACKDROP_CLASS}
        className={cn(
          APP_MATERIAL_DIALOG_CONTENT_CLASS,
          "w-[calc(100%-2rem)] max-h-[min(90dvh,40rem)] gap-0 overflow-y-auto p-5 sm:p-6",
        )}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        data-testid="artist-subscription-intro-modal"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 6 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          <DialogHeader className="space-y-1.5 text-left">
            <DialogTitle className={APP_MATERIAL_OVERLAY_TITLE_CLASS}>
              {ARTIST_SUBSCRIPTION_INTRO_COPY.title}
            </DialogTitle>
            <DialogDescription className={APP_MATERIAL_OVERLAY_DESCRIPTION_CLASS}>
              <span className={ARTIST_SUBSCRIPTION_INTRO_BRAND_EMPHASIS_CLASS}>{brand}</span>
              {bodyRest}
            </DialogDescription>
          </DialogHeader>

          <ul className="mt-4 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
            {ARTIST_SUBSCRIPTION_INTRO_COPY.benefits.map((text) => (
              <li key={text} className="flex items-start gap-2">
                <Check
                  className={ARTIST_SUBSCRIPTION_INTRO_BENEFIT_CHECK_CLASS}
                  aria-hidden
                />
                <span>{text}</span>
              </li>
            ))}
          </ul>

          <Button
            type="button"
            onClick={() => {
              playInteractionLight();
              onViewTools();
            }}
            className={cn("mt-5 w-full", APP_MATERIAL_OVERLAY_PRIMARY_ACTION_CLASS)}
            data-testid="button-artist-subscription-intro-view"
          >
            {ARTIST_SUBSCRIPTION_INTRO_COPY.primaryCta}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              playInteractionLight();
              onMaybeLater();
            }}
            className={cn("mt-2 w-full", APP_MATERIAL_OVERLAY_SECONDARY_ACTION_CLASS)}
            data-testid="button-artist-subscription-intro-later"
          >
            {ARTIST_SUBSCRIPTION_INTRO_COPY.secondaryCta}
          </Button>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
