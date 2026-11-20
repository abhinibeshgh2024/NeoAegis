/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Info, X } from 'lucide-react';

interface InfoButtonProps {
  title: string;
  description: string;
  align?: 'left' | 'right';
  className?: string;
}

export default function InfoButton({
  title,
  description,
  align = 'right',
  className = ''
}: InfoButtonProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={`relative inline-flex items-center ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        aria-expanded={open}
        aria-label={`Information about ${title}`}
        title={`About ${title}`}
        className={`w-7 h-7 rounded-full inline-flex items-center justify-center border transition cursor-pointer ${
          open
            ? 'bg-[#e8f0fe] border-[#aecbfa] text-[#1967d2]'
            : 'bg-[#f8f9fa] border-[#dadce0] text-[#5f6368] hover:text-[#1a73e8] hover:border-[#aecbfa] hover:bg-[#e8f0fe]'
        }`}
      >
        <Info className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={title}
          onClick={(e) => e.stopPropagation()}
          className={`absolute top-full mt-2 z-50 w-64 sm:w-72 bg-white border border-[#dadce0] rounded-2xl p-3.5 shadow-lg text-left animate-fade-in ${
            align === 'left' ? 'left-0' : 'right-0'
          }`}
        >
          <div className="flex items-start justify-between gap-2 pb-2 mb-2 border-b border-[#f1f3f4]">
            <div className="flex items-center gap-1.5 min-w-0">
              <Info className="w-3.5 h-3.5 text-[#1a73e8] shrink-0" />
              <h4 className="text-xs font-medium text-[#202124] truncate">{title}</h4>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-0.5 text-[#5f6368] hover:text-[#202124] rounded-full hover:bg-[#f1f3f4] transition cursor-pointer shrink-0"
              aria-label="Close info popover"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[11px] text-[#5f6368] leading-relaxed font-normal">
            {description}
          </p>
        </div>
      )}
    </div>
  );
}
