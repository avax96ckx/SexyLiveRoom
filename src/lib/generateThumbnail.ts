/**
 * generateThumbnail - Extract first frame from video file using Canvas API
 * Works in Chrome, Firefox, Safari, and Android WebView (Chrome-based)
 * Returns a Blob (JPEG) or null if extraction fails
 */
export async function generateVideoThumbnail(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = 'anonymous';

      const cleanup = () => {
        URL.revokeObjectURL(url);
        video.remove();
      };

      const captureFrame = () => {
        try {
          const canvas = document.createElement('canvas');
          // Use actual video dimensions, max 640x480 for thumbnail
          const maxW = 640;
          const maxH = 480;
          const ratio = Math.min(maxW / (video.videoWidth || maxW), maxH / (video.videoHeight || maxH));
          canvas.width = Math.round((video.videoWidth || maxW) * ratio);
          canvas.height = Math.round((video.videoHeight || maxH) * ratio);
          const ctx = canvas.getContext('2d');
          if (!ctx) { cleanup(); resolve(null); return; }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            cleanup();
            resolve(blob);
          }, 'image/jpeg', 0.82);
        } catch (err) {
          console.warn('Thumbnail capture failed:', err);
          cleanup();
          resolve(null);
        }
      };

      video.onloadeddata = () => {
        // Seek to 0.5s or first frame
        video.currentTime = Math.min(0.5, video.duration || 0);
      };

      video.onseeked = captureFrame;

      // Fallback: if seeked never fires within 3s, try capturing immediately
      video.onloadedmetadata = () => {
        setTimeout(() => {
          if (video.readyState >= 2) captureFrame();
        }, 800);
      };

      video.onerror = () => { cleanup(); resolve(null); };
      video.ontimeupdate = () => {
        if (video.currentTime > 0) {
          video.ontimeupdate = null;
          captureFrame();
        }
      };

      // Timeout fallback
      setTimeout(() => {
        if (video.readyState >= 2) captureFrame();
        else { cleanup(); resolve(null); }
      }, 5000);

      video.src = url;
      video.load();
    } catch (err) {
      console.warn('generateVideoThumbnail error:', err);
      resolve(null);
    }
  });
}
