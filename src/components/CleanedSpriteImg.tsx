import { useEffect, useState } from "react";
import { loadCleanedSpriteDataUrl } from "../digipet/spriteCleaner";

interface CleanedSpriteImgProps {
  src: string;
  alt: string;
  className?: string;
}

export function CleanedSpriteImg({ src, alt, className = "" }: CleanedSpriteImgProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadCleanedSpriteDataUrl(src).then((url) => {
      if (active) setDataUrl(url);
    });
    return () => {
      active = false;
    };
  }, [src]);

  if (!dataUrl) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg bg-slate-800/70 text-xs text-slate-300 ${className}`}
        aria-label={alt}
      >
        {alt.slice(0, 2)}
      </div>
    );
  }

  return (
    <img
      src={dataUrl}
      alt={alt}
      referrerPolicy="no-referrer"
      className={`object-contain [image-rendering:pixelated] ${className}`}
    />
  );
}
