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
    <div className="w-full mx-auto p-2 pb-4 md:p-0">
      {/* Image Previews - Moved outside the pill to keep it clean */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3 px-2 md:px-0">
          {images.map((img, idx) => (
            <div key={idx} className="relative group/img w-14 h-14 md:w-16 md:h-16 rounded-xl overflow-hidden border border-brand-border shadow-2xl shrink-0">
              <img src={`data:image/jpeg;base64,${img}`} className="w-full h-full object-cover" alt="Preview" />
              <button 
                onClick={() => removeImage(idx)}
                className="absolute top-1 right-1 bg-brand-surface/80 backdrop-blur-md rounded-full p-1 opacity-0 group-hover/img:opacity-100 transition-all hover:scale-110"
              >
                <X size={12} className="text-brand-text" />
              </button>
            </div>
          ))}
          {isProcessingImage && (
            <div className="w-14 h-14 md:w-16 md:h-16 rounded-xl bg-brand-surface flex items-center justify-center animate-pulse border border-brand-border">
              <Loader2 size={16} className="text-brand-cyan animate-spin" />
            </div>
          )}
        </div>
      )}

      {/* Main Input Row */}
      <div className={cn(
        "flex items-end gap-2 md:gap-4 w-full transition-opacity duration-300",
        disabled && "opacity-50 grayscale pointer-events-none"
      )}>
        {/* Media Upload Button */}
        <div className="shrink-0 mb-0.5">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || images.length >= 4}
            className="w-11 h-11 md:w-12 md:h-12 rounded-full bg-brand-surface hover:bg-brand-surface-2 border border-brand-border flex items-center justify-center text-brand-text-muted hover:text-brand-cyan transition-all hover:scale-105 active:scale-95 shadow-xl"
            title="Attach images"
          >
            <ImageIcon size={18} className="md:w-5 md:h-5" />
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleImageUpload} 
            accept="image/*" 
            className="hidden" 
            multiple
          />
        </div>

        {/* Input Bar Pill */}
        <div className={cn(
          "flex-1 min-w-0 flex items-end bg-brand-surface backdrop-blur-xl border rounded-[24px] md:rounded-[32px] px-3 md:px-6 py-1 md:py-2 transition-all duration-300 group",
          isFocused ? "border-brand-cyan/60 shadow-[0_0_30px_rgba(6,178,210,0.2)] ring-1 ring-brand-cyan/30 bg-brand-surface-2" : "border-brand-border/40"
        )}>
          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Type a message..."
            className="flex-1 bg-transparent border-none focus:ring-0 outline-none focus:outline-none text-brand-text placeholder-brand-text/50 py-2.5 resize-none max-h-[150px] font-sans text-[15px] md:text-[16px] leading-[1.4]"
            style={{ minHeight: '44px' }}
          />
        </div>

        {/* Send Button */}
        <div className="shrink-0 mb-0.5">
          <button
            onClick={handleSend}
            disabled={(!text.trim() && images.length === 0) || disabled}
            className={cn(
              "w-11 h-11 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-2xl",
              (!text.trim() && images.length === 0) || disabled
                ? "bg-brand-surface text-brand-text-muted/30 border border-brand-border"
                : "bg-brand-purple text-white shadow-[0_4px_15px_rgba(188,19,254,0.4)] hover:shadow-[0_4px_25px_rgba(188,19,254,0.6)]"
            )}
            title="Send Message"
          >
            <Send size={18} className={cn("md:w-5 md:h-5 transition-transform", isFocused && !disabled && text.trim() && "translate-x-0.5 -translate-y-0.5")} />
          </button>
        </div>
      </div>
      
      {/* Hidden Tip for Desktop */}
      <div className="mt-2 text-center hidden md:block">
        <span className="text-[10px] text-brand-text-muted/40 uppercase tracking-[0.2em] font-medium">
          Shift + Enter for multi-line
        </span>
      </div>
    </div>
  );
}
