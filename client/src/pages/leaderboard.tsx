import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Trophy, Medal, Award, TrendingUp, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { useUser } from "@/lib/user-context";

interface LeaderboardEntry {
  user_id: string;
  username: string;
  profile_image: string | null;
  score: number;
  correct_ids: number;
  reputation: number;
  created_at: string;
  account_type: string;
  moderator: boolean;
  role: string;
}

type TimeFilter = "month" | "year" | "all";

// Editable monthly rewards - update these each month
const MONTHLY_REWARDS = {
  users: "2 x VIP Festival Tickets",
  artists: "4 hours studio time at Pirate Studios"
};

const getCurrentMonth = () => new Date().toLocaleString('default', { month: 'long' });

export default function Leaderboard() {
  const { userType, currentUser } = useUser();
  const [activeTab, setActiveTab] = useState<"users" | "artists">("users");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const currentUserId = currentUser?.id;

  // Fetch user leaderboard
  const { data: userLeaderboard = [], isLoading: isLoadingUsers } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/leaderboard/users"],
  });

  // Fetch artist leaderboard
  const { data: artistLeaderboard = [], isLoading: isLoadingArtists } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/leaderboard/artists"],
  });

  // Filter by time period
  const filterByTime = (entries: LeaderboardEntry[]): LeaderboardEntry[] => {
    if (timeFilter === "all") return entries;
    
    const now = new Date();
    const filtered = entries.filter(entry => {
      const entryDate = new Date(entry.created_at);
      
      if (timeFilter === "month") {
        return entryDate.getMonth() === now.getMonth() && 
               entryDate.getFullYear() === now.getFullYear();
      }
      
      if (timeFilter === "year") {
        return entryDate.getFullYear() === now.getFullYear();
      }
      
      return true;
    });
    
    return filtered;
  };

  const filteredUserLeaderboard = filterByTime(userLeaderboard);
  const filteredArtistLeaderboard = filterByTime(artistLeaderboard);
  const currentLeaderboard = activeTab === "users" ? filteredUserLeaderboard : filteredArtistLeaderboard;
  const currentUserRank = currentLeaderboard.findIndex(entry => entry.user_id === currentUserId) + 1;

  const isLoading = activeTab === "users" ? isLoadingUsers : isLoadingArtists;

  // Calculate level from reputation
  const getLevel = (reputation: number) => {
    return Math.floor(reputation / 100) + 1;
  };

  const getLevelProgress = (reputation: number) => {
    return (reputation % 100);
  };

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Trophy className="w-6 h-6 text-yellow-500" />;
    if (rank === 2) return <Medal className="w-6 h-6 text-gray-400" />;
    if (rank === 3) return <Award className="w-6 h-6 text-amber-600" />;
    return null;
  };

  const LeaderboardEntry = ({ entry, rank }: { entry: LeaderboardEntry; rank: number }) => {
    const isCurrentUser = entry.user_id === currentUserId;
    const level = getLevel(entry.reputation);
    const levelProgress = getLevelProgress(entry.reputation);

    // Use the profile image from the entry, or fall back to a placeholder
    const profileImageUrl = entry.profile_image || `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80&h=80&fit=crop&crop=face&random=${entry.user_id}`;

    return (
      <div
        className={`flex items-center gap-4 p-4 rounded-lg border transition-all hover:scale-[1.02] ${
          isCurrentUser 
            ? "bg-primary/10 border-primary" 
            : "bg-card border-border hover:bg-accent/50"
        }`}
        data-testid={`leaderboard-entry-${entry.user_id}`}
      >
        {/* Rank */}
        <div className="w-12 flex items-center justify-center" data-testid={`rank-${rank}`}>
          {getRankIcon(rank) || (
            <span className="font-mono text-xl font-bold text-muted-foreground">
              {rank}
            </span>
          )}
        </div>

        {/* Avatar with Profile Picture */}
        <div className="relative">
          <img 
            src={profileImageUrl} 
            alt={entry.username}
            className="w-12 h-12 rounded-full object-cover"
            onError={(e) => {
              // Fallback to initials if image fails to load
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              target.nextElementSibling?.classList.remove('hidden');
            }}
          />
          <div className="hidden w-12 h-12 rounded-full bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center text-white font-bold">
            {entry.username.charAt(0).toUpperCase()}
          </div>
          {entry.moderator && (
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs">
              M
            </div>
          )}
        </div>

        {/* User Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-lg truncate" data-testid={`username-${entry.user_id}`}>
              {entry.username}
            </span>
            {isCurrentUser && (
              <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                You
              </span>
            )}
          </div>
          
          {/* Level Bar with Gradient */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-muted-foreground">Level {level}</span>
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-primary via-primary to-primary/70 transition-all duration-300 rounded-full"
                style={{ width: `${levelProgress}%` }}
              />
            </div>
            <span className="text-xs font-mono text-muted-foreground">{levelProgress}%</span>
          </div>
        </div>

        {/* Confirmed IDs */}
        <div className="text-right">
          <div className="font-mono text-2xl font-bold" data-testid={`confirmed-ids-${entry.user_id}`}>
            {entry.correct_ids}
          </div>
          <div className="text-xs text-muted-foreground">Confirmed IDs</div>
        </div>
      </div>
    );
  };

  const RewardsBanner = () => {
    const reward = activeTab === "users" ? MONTHLY_REWARDS.users : MONTHLY_REWARDS.artists;
    const recipientType = activeTab === "users" ? "User" : "Artist";

    return (
      <div 
        className="relative overflow-hidden rounded-xl bg-gradient-to-r from-primary/20 via-primary/10 to-primary/5 border border-primary/20 p-6 mb-6"
        data-testid="rewards-banner"
      >
        <div className="flex items-center gap-4">
          <Trophy className="w-12 h-12 text-primary" />
          <div className="flex-1">
            <h3 className="text-lg font-semibold mb-1">
              🏆 {getCurrentMonth()} Reward: {reward}
            </h3>
            <p className="text-sm text-muted-foreground">
              For the top {recipientType}
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="bg-gradient-to-b from-primary/5 to-background border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <h1 className="text-4xl font-bold mb-2" data-testid="page-title">Leaderboard</h1>
          <p className="text-muted-foreground">
            Top performers ranked by verified music identifications
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "users" | "artists")} className="mb-6">
          <TabsList className="grid w-full grid-cols-2 mb-6" data-testid="leaderboard-tabs">
            <TabsTrigger value="users" data-testid="tab-users">
              Users
            </TabsTrigger>
            <TabsTrigger value="artists" data-testid="tab-artists">
              Artists
            </TabsTrigger>
          </TabsList>

          {/* Time Filters */}
          <div className="flex gap-2 mb-6 overflow-x-auto" data-testid="time-filters">
            <Button
              variant={timeFilter === "month" ? "default" : "outline"}
              size="sm"
              onClick={() => setTimeFilter("month")}
              data-testid="filter-month"
            >
              This Month
            </Button>
            <Button
              variant={timeFilter === "year" ? "default" : "outline"}
              size="sm"
              onClick={() => setTimeFilter("year")}
              data-testid="filter-year"
            >
              This Year
            </Button>
            <Button
              variant={timeFilter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setTimeFilter("all")}
              data-testid="filter-all"
            >
              All Time
            </Button>
          </div>

          <TabsContent value="users" className="mt-0">
            <RewardsBanner />
            
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-24 bg-card rounded-lg animate-pulse" />
                ))}
              </div>
            ) : filteredUserLeaderboard.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No users found for this period</p>
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => setTimeFilter("all")}
                  data-testid="view-all-time"
                >
                  View All Time Leaderboard
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredUserLeaderboard.map((entry, index) => (
                  <LeaderboardEntry key={entry.user_id} entry={entry} rank={index + 1} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="artists" className="mt-0">
            <RewardsBanner />
            
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-24 bg-card rounded-lg animate-pulse" />
                ))}
              </div>
            ) : filteredArtistLeaderboard.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No artists found for this period</p>
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => setTimeFilter("all")}
                  data-testid="view-all-time"
                >
                  View All Time Leaderboard
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredArtistLeaderboard.map((entry, index) => (
                  <LeaderboardEntry key={entry.user_id} entry={entry} rank={index + 1} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Floating "Your Rank" Indicator */}
        {currentUserRank > 0 && currentUserRank > 5 && (
          <div 
            className="fixed bottom-24 right-4 bg-primary text-primary-foreground px-4 py-2 rounded-full shadow-lg flex items-center gap-2"
            data-testid="your-rank-indicator"
          >
            <TrendingUp className="w-4 h-4" />
            <span className="font-semibold">You're #{currentUserRank}</span>
          </div>
        )}
      </div>
    </div>
  );
}
