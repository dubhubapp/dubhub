
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Send, Heart, CheckCircle, Award, XCircle, ChevronUp, ChevronDown, Filter } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useUser } from "@/lib/user-context";
import type { PostWithUser, CommentWithUser } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

interface CommentsModalProps {
  post: PostWithUser;
  isOpen: boolean;
  onClose: () => void;
}

export function CommentsModal({ post, isOpen, onClose }: CommentsModalProps) {
  const [newComment, setNewComment] = useState("");
  const [showArtistDropdown, setShowArtistDropdown] = useState(false);
  const [artistSearchTerm, setArtistSearchTerm] = useState("");
  const [currentMentionStart, setCurrentMentionStart] = useState(-1);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { profileImage: userProfileImage } = useUser();

  // Format time ago helper function
  const formatTimeAgo = (date: string | Date) => {
    const now = new Date();
    const commentDate = new Date(date);
    const diffInMinutes = Math.floor((now.getTime() - commentDate.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return "Just now";
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  // Function to highlight artist mentions in comment text
  const highlightArtistMentions = (text: string, tagStatus?: "pending" | "confirmed" | "denied") => {
    const parts = text.split(/(@[a-zA-Z0-9_]+)/g);
    
    return parts.map((part, index) => {
      if (part.startsWith('@')) {
        const username = part.substring(1);
        
        // Check if user is a verified artist
        const isVerifiedArtist = verifiedArtists.some((artist: any) => 
          artist.username === username || artist.displayName === username
        );
        
        let className = isVerifiedArtist 
          ? "text-yellow-500 font-medium cursor-pointer hover:underline" // Gold for verified artists
          : "text-[#4ae9df] font-medium cursor-pointer hover:underline"; // Blue for regular users
        
        if (tagStatus === "confirmed") {
          className = "text-green-600 font-medium bg-green-50 px-1 rounded cursor-pointer hover:underline";
        } else if (tagStatus === "denied") {
          className = "text-gray-400 font-medium line-through";
        }
        
        return (
          <span key={index} className={className} onClick={() => handleUserClick(username)}>
            {part}
          </span>
        );
      }
      return part;
    });
  };

  // Handle user profile popup
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [showUserPopup, setShowUserPopup] = useState(false);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const [replyingTo, setReplyingTo] = useState<{id: string, username: string} | null>(null);
  const [commentFilter, setCommentFilter] = useState<'all' | 'newest' | 'top'>('all');

  const handleUserClick = async (username: string) => {
    try {
      // First try to find in verified artists
      const artist = verifiedArtists.find((a: any) => a.username === username || a.displayName === username);
      if (artist) {
        setSelectedUser(artist);
        setShowUserPopup(true);
        return;
      }

      // If not found in artists, try to fetch user profile from API
      const response = await apiRequest('GET', `/api/user/profile/${username}`);
      const userData = await response.json();
      setSelectedUser(userData);
      setShowUserPopup(true);
    } catch (error) {
      console.error('Failed to fetch user:', error);
    }
  };

  const { data: comments = [] } = useQuery<CommentWithUser[]>({
    queryKey: ["/api/posts", post.id, "comments"],
    queryFn: async () => {
      const response = await fetch(`/api/posts/${post.id}/comments`);
      if (!response.ok) throw new Error("Failed to fetch comments");
      return response.json() as CommentWithUser[];
    },
    enabled: isOpen,
  });

  // Get verified artists for auto-complete
  const { data: verifiedArtists = [] } = useQuery<any[]>({
    queryKey: ["/api/artists/verified"],
    enabled: isOpen,
  });

  // Function to get karma display for a user
  const { data: userKarma } = useQuery<Record<string, number>>({
    queryKey: ["/api/users/karma"],
    queryFn: async () => {
      // Get karma for all users who have commented
      const userIds = Array.from(new Set(comments.flatMap(c => [c.userId, ...(c.replies?.map(r => r.userId) || [])])));
      const karmaData: Record<string, number> = {};
      
      for (const userId of userIds) {
        try {
          const response = await apiRequest("GET", `/api/user/${userId}/karma`);
          const data = await response.json() as { karma: number };
          karmaData[userId] = data.karma || 0;
        } catch {
          karmaData[userId] = 0;
        }
      }
      
      return karmaData;
    },
    enabled: isOpen && comments.length > 0,
  });

  // Handle comment input changes and artist mention detection
  const handleCommentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const cursorPosition = e.target.selectionStart || 0;
    
    setNewComment(value);
    
    // Check for artist mention (@) - improved regex to handle underscores
    const textBeforeCursor = value.substring(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
      
      // Only show dropdown if we have a valid mention context (allow underscores)
      if (textAfterAt.length >= 0 && !/\s/.test(textAfterAt)) {
        setArtistSearchTerm(textAfterAt);
        setCurrentMentionStart(lastAtIndex);
        setShowArtistDropdown(true);
      } else {
        setShowArtistDropdown(false);
      }
    } else {
      setShowArtistDropdown(false);
    }
  };

  // Handle artist selection from dropdown
  const handleArtistSelect = (artistName: string) => {
    if (currentMentionStart !== -1) {
      const beforeMention = newComment.substring(0, currentMentionStart);
      const afterCursor = newComment.substring(currentMentionStart + 1 + artistSearchTerm.length);
      const newValue = `${beforeMention}@${artistName}${afterCursor}`;
      setNewComment(newValue);
    }
    setShowArtistDropdown(false);
    setArtistSearchTerm("");
    setCurrentMentionStart(-1);
  };

  // Get current user for profile picture
  const { data: currentUser } = useQuery({
    queryKey: ["/api/user/current"],
    enabled: isOpen,
  });

  // Filter artists based on search term
  const filteredArtists = verifiedArtists.filter((artist: any) => 
    artist.displayName.toLowerCase().includes(artistSearchTerm.toLowerCase()) ||
    artist.username.toLowerCase().includes(artistSearchTerm.toLowerCase())
  ).slice(0, 5); // Limit to 5 results

  const addCommentMutation = useMutation({
    mutationFn: async (data: { content: string; parentId?: string }) => {
      // Extract artist tag from content if present
      const artistTagMatch = data.content.match(/@(\w+)/);
      const artistTag = artistTagMatch ? artistTagMatch[1] : null;
      
      return apiRequest("POST", `/api/posts/${post.id}/comments`, {
        body: data.content,
        artistTag: artistTag,
      });
    },
    onSuccess: (_, variables) => {
      setNewComment("");
      // If this was a reply, auto-expand the parent comment's replies
      if (variables.parentId) {
        setExpandedReplies(prev => {
          const newSet = new Set(prev);
          newSet.add(variables.parentId!);
          return newSet;
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/posts", post.id, "comments"] });
      toast({ title: "Comment added successfully!" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add comment", variant: "destructive" });
    },
  });

  // Voting functionality removed - no longer supported by backend
  // const voteMutation = ...
  // const removeVoteMutation = ...
  // const handleVote = ...
  
  const handleVote = () => {
    // Voting disabled - functionality removed
  };

  const toggleReplies = (commentId: string) => {
    setExpandedReplies(prev => {
      const newSet = new Set(prev);
      if (newSet.has(commentId)) {
        newSet.delete(commentId);
      } else {
        newSet.add(commentId);
      }
      return newSet;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newComment.trim()) {
      addCommentMutation.mutate({
        content: newComment.trim(),
        parentId: replyingTo?.id
      } as any);
      setReplyingTo(null); // Clear reply state after submitting
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md h-[60vh] p-0 bg-white/95 backdrop-blur-sm rounded-t-3xl fixed bottom-0 left-1/2 transform -translate-x-1/2 animate-in slide-in-from-bottom duration-300 border-0 shadow-2xl">
        <DialogTitle className="sr-only">Comments for track</DialogTitle>
        <DialogDescription className="sr-only">View and add comments for this track</DialogDescription>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <h3 className="text-lg font-semibold text-gray-900">Comments ({comments.reduce((total, comment) => total + 1 + (comment.replies?.length || 0), 0)})</h3>
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <Select value={commentFilter} onValueChange={(value: 'all' | 'newest' | 'top') => setCommentFilter(value)}>
                <SelectTrigger className="h-8 w-[100px] text-xs border-gray-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="top">Top Rated</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0 rounded-full hover:bg-gray-100"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Comments List */}
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-4">
          {(() => {
            let filteredComments = [...comments];
            
            switch (commentFilter) {
              case 'newest':
                filteredComments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                break;
              case 'top':
                filteredComments.sort((a, b) => (b.voteScore || 0) - (a.voteScore || 0));
                break;
              case 'all':
              default:
                // Keep original order
                break;
            }
            
            // Always pin identified comments to the top
            filteredComments.sort((a, b) => {
              if (a.isIdentified && !b.isIdentified) return -1;
              if (!a.isIdentified && b.isIdentified) return 1;
              return 0;
            });
            
            return filteredComments.map((comment) => (
              <div key={comment.id} className={`flex space-x-3 ${comment.isIdentified ? 'p-3 rounded-lg border-2 border-green-500 bg-green-50/30' : ''}`}>
              <div className="relative flex-shrink-0">
                <img
                  src={comment.user.profileImage || `https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face`}
                  alt={comment.user.username}
                  className="w-8 h-8 rounded-full"
                />
                {comment.user.userType === 'artist' && comment.user.isVerified && (
                  <div title="Verified Artist Profile">
                    <CheckCircle className="absolute -bottom-1 -right-1 w-3 h-3 text-[#FFD700] bg-white rounded-full" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <div className="flex items-center space-x-1">
                    <span 
                      className={`text-sm font-medium cursor-pointer hover:underline ${
                        comment.user.userType === 'artist' && comment.user.isVerified ? "text-[#FFD700]" : "text-gray-900"
                      }`}
                      onClick={() => {
                        setSelectedUser(comment.user);
                        setShowUserPopup(true);
                      }}
                    >
                      {comment.user.username}
                    </span>
                    {comment.user.userType === 'artist' && comment.user.isVerified && (
                      <div title="Verified Artist Profile">
                        <CheckCircle className="w-3 h-3 text-[#FFD700]" />
                      </div>
                    )}
                  </div>
                  {/* Community Identified Badge - Blue for pending moderator review */}
                  {!comment.isIdentified && post.verificationStatus === "community" && post.verifiedCommentId === comment.id && (
                    <div className="flex items-center space-x-1 bg-blue-500 px-2 py-0.5 rounded-full" data-testid={`badge-community-identified-${comment.id}`}>
                      <CheckCircle className="w-3 h-3 text-white" />
                      <span className="text-xs text-white font-bold">Community Identified</span>
                    </div>
                  )}
                  {/* Identified Track ID Badge - Green for moderator confirmed */}
                  {comment.isIdentified && (
                    <div className="flex items-center space-x-1 bg-green-500 px-2 py-0.5 rounded-full" data-testid={`badge-identified-${comment.id}`}>
                      <CheckCircle className="w-3 h-3 text-white" />
                      <span className="text-xs text-white font-bold">Identified Track ID</span>
                    </div>
                  )}
                  {/* Karma Score */}
                  {userKarma?.[comment.userId] && userKarma[comment.userId] > 0 && (
                    <div className="flex items-center space-x-1 bg-blue-50 px-2 py-0.5 rounded-full">
                      <Award className="w-3 h-3 text-blue-600" />
                      <span className="text-xs text-blue-600 font-medium">
                        {userKarma[comment.userId]}
                      </span>
                    </div>
                  )}
                  {/* Verified by Artist Badge */}
                  {comment.isVerifiedByArtist && (
                    <div className="flex items-center space-x-1 bg-green-50 px-2 py-0.5 rounded-full">
                      <CheckCircle className="w-3 h-3 text-green-600" />
                      <span className="text-xs text-green-600 font-medium">Verified by Artist</span>
                    </div>
                  )}
                  {/* Denied Tag Badge */}
                  {comment.tagStatus === "denied" && (
                    <div className="flex items-center space-x-1 bg-red-50 px-2 py-0.5 rounded-full">
                      <XCircle className="w-3 h-3 text-red-600" />
                      <span className="text-xs text-red-600 font-medium">Denied</span>
                    </div>
                  )}
                  <span className="text-xs text-gray-500">
                    {formatTimeAgo(comment.createdAt)}
                  </span>
                </div>
                <p className="text-sm text-gray-700 mt-1">
                  {highlightArtistMentions(comment.content, comment.tagStatus)}
                </p>
                <div className="flex items-center space-x-4 mt-2">
                  {/* Voting buttons */}
                  <div className="flex items-center space-x-2">
                    <button 
                      className={`flex items-center space-x-1 hover:bg-gray-100 rounded-full p-1 ${
                        comment.userVote === "upvote" ? "text-green-600 bg-green-50" : "text-gray-500"
                      }`}
                      onClick={() => handleVote(comment.id, "upvote", comment.userVote)}
                      data-testid={`button-upvote-${comment.id}`}
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <span className={`text-sm font-medium ${
                      (comment.voteScore || 0) > 0 ? "text-green-600" : 
                      (comment.voteScore || 0) < 0 ? "text-red-600" : "text-gray-500"
                    }`} data-testid={`vote-score-${comment.id}`}>
                      {comment.voteScore || 0}
                    </span>
                    <button 
                      className={`flex items-center space-x-1 hover:bg-gray-100 rounded-full p-1 ${
                        comment.userVote === "downvote" ? "text-red-600 bg-red-50" : "text-gray-500"
                      }`}
                      onClick={() => handleVote(comment.id, "downvote", comment.userVote)}
                      data-testid={`button-downvote-${comment.id}`}
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>
                  <button 
                    className="text-xs text-gray-500 hover:text-gray-700"
                    onClick={() => {
                      setReplyingTo({id: comment.id, username: comment.user.username});
                      setNewComment(`@${comment.user.username} `);
                    }}
                    data-testid={`reply-button-${comment.id}`}
                  >
                    Reply
                  </button>
                  {/* Toggle replies button */}
                  {comment.replies && comment.replies.length > 0 && (
                    <button 
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                      onClick={() => toggleReplies(comment.id)}
                      data-testid={`toggle-replies-${comment.id}`}
                    >
                      {expandedReplies.has(comment.id) 
                        ? `Hide ${comment.replies.length} replies` 
                        : `Show ${comment.replies.length} replies`
                      }
                    </button>
                  )}
                </div>
                
                {/* Show replies if any and expanded */}
                {comment.replies && comment.replies.length > 0 && expandedReplies.has(comment.id) && (
                  <div className="ml-8 mt-3 space-y-3 border-l-2 border-gray-100 pl-3">
                    {comment.replies.map((reply) => (
                      <div key={reply.id} className="flex space-x-2">
                        <img
                          src={reply.user.profileImage || `https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face`}
                          alt={reply.user.username}
                          className="w-6 h-6 rounded-full"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2">
                            <div className="flex items-center space-x-1">
                              <span 
                                className={`text-xs font-medium cursor-pointer hover:underline ${
                                  reply.user.userType === 'artist' && reply.user.isVerified ? "text-[#FFD700]" : "text-gray-900"
                                }`}
                                onClick={() => handleUserClick(reply.user.username)}
                              >
                                {reply.user.username}
                              </span>
                              {reply.user.userType === 'artist' && reply.user.isVerified && (
                                <div title="Verified Artist Profile">
                                  <CheckCircle className="w-3 h-3 text-[#FFD700]" />
                                </div>
                              )}
                            </div>
                            {/* Karma Score for Reply */}
                            {userKarma?.[reply.userId] && userKarma[reply.userId] > 0 && (
                              <div className="flex items-center space-x-1 bg-blue-50 px-1.5 py-0.5 rounded-full">
                                <Award className="w-2.5 h-2.5 text-blue-600" />
                                <span className="text-xs text-blue-600 font-medium">
                                  {userKarma[reply.userId]}
                                </span>
                              </div>
                            )}
                            {/* Verified by Artist Badge for Reply */}
                            {reply.isVerifiedByArtist && (
                              <div className="flex items-center space-x-1 bg-green-50 px-1.5 py-0.5 rounded-full">
                                <CheckCircle className="w-2.5 h-2.5 text-green-600" />
                                <span className="text-xs text-green-600 font-medium">Verified</span>
                              </div>
                            )}
                            {/* Denied Tag Badge for Reply */}
                            {reply.tagStatus === "denied" && (
                              <div className="flex items-center space-x-1 bg-red-50 px-1.5 py-0.5 rounded-full">
                                <XCircle className="w-2.5 h-2.5 text-red-600" />
                                <span className="text-xs text-red-600 font-medium">Denied</span>
                              </div>
                            )}
                            <span className="text-xs text-gray-500">
                              {formatTimeAgo(reply.createdAt)}
                            </span>
                          </div>
                          <p className="text-xs text-gray-700 mt-1">
                            {highlightArtistMentions(reply.content, reply.tagStatus)}
                          </p>
                          <div className="flex items-center space-x-3 mt-1">
                            {/* Voting buttons for replies */}
                            <div className="flex items-center space-x-1">
                              <button 
                                className={`flex items-center space-x-1 hover:bg-gray-100 rounded-full p-0.5 ${
                                  reply.userVote === "upvote" ? "text-green-600 bg-green-50" : "text-gray-500"
                                }`}
                                onClick={() => handleVote(reply.id, "upvote", reply.userVote)}
                                data-testid={`button-upvote-${reply.id}`}
                              >
                                <ChevronUp className="w-3 h-3" />
                              </button>
                              <span className={`text-xs font-medium ${
                                (reply.voteScore || 0) > 0 ? "text-green-600" : 
                                (reply.voteScore || 0) < 0 ? "text-red-600" : "text-gray-500"
                              }`} data-testid={`vote-score-${reply.id}`}>
                                {reply.voteScore || 0}
                              </span>
                              <button 
                                className={`flex items-center space-x-1 hover:bg-gray-100 rounded-full p-0.5 ${
                                  reply.userVote === "downvote" ? "text-red-600 bg-red-50" : "text-gray-500"
                                }`}
                                onClick={() => handleVote(reply.id, "downvote", reply.userVote)}
                                data-testid={`button-downvote-${reply.id}`}
                              >
                                <ChevronDown className="w-3 h-3" />
                              </button>
                            </div>
                            <button 
                              className="text-xs text-gray-500 hover:text-gray-700"
                              onClick={() => {
                                setReplyingTo({id: comment.id, username: reply.user.username});
                                setNewComment(`@${reply.user.username} `);
                              }}
                              data-testid={`reply-button-${reply.id}`}
                            >
                              Reply
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              </div>
            ));
          })()}
        </div>

        {/* Comment Input */}
        <div className="border-t border-gray-200 p-4">
          {/* Reply indicator */}
          {replyingTo && (
            <div className="mb-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-blue-600">Replying to</span>
                  <span className="text-sm font-medium text-blue-800">@{replyingTo.username}</span>
                </div>
                <button 
                  onClick={() => {
                    setReplyingTo(null);
                    setNewComment('');
                  }}
                  className="text-blue-400 hover:text-blue-600"
                  data-testid="cancel-reply"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
          <div className="relative">
            {/* Artist Auto-complete Dropdown */}
            {showArtistDropdown && filteredArtists.length > 0 && (
              <div className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-40 overflow-y-auto">
                {filteredArtists.map((artist: any) => (
                  <button
                    key={artist.id}
                    type="button"
                    onClick={() => handleArtistSelect(artist.username)}
                    className="w-full flex items-center space-x-3 p-3 hover:bg-gray-50 text-left border-b border-gray-100 last:border-b-0"
                    data-testid={`artist-option-${artist.id}`}
                  >
                    <img
                      src={artist.profileImage || `https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face`}
                      alt={artist.username}
                      className="w-8 h-8 rounded-full"
                    />
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium text-yellow-600">
                          {artist.displayName}
                        </span>
                        <CheckCircle className="w-3 h-3 text-yellow-400" />
                      </div>
                      <span className="text-xs text-gray-500">@{artist.username}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
            
            <form onSubmit={handleSubmit} className="flex space-x-2">
              <img
                src={userProfileImage || `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&h=120&fit=crop&crop=face`}
                alt="Your profile"
                className="w-8 h-8 rounded-full flex-shrink-0"
              />
              <Input
                value={newComment}
                onChange={handleCommentChange}
                placeholder={replyingTo ? `Replying to @${replyingTo.username}...` : "Add a comment... (Use @ to tag artists)"}
                className="flex-1 border-gray-300 rounded-full"
                disabled={addCommentMutation.isPending}
                data-testid="comment-input"
              />
              <Button
                type="submit"
                size="sm"
                disabled={!newComment.trim() || addCommentMutation.isPending}
                className="rounded-full px-4"
                data-testid="comment-submit"
              >
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        </div>

        {/* User Profile Popup */}
        {showUserPopup && selectedUser && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setShowUserPopup(false)}>
            <div className="bg-white rounded-2xl p-6 mx-4 max-w-sm w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="text-center">
                <div className="relative inline-block mb-4">
                  <img
                    src={selectedUser.profileImage || `https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&h=120&fit=crop&crop=face`}
                    alt={selectedUser.username}
                    className="w-20 h-20 rounded-full mx-auto"
                  />
                  {selectedUser.isVerified && (
                    <CheckCircle className="absolute bottom-0 right-2 w-6 h-6 text-yellow-400 bg-white rounded-full" />
                  )}
                </div>
                
                <h3 className={`text-xl font-bold mb-1 ${
                  selectedUser.isVerified ? "text-yellow-600" : "text-gray-900"
                }`}>
                  {selectedUser.displayName}
                </h3>
                
                <p className="text-gray-600 mb-2">@{selectedUser.username}</p>
                
                {/* Karma Score */}
                <div className="flex items-center justify-center space-x-2 mb-3">
                  {userKarma?.[selectedUser.id] && userKarma[selectedUser.id] > 0 && (
                    <div className="flex items-center space-x-1 bg-blue-50 px-3 py-1 rounded-full">
                      <Award className="w-4 h-4 text-blue-600" />
                      <span className="text-sm text-blue-600 font-medium">
                        {userKarma[selectedUser.id]} karma
                      </span>
                    </div>
                  )}
                </div>
                
                {selectedUser.isVerified && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                    <div className="flex items-center justify-center space-x-2">
                      <CheckCircle className="w-5 h-5 text-yellow-600" />
                      <span className="text-sm font-medium text-yellow-700">Verified Artist</span>
                    </div>
                  </div>
                )}
                
                <div className="flex items-center justify-center space-x-4 text-sm text-gray-600">
                  <div className="text-center">
                    <div className="font-medium">Level {selectedUser.level}</div>
                    <div className="text-xs">Experience</div>
                  </div>
                  <div className="w-px h-8 bg-gray-300"></div>
                  <div className="text-center">
                    <div className="font-medium">{selectedUser.currentXP}</div>
                    <div className="text-xs">XP Points</div>
                  </div>
                </div>
                
                <Button 
                  onClick={() => setShowUserPopup(false)}
                  className="w-full mt-4"
                  data-testid="close-profile-popup"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
