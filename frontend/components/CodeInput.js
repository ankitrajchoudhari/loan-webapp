'use client';
import { useRef } from 'react';

/**
 * Digit boxes (OTP / PIN). One real input underneath keeps paste, SMS autofill
 * and the numeric keyboard working; the boxes are just the visual.
 */
export default function CodeInput({ length = 6, value, onChange, mask = false, autoFocus, label, id, onComplete }) {
  const ref = useRef(null);
  const digits = value.split('');
  return (
    <div className="relative" onClick={() => ref.current?.focus()}>
      <input
        ref={ref}
        id={id}
        aria-label={label}
        value={value}
        autoFocus={autoFocus}
        inputMode="numeric"
        autoComplete={mask ? 'off' : 'one-time-code'}
        pattern="[0-9]*"
        maxLength={length}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, '').slice(0, length);
          onChange(v);
          if (v.length === length) onComplete?.(v);
        }}
        className="peer absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
      />
      <div className="flex justify-center gap-2 sm:gap-3">
        {Array.from({ length }, (_, i) => {
          const filled = i < digits.length;
          const active = i === Math.min(digits.length, length - 1);
          return (
            <div
              key={i}
              className={`grid aspect-square w-full max-w-14 place-items-center rounded-xl border-2 bg-white text-3xl font-bold text-maroon transition ${
                active ? 'peer-focus:border-brand' : ''
              } ${filled ? 'border-brand/50' : 'border-line'}`}
            >
              {filled ? (mask ? '•' : digits[i]) : ''}
            </div>
          );
        })}
      </div>
    </div>
  );
}
