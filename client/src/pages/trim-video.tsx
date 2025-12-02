import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, SkipBack, SkipForward, Check, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.js";

interface TrimVideoState {
  fileName: string;
  fileType: string;
  fileSize: number;
  videoUrl: string;
}

export default function TrimVideo() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(30);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionPluginRef = useRef<any>(null);
  const isLoadingRef = useRef<boolean>(false);
  
  // Refs for loop playback
  const startTimeRef = useRef(startTime);
  const endTimeRef = useRef(endTime);
  const isPlayingRef = useRef(isPlaying);

  // Get state from localStorage
  const [state, setState] = useState<TrimVideoState | null>(null);

  useEffect(() => {
    const savedState = localStorage.getItem('dubhub-trim-state');
    if (!savedState) {
      toast({
        title: "No video selected",
        description: "Please select a video first",
        variant: "destructive",
      });
      setLocation('/submit');
      return;
    }
    
    const parsed = JSON.parse(savedState);
    setState(parsed);
  }, [toast, setLocation]);

  // Keep refs in sync with state
  useEffect(() => {
    startTimeRef.current = startTime;
    endTimeRef.current = endTime;
    isPlayingRef.current = isPlaying;
  }, [startTime, endTime, isPlaying]);

  // Initialize WaveSurfer
  useEffect(() => {
    if (!waveformRef.current || !state?.videoUrl || !videoRef.current) return;
    
    isLoadingRef.current = true;
    
    const wsRegions = RegionsPlugin.create();
    regionPluginRef.current = wsRegions;
    
    const ws = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: '#6366f1',
      progressColor: '#4f46e5',
      cursorColor: '#818cf8',
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: 128,
      normalize: true,
      plugins: [wsRegions],
      backend: 'MediaElement',
      media: videoRef.current,
    });
    
    wavesurferRef.current = ws;
    
    ws.on('ready', () => {
      isLoadingRef.current = false;
      const videoDuration = ws.getDuration();
      setDuration(videoDuration);
      
      const initialEnd = Math.min(30, videoDuration);
      
      // Register the listener BEFORE adding the region
      wsRegions.on('region-updated', (region: any) => {
        const newStart = Math.max(0, region.start);
        const newEnd = Math.min(videoDuration, region.end);
        const maxEnd = Math.min(newStart + 30, videoDuration);
        
        if (newEnd - newStart > 30) {
          region.setOptions({ end: maxEnd });
          setStartTime(newStart);
          setEndTime(maxEnd);
          
          toast({
            title: "Maximum Duration",
            description: "Clips can be up to 30 seconds long.",
          });
        } else {
          setStartTime(newStart);
          setEndTime(newEnd);
        }
      });
      
      // Add the region
      wsRegions.addRegion({
        start: 0,
        end: initialEnd,
        color: 'rgba(99, 102, 241, 0.2)',
        drag: true,
        resize: true,
      });
      
      // Sync state
      setStartTime(0);
      setEndTime(initialEnd);
    });
    
    ws.on('timeupdate', (time) => {
      setCurrentTime(time);
      
      // Loop playback within the selected region
      if (isPlayingRef.current && time >= endTimeRef.current) {
        ws.setTime(startTimeRef.current);
        if (videoRef.current) {
          videoRef.current.currentTime = startTimeRef.current;
        }
      }
    });
    
    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));
    
    // Load with error handling to suppress abort errors
    const loadPromise = ws.load(state.videoUrl);
    
    // Silently handle load errors (especially abort errors from cleanup)
    loadPromise.catch((error) => {
      // Only log non-abort errors
      if (error.name !== 'AbortError' && isLoadingRef.current) {
        console.error('WaveSurfer load error:', error);
      }
    });
    
    return () => {
      // Mark as not loading to suppress error logging
      isLoadingRef.current = false;
      
      // Clean up WaveSurfer - this will abort any pending load operations
      if (ws) {
        try {
          ws.pause();
          ws.destroy();
        } catch (e) {
          // Suppress any cleanup errors
        }
      }
    };
  }, [state?.videoUrl, toast]);

  const togglePlayPause = useCallback(() => {
    if (wavesurferRef.current) {
      wavesurferRef.current.playPause();
    }
  }, []);

  const skipBackward = useCallback(() => {
    if (wavesurferRef.current) {
      const newTime = Math.max(0, currentTime - 5);
      wavesurferRef.current.setTime(newTime);
      if (videoRef.current) {
        videoRef.current.currentTime = newTime;
      }
    }
  }, [currentTime]);

  const skipForward = useCallback(() => {
    if (wavesurferRef.current) {
      const newTime = Math.min(duration, currentTime + 5);
      wavesurferRef.current.setTime(newTime);
      if (videoRef.current) {
        videoRef.current.currentTime = newTime;
      }
    }
  }, [currentTime, duration]);

  const handleNext = useCallback(async () => {
    if (endTime - startTime > 30) {
      toast({
        title: "Invalid Selection",
        description: "Please select a clip that's 30 seconds or less.",
        variant: "destructive",
      });
      return;
    }
    
    // Pause video
    wavesurferRef.current?.pause();
    
    // Save trim times
    localStorage.setItem('dubhub-trim-times', JSON.stringify({ startTime, endTime }));
    
    // Navigate to metadata page
    setLocation('/submit-metadata');
  }, [endTime, startTime, toast, setLocation]);

  const handleBack = () => {
    // Pause video before cleanup
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = ''; // Clear src to stop loading
    }
    
    // Clean up WaveSurfer first
    if (wavesurferRef.current) {
      try {
        wavesurferRef.current.pause();
        wavesurferRef.current.destroy();
      } catch (e) {
        // Suppress cleanup errors
      }
    }
    
    // Clean up Blob URL only after video is stopped
    // Use a small delay to ensure video element has released the Blob
    setTimeout(() => {
      if (state?.videoUrl) {
        try {
          URL.revokeObjectURL(state.videoUrl);
        } catch (e) {
          console.warn('Error revoking Blob URL:', e);
        }
      }
    }, 100);
    
    localStorage.removeItem('dubhub-trim-state');
    localStorage.removeItem('dubhub-trim-times');
    setLocation('/submit');
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    const ms = Math.floor((time % 1) * 10);
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${ms}`;
  };

  if (!state) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Header */}
      <div className="bg-surface/95 backdrop-blur-sm border-b border-gray-800 px-4 py-3 flex items-center justify-between z-30 relative">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold text-white">Trim Your Clip</h1>
        </div>
        <Button 
          onClick={handleNext}
          className="bg-primary hover:bg-primary/90"
          data-testid="button-next-trim"
        >
          <Check className="w-4 h-4 mr-2" />
          Next
        </Button>
      </div>

      {/* Video Container */}
      <div className="flex-1 relative overflow-hidden">
        {/* Full-screen Video */}
        <video
          ref={videoRef}
          src={state.videoUrl}
          className="absolute inset-0 w-full h-full object-contain z-10"
          playsInline
          data-testid="video-preview"
          onError={(e) => {
            console.error('Video load error:', e);
            // Silently handle Blob URL errors - they're often just cleanup-related
            const target = e.target as HTMLVideoElement;
            if (target.error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
              console.warn('Blob URL may have been revoked or is invalid');
            }
          }}
          onLoadStart={() => {
            console.log('Video loading started');
          }}
          onLoadedData={() => {
            console.log('Video data loaded successfully');
          }}
        />

        {/* Center Playback Controls - Overlaid on Video */}
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="pointer-events-auto flex items-center justify-center gap-4 mb-32">
            <Button
              variant="outline"
              size="icon"
              onClick={skipBackward}
              className="w-12 h-12 bg-black/50 backdrop-blur-md border-white/20 hover:bg-black/70 hover:border-white/40"
              data-testid="button-skip-backward"
              aria-label="Skip backward 5 seconds"
            >
              <SkipBack className="w-5 h-5 text-white" />
            </Button>
            
            <Button
              size="icon"
              className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-md border border-white/30 hover:bg-white/30 shadow-2xl"
              onClick={togglePlayPause}
              data-testid="button-play-pause"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause className="w-8 h-8 text-white" />
              ) : (
                <Play className="w-8 h-8 ml-1 text-white" />
              )}
            </Button>
            
            <Button
              variant="outline"
              size="icon"
              onClick={skipForward}
              className="w-12 h-12 bg-black/50 backdrop-blur-md border-white/20 hover:bg-black/70 hover:border-white/40"
              data-testid="button-skip-forward"
              aria-label="Skip forward 5 seconds"
            >
              <SkipForward className="w-5 h-5 text-white" />
            </Button>
          </div>
        </div>

        {/* Bottom Waveform & Timeline Overlay */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/95 via-black/70 to-transparent pt-24 pb-20 sm:pb-24">
          <div className="pointer-events-auto px-4 pb-safe space-y-4">
            {/* Time Info */}
            <div className="flex items-center justify-between text-sm">
              <div data-testid="text-current-time">
                <span className="font-mono text-white">{formatTime(currentTime)}</span>
              </div>
              <div className="text-center">
                <span className="text-white font-medium">
                  {formatTime(startTime)} - {formatTime(endTime)}
                </span>
                <span className="ml-2 text-gray-400">
                  ({formatTime(endTime - startTime)})
                </span>
              </div>
              <div data-testid="text-total-duration">
                <span className="font-mono text-white">{formatTime(duration)}</span>
              </div>
            </div>

            {/* Waveform */}
            <div 
              ref={waveformRef} 
              className="w-full bg-black/70 backdrop-blur-sm rounded-lg overflow-hidden mb-4"
              data-testid="waveform-container"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
