export interface ImageCompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  maxSizeMB?: number;
}

/**
 * Optimizes and compresses an image file before upload.
 * Reduces dimension if exceeding maxWidth/maxHeight and encodes as JPEG with given quality.
 * Safe fallback to original file if client canvas is not available or error occurs.
 */
export async function compressImage(
  file: File,
  options: ImageCompressionOptions = {}
): Promise<File> {
  const {
    maxWidth = 1920,
    maxHeight = 1920,
    quality = 0.82,
    maxSizeMB = 1.5
  } = options;

  // Only compress raster images (jpg, png, webp). Ignore PDF or non-images.
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
    return file;
  }

  // If running outside browser (SSR/tests without DOM/Canvas), return original file safely
  if (typeof window === "undefined" || typeof document === "undefined") {
    return file;
  }

  // If already very small (e.g. under 300KB), compression may not be necessary unless dimensions are huge
  const fileSizeMB = file.size / (1024 * 1024);

  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
    };

    img.onload = () => {
      try {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        // If file is already small and within resolution limits, don't re-compress
        if (fileSizeMB <= maxSizeMB && width <= maxWidth && height <= maxHeight) {
          cleanup();
          return resolve(file);
        }

        // Calculate proportional dimensions
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          cleanup();
          return resolve(file);
        }

        // Fill background white in case of transparent PNG converted to JPEG
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            cleanup();
            if (!blob) {
              return resolve(file);
            }

            // Create a new File from compressed blob
            const fileName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
            const compressedFile = new File([blob], fileName, {
              type: "image/jpeg",
              lastModified: Date.now()
            });

            // Return compressed file if it's smaller, or if original exceeded 5MB limit
            if (compressedFile.size < file.size || fileSizeMB > 4.5) {
              resolve(compressedFile);
            } else {
              resolve(file);
            }
          },
          "image/jpeg",
          quality
        );
      } catch {
        cleanup();
        resolve(file);
      }
    };

    img.onerror = () => {
      cleanup();
      resolve(file);
    };

    img.src = objectUrl;
  });
}
