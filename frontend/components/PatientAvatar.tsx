"use client";

import { getPhotoUrl } from "@/lib/api-client";

interface PatientAvatarProps {
  name: string;
  photoUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function PatientAvatar({ name, photoUrl, size = 'md', className = '' }: PatientAvatarProps) {
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-16 h-16 text-xl'
  };
  
  const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  const fullPhotoUrl = photoUrl ? getPhotoUrl(photoUrl) : null;
  
  if (fullPhotoUrl) {
    return (
      <div className={`${sizeClasses[size]} rounded-full overflow-hidden bg-muted flex-shrink-0 ${className}`}>
        <img 
          src={fullPhotoUrl} 
          alt={name}
          className="w-full h-full object-cover"
          onError={(e) => {
            // Fallback to initials if image fails to load
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            const parent = target.parentElement;
            if (parent) {
              parent.innerHTML = `<div class="${sizeClasses[size]} rounded-full bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center text-white font-medium">${initials}</div>`;
            }
          }}
        />
      </div>
    );
  }
  
  return (
    <div className={`${sizeClasses[size]} rounded-full bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center text-white font-medium flex-shrink-0 ${className}`}>
      {initials}
    </div>
  );
}

