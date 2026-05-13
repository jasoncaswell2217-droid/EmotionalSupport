import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, CornerDownLeft, Image as ImageIcon, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PsychInputProps {
  onSend: (message: string, images?: string[]) => void;
  onMoodUpdate: (mood: string) => void;
  disabled?: boolean;
}

export function PsychInput({ onSend, onMoodUpdate, disabled }: PsychInputProps) {
  const [text, setText] = useState(() => {
    return localStorage.getItem('psych_draft') || '';
  });
  const [images, setImages] = useState<string[]>([]);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const moodTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Real-time Mood Detection Engine (Heuristic-based for instant feedback)
  useEffect(() => {
    if (moodTimerRef.current) clearTimeout(moodTimerRef.current);
    
    moodTimerRef.current = setTimeout(() => {
      const lower = text.toLowerCase();
      let detectedMood = "Neutral";
      
      const moodMap = {
        Anxious: ['worried', 'scared', 'fear', 'afraid', 'panic', 'nervous', 'stress', 'stuck', 'impossible', 'cant'],
        Frustrated: ['annoyed', 'angry', 'hate', 'stupid', 'mad', 'useless', 'unfair', 'bother', 'wrong', 'stop'],
        Melancholy: ['sad', 'lonely', 'miss', 'hurt', 'pain', 'sorry', 'empty', 'lost', 'tired', 'down'],
        Analytical: ['why', 'how', 'because', 'think', 'reason', 'logic', 'pattern', 'understand', 'explain', 'fact'],
        Determined: ['will', 'focus', 'ready', 'must', 'plan', 'goal', 'action', 'overcome', 'strong', 'can'],
      };

      for (const [mood, keywords] of Object.entries(moodMap)) {
        if (keywords.some(k => lower.includes(k))) {
          detectedMood = mood;
          break;
        }
      }

      if (text.length > 5) {
        onMoodUpdate(detectedMood);
      } else {
        onMoodUpdate("Observing...");
      }
    }, 400);

    return () => {
      if (moodTimerRef.current) clearTimeout(moodTimerRef.current);
    };
  }, [text, onMoodUpdate]);

  // Debounced Autosave draft to localStorage
  useEffect(() => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    
    autosaveTimerRef.current = setTimeout(() => {
      localStorage.setItem('psych_draft', text);
    }, 1000);

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [text]);

  const handleSend = () => {
    if ((text.trim() || images.length > 0) && !disabled) {
      onSend(text, images);
      setText('');
      setImages([]);
      localStorage.removeItem('psych_draft');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessingImage(true);
    const newImages: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 4 * 1024 * 1024) {
        alert("Image too large. Please use images smaller than 4MB.");
        continue;
      }

      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          // Extract just the base64 part
          const base64Content = result.split(',')[1];
          resolve(base64Content);
        };
        reader.readAsDataURL(file);
      });
      newImages.push(base64);
    }

    setImages(prev => [...prev, ...newImages]);
    setIsProcessingImage(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [text]);

  return (
    <div className="relative w-full mx-auto p-0 group">
      {/* 1px refined glow container */}
      <div className={cn(
        "relative rounded-2xl p-[1px] transition-all duration-500",
        isFocused ? "animate-bento-glow" : "bg-bento-border",
        disabled && "opacity-50 grayscale pointer-events-none"
      )}>
        {/* Inner container */}
        <div className="bg-bento-card rounded-[14px] flex flex-col p-2 md:p-3">
          
          {/* Image Previews */}
          {images.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2 md:mb-3 px-1">
              {images.map((img, idx) => (
                <div key={idx} className="relative group/img w-12 h-12 md:w-16 md:h-16 rounded-lg overflow-hidden border border-bento-border shrink-0">
                  <img src={`data:image/jpeg;base64,${img}`} className="w-full h-full object-cover" alt="Preview" />
                  <button 
                    onClick={() => removeImage(idx)}
                    className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-1 opacity-0 group-hover/img:opacity-100 transition-opacity"
                  >
                    <X size={10} className="text-white" />
                  </button>
                </div>
              ))}
              {isProcessingImage && (
                <div className="w-12 h-12 md:w-16 md:h-16 rounded-lg bg-brand-text-muted/5 flex items-center justify-center animate-pulse border border-bento-border">
                  <Loader2 size={14} className="text-brand-cyan animate-spin" />
                </div>
              )}
            </div>
          )}

          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Share context, behavior, or visual scene..."
            className="w-full bg-transparent border-none focus:ring-0 outline-none focus:outline-none text-brand-text placeholder-brand-text-muted/40 p-1 resize-none max-h-[150px] font-sans text-[13px] md:text-[14px]"
            style={{ minHeight: '60px' }}
          />
          
          <div className="flex items-center justify-between mt-2 md:mt-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || images.length >= 4}
                className="p-3 md:p-2 bg-brand-text-muted/5 hover:bg-brand-text-muted/10 rounded-xl transition-colors border border-bento-border text-brand-text-muted hover:text-brand-cyan min-w-[44px] min-h-[44px] flex items-center justify-center"
                title="Add visual evidence (JPG/PNG)"
              >
                <ImageIcon size={20} className="md:w-[18px] md:h-[18px]" />
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleImageUpload} 
                accept="image/*" 
                className="hidden" 
                multiple
              />
              <div className="flex gap-4 text-[10px] text-brand-text-muted uppercase tracking-widest font-semibold hidden md:block">
                <span>Shift+Enter for new line</span>
              </div>
            </div>
            
            <button
              onClick={handleSend}
              disabled={(!text.trim() && images.length === 0) || disabled}
              className={cn(
                "flex items-center justify-center px-4 md:px-6 py-3 md:py-2 rounded-xl transition-all font-semibold text-[13px] gap-2 min-h-[44px]",
                "bg-brand-purple text-white hover:opacity-90",
                "disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_4px_15px_var(--theme-accent-2)]"
              )}
            >
              <Send size={16} className="md:w-[14px] md:h-[14px]" />
              <span className="hidden sm:inline">Run Deep Analysis</span>
              <span className="sm:hidden">Analyze</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
