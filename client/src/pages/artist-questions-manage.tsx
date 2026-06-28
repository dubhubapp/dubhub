import { useLocation } from "wouter";
import { ArrowLeft, MessageCircleQuestion } from "lucide-react";
import { SwipeBackPage } from "@/components/swipe-back-page";
import { Button } from "@/components/ui/button";
import { ArtistProfileQuestionsManage } from "@/components/artist-profile-questions-manage";
import { useUser } from "@/lib/user-context";
import { useEffect } from "react";

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
    <SwipeBackPage onBack={handleBack} className="flex-1 min-h-0 bg-background overflow-y-auto">
      <div className="app-page-top-pad px-6 pb-8">
        <div className="max-w-md mx-auto">
          <div className="flex items-center mb-6">
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 mr-2"
              onClick={handleBack}
              data-testid="button-artist-questions-back"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          </div>

          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <MessageCircleQuestion className="w-5 h-5 text-gray-300" />
              <h1 className="text-xl font-bold">Manage Artist Answers</h1>
            </div>
            <p className="text-sm text-gray-400">
              Edit answers that appear on your public artist profile.
            </p>
          </div>

          <ArtistProfileQuestionsManage />
        </div>
      </div>
    </SwipeBackPage>
  );
}
