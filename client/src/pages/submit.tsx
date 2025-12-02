import { useRef, useEffect } from "react";
import { CloudUpload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

export default function Submit() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-open file picker when component mounts
  useEffect(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith('video/')) {
      toast({
        title: "Invalid File",
        description: "Please select a video file.",
        variant: "destructive",
      });
      return;
    }
    
    // Store the actual file in a way we can retrieve it
    const reader = new FileReader();
    
    reader.onerror = () => {
      toast({
        title: "Error",
        description: "Failed to read video file. Please try again.",
        variant: "destructive",
      });
    };
    
    reader.onload = () => {
      try {
        const arrayBuffer = reader.result as ArrayBuffer;
        const blob = new Blob([arrayBuffer], { type: file.type });
        const blobUrl = URL.createObjectURL(blob);
        
        // Store state with Blob URL - this will be used for preview
        localStorage.setItem('dubhub-trim-state', JSON.stringify({
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          videoUrl: blobUrl
        }));
        
        // Navigate to trim page
        setLocation('/trim-video');
      } catch (error) {
        console.error('Error creating Blob URL:', error);
        toast({
          title: "Error",
          description: "Failed to process video file. Please try again.",
          variant: "destructive",
        });
      }
    };
    
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="flex-1 bg-dark overflow-y-auto">
      <div className="p-6 pb-24">
        <div className="max-w-md mx-auto">
          <h1 className="text-2xl font-bold mb-6 text-center">Submit Track ID</h1>
          
          <div className="space-y-6">
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-300">Select a Video</p>
              <div 
                className="border-2 border-dashed rounded-lg p-12 text-center bg-surface/50 border-gray-600 cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
                data-testid="button-select-video"
              >
                <div className="space-y-4">
                  <CloudUpload className="w-16 h-16 text-gray-400 mx-auto" />
                  <p className="text-sm text-gray-300">Click to select a video</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileSelect(file);
                    }}
                    data-testid="input-file"
                  />
                  <p className="text-xs text-gray-500 mt-4">
                    You'll trim your video to a 30-second clip next
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
