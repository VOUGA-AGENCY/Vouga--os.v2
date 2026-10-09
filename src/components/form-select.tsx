"use client";
import { useState } from "react";
import { SelectBox, type SelectOption } from "./task-surface";

/**
 * The app's dropdown (SelectBox) inside a plain form: it keeps its own value and submits it through the hidden
 * input that SelectBox renders, so forms read it with FormData like a native <select>.
 */
export function FormSelect({ name, label, defaultValue, options, ariaLabel }: {
  name: string;
  label?: string;
  defaultValue: string;
  options: SelectOption[];
  ariaLabel?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  return <SelectBox name={name} label={label} ariaLabel={ariaLabel} value={value} onChange={setValue} options={options}/>;
}
