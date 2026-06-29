"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuthenticatedMediaUrl } from "@/hooks/use-authenticated-media-url";

interface PatientAvatarProps {
  name: string;
  photoUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** When false, photo is not clickable (e.g. nested inside another photo preview). */
  previewable?: boolean;
}

export function PatientAvatar({
  name,
  photoUrl,
  size = 'md',
  className = '',
  previewable = true,
}: PatientAvatarProps) {
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-16 h-16 text-xl'
  };

  const safeName = (name || 'UP').replace(/[<>'"&]/g, '').substring(0, 50);
  const initials = safeName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  const { url: photoSrc, loading, error: loadError } = useAuthenticatedMediaUrl(photoUrl);
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setImageError(false);
    setImageLoaded(false);
  }, [photoSrc]);

  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) {
      setImageLoaded(true);
    }
  }, [photoSrc]);

  const openPreview = (event: MouseEvent) => {
    event.stopPropagation();
    setPreviewOpen(true);
  };

  const showInitials = !loading && (!photoSrc || loadError || imageError);

  if (showInitials) {
    return (
      <div className={`${sizeClasses[size]} rounded-full bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center text-white font-medium flex-shrink-0 ${className}`}>
        {initials}
      </div>
    );
  }

  if (loading && !photoSrc) {
    return (
      <div
        className={`${sizeClasses[size]} rounded-full bg-muted animate-pulse flex-shrink-0 ${className}`}
        aria-hidden
      />
    );
  }

  if (!photoSrc) {
    return (
      <div className={`${sizeClasses[size]} rounded-full bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center text-white font-medium flex-shrink-0 ${className}`}>
        {initials}
      </div>
    );
  }

  const resolvedPhotoSrc = photoSrc;

  const avatar = (
    <div
      className={`${sizeClasses[size]} relative rounded-full overflow-hidden bg-muted flex-shrink-0 ${className} ${
        previewable ? "cursor-zoom-in transition-opacity hover:opacity-90" : ""
      }`}
    >
      {!imageLoaded && <div className="absolute inset-0 bg-muted" aria-hidden />}
      <img
        ref={imgRef}
        src={resolvedPhotoSrc}
        alt={safeName}
        className={`w-full h-full object-cover ${imageLoaded ? "opacity-100" : "opacity-0"}`}
        onLoad={() => setImageLoaded(true)}
        onError={() => setImageError(true)}
      />
    </div>
  );

  if (!previewable || !imageLoaded) {
    return avatar;
  }

  return (
    <>
      <button
        type="button"
        onClick={openPreview}
        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={`View photo of ${safeName}`}
      >
        {avatar}
      </button>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent
          className="max-w-3xl gap-4 p-4 sm:p-6"
          onClick={(event) => event.stopPropagation()}
        >
          <DialogHeader className="text-center sm:text-left">
            <DialogTitle>{safeName}</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center rounded-lg bg-muted/40 p-2 sm:p-4">
            <img
              src={resolvedPhotoSrc}
              alt={safeName}
              className="max-h-[70vh] w-auto max-w-full rounded-md object-contain"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
