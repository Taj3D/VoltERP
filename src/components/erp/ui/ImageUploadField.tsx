"use client";
import React, { useRef, useCallback, useState } from "react";
import { Upload, X, Image as ImageIcon, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ImageUploadFieldProps {
  value: string | null;
  onChange: (base64: string | null) => void;
  label: string;
  placeholder?: string;
}

export default function ImageUploadField({ value, onChange, label, placeholder }: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const processFile = useCallback((file: File) => {
    setError("");

    // Validate type
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setError("Only JPEG and PNG files are allowed");
      return;
    }

    // Validate size (2MB max)
    if (file.size > 2 * 1024 * 1024) {
      setError("File size must be under 2MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      onChange(result);
    };
    reader.readAsDataURL(file);
  }, [onChange]);

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
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {value ? (
        <div className="relative group rounded-lg overflow-hidden border border-border bg-muted/30">
          <img
            src={value}
            alt={label}
            className="w-full h-32 object-cover"
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
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
          </div>
        </div>
      ) : (
        <div
          className={`flex flex-col items-center justify-center h-32 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
            dragOver
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
          }`}
          onClick={() => inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <Upload className="w-6 h-6 text-muted-foreground mb-2" />
          <p className="text-xs text-muted-foreground text-center px-4">
            {placeholder || "Drop image here or click to browse"}
          </p>
          <p className="text-[10px] text-muted-foreground/60 mt-1">JPEG/PNG, max 2MB</p>
        </div>
      )}
      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
