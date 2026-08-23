import { useLocation } from "wouter";
import { ChevronLeft, MessageCircleQuestion } from "lucide-react";
import { SwipeBackPage } from "@/components/swipe-back-page";
import { ArtistProfileQuestionsManage } from "@/components/artist-profile-questions-manage";
import { useUser } from "@/lib/user-context";
import { useEffect } from "react";
import {
  APP_MATERIAL_BACK_BUTTON_CLASS,
  APP_MATERIAL_BACK_ICON_CLASS,
} from "@/lib/app-material";
import { cn } from "@/lib/utils";
import {
  SETTINGS_BACK_BUTTON_CLASS,
  SETTINGS_BACK_ICON_CLASS,
  SETTINGS_HEADER_TO_SECTIONS_CLASS,
  SETTINGS_PAGE_PAD_CLASS,
  SETTINGS_PAGE_SCROLL_CLASS,
  SETTINGS_SUBTITLE_CLASS,
  SETTINGS_TITLE_AFTER_BACK_CLASS,
} from "@/lib/settings-presentation";

export default function ArtistQuestionsManagePage() {
  const [, navigate] = useLocation();
  const { verifiedArtist, userType } = useUser();

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    navigate("/settings", { replace: true });
  };

  useEffect(() => {
    if (userType !== "artist" || !verifiedArtist) {
      navigate("/settings", { replace: true });
    }
  }, [userType, verifiedArtist, navigate]);

  if (userType !== "artist" || !verifiedArtist) {
    return null;
  }

  return (
    <SwipeBackPage onBack={handleBack} className={SETTINGS_PAGE_SCROLL_CLASS}>
      <div className={SETTINGS_PAGE_PAD_CLASS}>
        <div className="max-w-md mx-auto">
          <div>
            <button
              type="button"
              onClick={handleBack}
              className={cn(APP_MATERIAL_BACK_BUTTON_CLASS, SETTINGS_BACK_BUTTON_CLASS)}
              aria-label="Back"
              data-testid="button-artist-questions-back"
            >
              <ChevronLeft
                className={cn(APP_MATERIAL_BACK_ICON_CLASS, SETTINGS_BACK_ICON_CLASS)}
                strokeWidth={2}
                aria-hidden
              />
            </button>
            <div className={SETTINGS_TITLE_AFTER_BACK_CLASS}>
              <MessageCircleQuestion className="w-5 h-5 text-muted-foreground" />
              <h1 className="text-xl font-bold">Manage Artist Answers</h1>
            </div>
            <p className={SETTINGS_SUBTITLE_CLASS}>
              Edit answers that appear on your public artist profile.
            </p>
          </div>

          <div className={SETTINGS_HEADER_TO_SECTIONS_CLASS}>
            <ArtistProfileQuestionsManage />
          </div>
        </div>
      </div>
    </SwipeBackPage>
  );
}
