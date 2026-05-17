/**
 * Image Processing Utility
 * Handles resizing, format conversion (WebP), and compression for high-performance media feeds.
 */

export interface ProcessedImage {
  feedThumb: string;    // Base64 WebP optimized for scrolling feed (max 1200px)
  fullDisplay: string;  // Base64 WebP slightly higher res (max 2048px)
}

/**
 * Main processing function for client-side image optimization
 * @param file The raw file from an input[type="file"]
 * @returns Promise with two tiers of optimized WebP images
 */
export async function processImageForFeed(file: File): Promise<ProcessedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      
      img.onload = () => {
        try {
          // Tier 1: Feed Thumbnail (Max 1200px longest side)
          const feedThumb = createOptimizedImage(img, 1200, 0.75);
          
          // Tier 2: Full Display (Max 2048px longest side)
          const fullDisplay = createOptimizedImage(img, 2048, 0.85);
          
          resolve({ feedThumb, fullDisplay });
        } catch (err) {
          reject(err);
        }
      };
      
      img.onerror = (err) => reject(new Error('Failed to load image into canvas'));
    };
    
    reader.onerror = (err) => reject(new Error('Failed to read file'));
  });
}

/**
 * Creates an optimized base64 WebP image using HTML5 Canvas
 */
function createOptimizedImage(img: HTMLImageElement, maxLongSide: number, quality: number): string {
  const canvas = document.createElement('canvas');
  let width = img.width;
  let height = img.height;

  // Maintain aspect ratio
  if (width > height) {
    if (width > maxLongSide) {
      height = Math.round((height * maxLongSide) / width);
      width = maxLongSide;
    }
  } else {
    if (height > maxLongSide) {
      width = Math.round((width * maxLongSide) / height);
      height = maxLongSide;
    }
  }

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available');

  // Draw image to canvas (this performs the resize)
  ctx.drawImage(img, 0, 0, width, height);

  // Convert to WebP with smart compression
  // Returns base64 data URL
  return canvas.toDataURL('image/webp', quality);
}
