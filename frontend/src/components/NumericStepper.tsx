import { useCallback, useEffect, useRef } from "react";

type NumericStepperProps = {
  value: string;
  onChange: (next: string) => void;
  min?: number;
  step?: number;
  disabled?: boolean;
  inputClassName?: string;
  buttonClassName?: string;
};

export default function NumericStepper({
  value,
  onChange,
  min = 0,
  step = 1,
  disabled = false,
  inputClassName = "h-10 w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm",
  buttonClassName = "h-10 w-10 rounded-lg border border-gray-300 text-2xl font-bold text-gray-700 hover:bg-gray-100",
}: NumericStepperProps) {
  const holdTimeoutRef = useRef<number | null>(null);
  const holdIntervalRef = useRef<number | null>(null);
  const currentValueRef = useRef<number>(Number.isFinite(Number(value)) ? Number(value) : min);

  useEffect(() => {
    const n = Number(value);
    currentValueRef.current = Number.isFinite(n) ? n : min;
  }, [min, value]);

  const clearHold = useCallback(() => {
    if (holdTimeoutRef.current !== null) {
      window.clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    if (holdIntervalRef.current !== null) {
      window.clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
  }, []);

  useEffect(() => clearHold, [clearHold]);

  const applyDelta = useCallback(
    (delta: number) => {
      const next = Math.max(min, currentValueRef.current + delta * step);
      currentValueRef.current = next;
      onChange(String(next));
    },
    [min, onChange, step],
  );

  const startHold = useCallback(
    (delta: number) => {
      if (disabled) return;
      clearHold();
      applyDelta(delta);
      holdTimeoutRef.current = window.setTimeout(() => {
        holdIntervalRef.current = window.setInterval(() => {
          applyDelta(delta);
        }, 80);
      }, 350);
    },
    [applyDelta, clearHold, disabled],
  );

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onPointerDown={(e) => {
          e.preventDefault();
          startHold(-1);
        }}
        onPointerUp={clearHold}
        onPointerCancel={clearHold}
        onPointerLeave={clearHold}
        className={buttonClassName}
        disabled={disabled}
      >
        -
      </button>
      <input
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClassName}
        disabled={disabled}
      />
      <button
        type="button"
        onPointerDown={(e) => {
          e.preventDefault();
          startHold(1);
        }}
        onPointerUp={clearHold}
        onPointerCancel={clearHold}
        onPointerLeave={clearHold}
        className={buttonClassName}
        disabled={disabled}
      >
        +
      </button>
    </div>
  );
}
