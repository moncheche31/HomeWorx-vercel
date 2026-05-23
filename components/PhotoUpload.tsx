"use client";

import { useRef } from "react";
import { Camera, Image, X } from "lucide-react";
import { Language } from "@/types";

interface Props {
  photos: string[];
  onAdd: (dataUrl: string) => void;
  onRemove: (index: number) => void;
  lang: Language;
  takePhoto: string;
  choosePhoto: string;
  removePhoto: string;
}

export default function PhotoUpload({ photos, onAdd, onRemove, lang, takePhoto, choosePhoto, removePhoto }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File | null) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert(lang === "es" ? "La foto es demasiado grande (máx 5MB)" : "Photo is too large (max 5MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) onAdd(e.target.result as string);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-4">
      {/* Upload buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          className="flex flex-col items-center gap-2 p-5 rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50 hover:bg-blue-100 active:scale-95 transition-all text-blue-700"
        >
          <Camera size={28} />
          <span className="text-sm font-semibold">{takePhoto}</span>
        </button>
        <button
          type="button"
          onClick={() => galleryRef.current?.click()}
          className="flex flex-col items-center gap-2 p-5 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 active:scale-95 transition-all text-slate-600"
        >
          <Image size={28} />
          <span className="text-sm font-semibold">{choosePhoto}</span>
        </button>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        onClick={(e) => { (e.target as HTMLInputElement).value = ""; }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          Array.from(e.target.files ?? []).forEach(handleFile);
        }}
        onClick={(e) => { (e.target as HTMLInputElement).value = ""; }}
      />

      {/* Photo grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((src, i) => (
            <div key={i} className="relative aspect-square rounded-xl overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow"
                aria-label={removePhoto}
              >
                <X size={13} strokeWidth={3} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
