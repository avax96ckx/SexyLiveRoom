import { useState, useEffect, useRef } from 'react';

interface UploadProgressProps {
  progress: number;
  fileName?: string;
  fileSize?: number;
  uploadedBytes?: number;
  speed?: number; // bytes per second
}

export default function UploadProgress({ progress, fileName, fileSize, uploadedBytes, speed }: UploadProgressProps) {
  const formatSize = (bytes: number) => {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatSpeed = (bps: number) => {
    if (!bps || bps <= 0) return '';
    if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
    return `${(bps / 1024 / 1024).toFixed(1)} MB/s`;
  };

  const loaded = uploadedBytes ?? (fileSize ? (fileSize * progress / 100) : 0);
  const total = fileSize ?? 0;

  return (
    <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(255,20,147,0.08)', border: '1px solid rgba(255,20,147,0.2)' }}>
      <div className="flex items-center justify-between">
        <span className="text-white text-xs font-semibold truncate flex-1 mr-2">📁 {fileName || 'Inapakia...'}</span>
        <span className="text-primary font-bold text-sm flex-shrink-0">{Math.round(progress)}%</span>
      </div>
      <div className="flex items-center justify-between text-xs text-gray-400">
        {total > 0 ? (
          <span>{formatSize(loaded)} / {formatSize(total)}</span>
        ) : loaded > 0 ? (
          <span>{formatSize(loaded)}</span>
        ) : <span />}
        {speed && speed > 100 && <span className="text-green-400 font-semibold">{formatSpeed(speed)}</span>}
      </div>
      <div className="h-1.5 bg-[#1a0a1a] rounded-full overflow-hidden">
        <div className="h-full gradient-pink rounded-full transition-all duration-300" style={{ width: `${Math.max(2, progress)}%` }} />
      </div>
      {progress >= 100 && (
        <p className="text-green-400 text-xs font-semibold">✓ Imepakiwa!</p>
      )}
    </div>
  );
}
