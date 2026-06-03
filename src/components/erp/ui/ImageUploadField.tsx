"use client";
import React, { useRef, useCallback, useState } from "react";
import { Upload, X, Image as ImageIcon, Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ImageUploadFieldProps {
  value: string | null;
  onChange: (base64: string | null) => void;
  label?: string;
  placeholder?: string;
  /** Maximum file size in MB (default: 5) */
  maxSizeMB?: number;
}

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export default function ImageUploadField({
  value,
  onChange,
  label = "Image",
  placeholder,
  maxSizeMB = 5,
}: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);

  const processFile = useCallback(
    (file: File) => {
      setError("");

      // Validate type
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError("Only JPEG, PNG, and WebP files are allowed");
        return;
      }

      // Validate size (maxSizeMB max)
      if (file.size > maxSizeMB * 1024 * 1024) {
        setError(`File size must be less than ${maxSizeMB}MB`);
        return;
      }

      setLoading(true);
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        onChange(result);
        setLoading(false);
      };
      reader.onerror = () => {
        setError("Failed to read file. Please try again.");
        setLoading(false);
      };
      reader.readAsDataURL(file);
    },
    [onChange, maxSizeMB]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    // Reset input value so same file can be re-selected
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleClear = () => {
    onChange(null);
    setError("");
  };

  return (
    <div className="space-y-1.5 w-full">
      {label && (
        <label className="text-sm font-medium text-foreground">{label}</label>
      )}
      {value ? (
        <div className="relative group rounded-lg overflow-hidden border border-border bg-muted/30">
          <img
            src={value}
            alt={label}
            className="w-full h-32 sm:h-36 object-cover"
          />
          {/* Hover-to-replace overlay */}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            {loading ? (
              <Loader2 className="w-6 h-6 text-white animate-spin" />
            ) : (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => inputRef.current?.click()}
                >
                  <Camera className="w-3 h-3 mr-1" />
                  Replace
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleClear}
                >
                  <X className="w-3 h-3 mr-1" />
                  Remove
                </Button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div
          className={`flex flex-col items-center justify-center h-32 sm:h-36 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
            dragOver
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
          } ${loading ? "pointer-events-none opacity-60" : ""}`}
          onClick={() => !loading && inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          {loading ? (
            <Loader2 className="w-6 h-6 text-muted-foreground animate-spin mb-2" />
          ) : (
            <Upload className="w-6 h-6 text-muted-foreground mb-2" />
          )}
          <p className="text-xs text-muted-foreground text-center px-4">
            {loading
              ? "Processing..."
              : placeholder || "Drop image here or click to browse"}
          </p>
          <p className="text-[10px] text-muted-foreground/60 mt-1">
            JPEG / PNG / WebP, max {maxSizeMB}MB
          </p>
        </div>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
