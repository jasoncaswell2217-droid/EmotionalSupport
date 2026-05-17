import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Maximize2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface BroadcastImageProps {
  src: string;
  alt?: string;
  onExpand?: () => void;
  className?: string;
}

/**
 * Responsive Image Component for Global Broadcast Feed
 * Features:
 * - Uniform height constraints (max-h-500px)
 * - Object-fit: cover for consistent grid alignment
 * - Responsive transitions and hover effects
 * - Accessibility-focused design
 */
export function BroadcastImage({ 
  src, 
  alt = "Global broadcast visualization", 
  onExpand, 
  className 
}: BroadcastImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <div className={cn(
      "relative group/img w-full overflow-hidden rounded-[1.5rem] border border-brand-border bg-brand-surface-2 shadow-2xl",
      className
    )}>
      {/* Loading Skeleton */}
      <AnimatePresence>
        {!isLoaded && (
          <motion.div 
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-brand-surface animate-pulse flex items-center justify-center"
          >
            <Sparkles className="text-brand-cyan/20 animate-spin" size={32} />
          </motion.div>
        )}
      </AnimatePresence>

      <img
        src={src}
        alt={alt}
        onLoad={() => setIsLoaded(true)}
        className={cn(
          "w-full h-auto max-h-[500px] object-cover transition-all duration-700 ease-out",
          isLoaded ? "opacity-100 scale-100" : "opacity-0 scale-105",
          onExpand && "cursor-zoom-in group-hover/img:scale-[1.03]"
        )}
        onClick={() => onExpand?.()}
      />

      {/* Hover Overlay */}
      {onExpand && (
        <div 
          className="absolute inset-0 bg-black/0 group-hover/img:bg-black/20 transition-all duration-300 pointer-events-none flex items-center justify-center"
          aria-hidden="true"
        >
          <div className="p-3 rounded-full bg-white/10 backdrop-blur-md border border-white/20 opacity-0 group-hover/img:opacity-100 transition-all translate-y-4 group-hover/img:translate-y-0 shadow-2xl">
            <Maximize2 className="text-white" size={20} />
          </div>
        </div>
      )}

      {/* Aesthetic Accents */}
      <div className="absolute bottom-0 left-0 w-full h-1/3 bg-gradient-to-t from-black/40 to-transparent pointer-events-none opacity-0 group-hover/img:opacity-100 transition-opacity" />
    </div>
  );
}
