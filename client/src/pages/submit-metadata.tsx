import { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { INPUT_LIMITS } from "@shared/input-limits";
import type { PostWithUser } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ArrowLeft } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useUser } from "@/lib/user-context";
import { supabase } from "@/lib/supabaseClient";

const getTodayInputValue = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const todayInputValue = getTodayInputValue();

const submitFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(INPUT_LIMITS.postTitle, `Title must be at most ${INPUT_LIMITS.postTitle} characters`),
  genre: z.string().min(1, "Genre is required").max(INPUT_LIMITS.postGenre),
  description: z.string().max(INPUT_LIMITS.postDescription, `Description must be at most ${INPUT_LIMITS.postDescription} characters`),
  djName: z.string().max(INPUT_LIMITS.postDjName, `Must be at most ${INPUT_LIMITS.postDjName} characters`),
  location: z.string().max(INPUT_LIMITS.postLocation, `Must be at most ${INPUT_LIMITS.postLocation} characters`),
  playedDate: z.string().optional().refine((v) => !v || v <= todayInputValue, {
    message: "Date cannot be in the future",
  }),
});

type SubmitFormData = z.infer<typeof submitFormSchema>;

const genres = [
  { value: "DnB", label: "Drum & Bass" },
  { value: "UKG", label: "UK Garage" },
  { value: "Dubstep", label: "Dubstep" },
  { value: "Bassline", label: "Bassline" },
  { value: "House", label: "House" },
  { value: "Techno", label: "Techno" },
  { value: "Trance", label: "Trance" },
  { value: "Other", label: "Other" },
];

