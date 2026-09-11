"use client";

import { useState } from "react";

interface ChipRowProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

export function ChipRow<T extends string>({ options, value, onChange }: ChipRowProps<T>) {
  return (
    <div className="chip-row">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`chip${opt.value === value ? " active" : ""}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/** Uncontrolled variant for cases (like onboarding chip pickers) that just
 *  need a single selected value without lifting state up. */
export function useChipRowState<T extends string>(initial: T) {
  return useState<T>(initial);
}