export default function SubmitMetadata() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { currentUser } = useUser();
  
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const simulatedProgressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const creepTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const hasRealProgressRef = useRef(false);
  const creepStartedRef = useRef(false);

  // Get trim state
  const [trimState, setTrimState] = useState<{fileName: string; fileType: string; fileSize: number; videoUrl: string} | null>(null);
  const [trimTimes, setTrimTimes] = useState<{startTime: number; endTime: number} | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  
  // Track if component is mounted to prevent state updates after unmount
  const isMountedRef = useRef(true);

  useEffect(() => {
    const savedState = localStorage.getItem('dubhub-trim-state');
    const savedTimes = localStorage.getItem('dubhub-trim-times');
    
    if (!savedState || !savedTimes) {
      toast({
        title: "No video data",
        description: "Please start from the beginning",
        variant: "destructive",
      });
      setLocation('/submit');
      return;
    }
    
    const state = JSON.parse(savedState);
    setTrimState(state);
    setTrimTimes(JSON.parse(savedTimes));
    
    // Reconstruct File from blob URL with proper error handling
    let blobUrlRevoked = false;
    
    fetch(state.videoUrl)
      .then(res => {
        if (!res.ok) {
          throw new Error(`Failed to fetch Blob URL: ${res.status} ${res.statusText}`);
        }
        return res.blob();
      })
      .then(blob => {
        if (blobUrlRevoked) {
          console.warn('Blob URL was revoked before file reconstruction completed');
          return;
        }
        
        if (blob.size === 0) {
          throw new Error('Blob is empty - Blob URL may have been revoked');
        }
        
        const file = new File([blob], state.fileName, { type: state.fileType });
        
        // Only update state if component is still mounted
        if (isMountedRef.current) {
          setVideoFile(file);
        }
      })
      .catch(err => {
        console.error('Failed to reconstruct file:', err);
        
        // Only show error if it's not a Blob URL revocation issue
        if (!err.message?.includes('revoked') && !err.message?.includes('Failed to fetch')) {
          toast({
            title: "Error",
            description: "Failed to load video file. Please try uploading again.",
            variant: "destructive",
          });
        } else {
          // Blob URL was revoked - redirect back to start
          console.warn('Blob URL no longer available, redirecting to start');
          toast({
            title: "Session Expired",
            description: "Please select your video again.",
            variant: "destructive",
          });
          setLocation('/submit');
        }
      });
    
    // Cleanup function to prevent accessing revoked Blob URL
    return () => {
      blobUrlRevoked = true;
      isMountedRef.current = false;
    };
  }, [toast, setLocation]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      // Don't revoke Blob URL here - let it be cleaned up by the submit success handler
      // or when user navigates back to trim page
    };
  }, []);

  const form = useForm<SubmitFormData>({
    resolver: zodResolver(submitFormSchema),
    defaultValues: {
      title: "",
      description: "",
      genre: "",
      djName: "",
      location: "",
      playedDate: "",
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ file, start, end }: { file: File; start: number; end: number }) => {
      const formData = new FormData();
      formData.append('video', file);
      formData.append('start', start.toString());
      formData.append('end', end.toString());
      
      const uploadUrl = '/api/upload-video';
      
      // Get auth token for the upload
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated. Please sign in to upload videos.');
      }
      
      // Use XMLHttpRequest for real upload progress tracking
      setUploadProgress(0);
      hasRealProgressRef.current = false;
      creepStartedRef.current = false;
      return new Promise<{ url: string; filename: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        const clearSimulated = () => {
          if (simulatedProgressRef.current) {
            clearInterval(simulatedProgressRef.current);
            simulatedProgressRef.current = null;
          }
        };

        const clearCreep = () => {
          creepTimeoutsRef.current.forEach(clearTimeout);
          creepTimeoutsRef.current = [];
        };

        // Slow creep 95→96→97→98→99 while waiting for server response
        const startPost95Creep = () => {
          if (creepStartedRef.current) return;
          creepStartedRef.current = true;
          const delays = [700, 800, 1100, 1400]; // ms: 95→96, 96→97, 97→98, 98→99
          let total = 0;
          [96, 97, 98, 99].forEach((target, i) => {
            total += delays[i];
            creepTimeoutsRef.current.push(
              setTimeout(() => setUploadProgress(target), total)
            );
          });
        };

        // Simulated progress when real progress unavailable (e.g. lengthComputable false)
        const startSimulatedProgress = () => {
          clearSimulated();
          const start = Date.now();
          simulatedProgressRef.current = setInterval(() => {
            const elapsed = (Date.now() - start) / 1000;
            // Ease toward 92% over ~12s: 92 * (1 - e^(-t/3))
            const pct = 92 * (1 - Math.exp(-elapsed / 3));
            setUploadProgress(prev => Math.min(prev, 92, pct));
          }, 80);
        };

        // Track upload progress - use fractional values for smooth bar
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            hasRealProgressRef.current = true;
            clearSimulated();
            const percentComplete = (e.loaded / e.total) * 100;
            const capped = Math.min(95, percentComplete);
            setUploadProgress(capped);
            if (percentComplete >= 95) startPost95Creep();
          } else if (!simulatedProgressRef.current) {
            startSimulatedProgress();
          }
        });

        // Start simulated after 400ms if no real progress events
        const simTimeout = setTimeout(() => {
          if (!hasRealProgressRef.current && !simulatedProgressRef.current) {
            startSimulatedProgress();
          }
        }, 400);

        // Handle completion
        xhr.addEventListener('load', () => {
          clearTimeout(simTimeout);
          clearSimulated();
          clearCreep();
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
              setUploadProgress(100);
              resolve(response);
            } catch (error) {
              reject(new Error('Invalid response from server'));
            }
          } else {
            try {
              const error = JSON.parse(xhr.responseText);
              reject(new Error(error.error || `Upload failed with status ${xhr.status}`));
            } catch {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          }
        });
        
        // Handle errors
        xhr.addEventListener('error', () => {
          clearTimeout(simTimeout);
          clearSimulated();
          clearCreep();
          reject(new Error('Network error during upload'));
        });

        xhr.addEventListener('abort', () => {
          clearTimeout(simTimeout);
          clearSimulated();
          clearCreep();
          reject(new Error('Upload cancelled'));
        });
        
        // Start upload with auth header
        xhr.open('POST', uploadUrl);
        xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
        xhr.send(formData);
      });
    },
    onSuccess: (data) => {
      setUploadedVideoUrl(data.url);
      setUploadProgress(0);
      toast({
        title: "Video Uploaded!",
        description: "Your video has been processed and uploaded successfully.",
      });
    },
    onError: (error: Error) => {
      setUploadProgress(0);
      toast({
        title: "Upload Failed",
        description: error.message || "There was an error uploading your video.",
        variant: "destructive",
      });
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (data: { formData: SubmitFormData; videoUrl: string }) => {
      if (!data.videoUrl) {
        throw new Error("Video URL is required");
      }

      // Map form data to backend's expected snake_case format
      const submitData = {
        title: data.formData.title.trim(),
        video_url: data.videoUrl,
        genre: data.formData.genre.trim(),
        description: data.formData.description?.trim() || null,
        location: data.formData.location?.trim() || null,
        dj_name: data.formData.djName?.trim() || null,
        played_date: data.formData.playedDate || null,
      };
      
      console.log("Submitting post with data:", { ...submitData, video_url: submitData.video_url.substring(0, 50) + "..." });
      const response = await apiRequest("POST", "/api/posts", submitData);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Unknown error" }));
        console.error("Post creation failed:", errorData);
        throw new Error(errorData.message || `Failed to create post: ${response.status}`);
      }
      const responseData = await response.json();
      console.log("Post created successfully:", responseData);
      return responseData;
    },
    onSuccess: async (created: { id?: string }) => {
      const newPostId = created?.id;
      if (!newPostId) {
        console.error("Post created but response missing id:", created);
      }

      toast({
        title: "Track Submitted!",
        description: "Your track ID request has been submitted successfully.",
      });
      
      // Clean up Blob URL only after successful submission
      // Use a small delay to ensure any pending operations complete
      setTimeout(() => {
        if (trimState?.videoUrl) {
          try {
            URL.revokeObjectURL(trimState.videoUrl);
          } catch (e) {
            console.warn('Error revoking Blob URL (may already be revoked):', e);
          }
        }
      }, 500);
      
      localStorage.removeItem('dubhub-trim-state');
      localStorage.removeItem('dubhub-trim-times');
      
      form.reset();
      setUploadedVideoUrl(null);
      setVideoFile(null); // Clear video file reference

      // Put the new post in every cached feed variant so it appears immediately under Hottest/Newest
      // (feed is limited to 10; a 0-like post may not be in the refetched page without this).
      if (newPostId) {
        try {
          const detailRes = await apiRequest("GET", `/api/posts/${newPostId}`);
          const fullPost = (await detailRes.json()) as PostWithUser;
          queryClient.setQueriesData(
            { queryKey: ["/api/posts"], exact: false },
            (old: PostWithUser[] | undefined) => {
              if (!old) return [fullPost];
              const idx = old.findIndex((p) => p.id === fullPost.id);
              if (idx >= 0) {
                const next = [...old];
                next[idx] = fullPost;
                return next;
              }
              return [fullPost, ...old];
            },
          );
        } catch (e) {
          console.warn("Could not load new post for feed cache; Home may fetch it:", e);
        }
      }

      // Invalidate user posts query to show new post in profile immediately
      if (currentUser?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/user", currentUser.id, "posts"] });
      }

      // Deep-link to the post so Home scrolls/highlights by ID (not feed position / sort order).
      if (newPostId) {
        setLocation(`/?post=${encodeURIComponent(newPostId)}`);
      } else {
        setLocation("/");
      }
    },
    onError: (error: Error) => {
      console.error("Post submission error:", error);
      toast({
        title: "Submission Failed",
        description: error.message || "There was an error submitting your track. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: SubmitFormData) => {
    if (!trimState || !trimTimes || !videoFile) {
      toast({
        title: "Error",
        description: "Missing video data",
        variant: "destructive",
      });
      return;
    }

    if (!uploadedVideoUrl) {
      try {
        setIsUploading(true);
        const uploadResult = await uploadMutation.mutateAsync({
          file: videoFile,
          start: trimTimes.startTime,
          end: trimTimes.endTime,
        });
        
        // Extract URL from upload result
        // The upload route returns: { success: true, url: publicUrl, filename, ... }
        const videoUrl = uploadResult.url;
        if (!videoUrl) {
          console.error("Upload result:", uploadResult);
          throw new Error("Upload succeeded but no URL returned. Check server logs.");
        }
        
        console.log("Video uploaded successfully, URL:", videoUrl);
        
        // Set the uploaded URL for UI state
        setUploadedVideoUrl(videoUrl);
        
        // Submit with the video URL directly
        submitMutation.mutate({ formData: data, videoUrl });
      } catch (error) {
        console.error("Upload/Submit error:", error);
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to upload or submit video",
          variant: "destructive",
        });
        return;
      } finally {
        setIsUploading(false);
      }
    } else {
      submitMutation.mutate({ formData: data, videoUrl: uploadedVideoUrl });
    }
  };

  const handleBack = () => {
    // Don't revoke Blob URL here - it's still needed for the trim page
    // The trim page will handle cleanup when user navigates away
    setLocation('/trim-video');
  };

  if (!trimState || !trimTimes) {
    return null;
  }

  return (
    <div className="flex-1 bg-dark overflow-y-auto">
      <div className="p-6 pb-24">
        <div className="max-w-md mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBack}
              data-testid="button-back-metadata"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-2xl font-bold">Track Details</h1>
          </div>

          <div className="bg-surface/50 p-4 rounded-lg mb-6">
            <p className="text-sm text-gray-400">
              Clip duration: {Math.round(trimTimes.endTime - trimTimes.startTime)}s
            </p>
          </div>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-gray-300">Title *</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="e.g., Amazing DnB track from Fabric"
                        className="bg-surface border-gray-600 text-white placeholder-gray-400"
                        data-testid="input-title"
                        maxLength={INPUT_LIMITS.postTitle}
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <p className="text-xs text-gray-500 text-right">
                      {(field.value?.length ?? 0)} / {INPUT_LIMITS.postTitle}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="genre"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-gray-300">Genre *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || undefined}>
                      <FormControl>
                        <SelectTrigger className="bg-surface border-gray-600 text-white" data-testid="select-genre">
                          <SelectValue placeholder="Select genre..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {genres.map((genre) => (
                          <SelectItem key={genre.value} value={genre.value}>
                            {genre.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-gray-300">Description</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Tell us about this track... where did you hear it? What makes it special?"
                        className="bg-surface border-gray-600 text-white placeholder-gray-400 resize-none"
                        rows={4}
                        data-testid="textarea-description"
                        maxLength={INPUT_LIMITS.postDescription}
                        {...field} 
                      />
                    </FormControl>
                    <p className="text-xs text-gray-500 text-right">
                      {(field.value?.length ?? 0)} / {INPUT_LIMITS.postDescription}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 gap-4">
                <FormField
                  control={form.control}
                  name="playedDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-gray-300">Date</FormLabel>
                      <FormControl>
                        <Input 
                          type="date" 
                          max={todayInputValue}
                          className="bg-surface border-gray-600 text-white"
                          data-testid="input-date"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-gray-300">Location</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="e.g., Fabric London, Printworks"
                        className="bg-surface border-gray-600 text-white placeholder-gray-400"
                        data-testid="input-location"
                        maxLength={INPUT_LIMITS.postLocation}
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="djName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-gray-300">Played by</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="e.g., DJ Name"
                        className="bg-surface border-gray-600 text-white placeholder-gray-400"
                        data-testid="input-dj"
                        maxLength={INPUT_LIMITS.postDjName}
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {isUploading && (
                <div className="rounded-lg bg-surface/80 border border-gray-700/50 p-4 space-y-3">
                  <Progress
                    value={uploadProgress}
                    className="h-2.5 bg-gray-800"
                  />
                  <p className="text-sm text-gray-400 text-center tabular-nums">
                    Uploading... {Math.round(uploadProgress)}%
                  </p>
                </div>
              )}
              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary/90"
                disabled={isUploading || submitMutation.isPending}
                data-testid="button-submit"
              >
                {isUploading || submitMutation.isPending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    {isUploading ? "Uploading..." : "Submitting..."}
                  </>
                ) : (
                  "Submit Track ID"
                )}
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
