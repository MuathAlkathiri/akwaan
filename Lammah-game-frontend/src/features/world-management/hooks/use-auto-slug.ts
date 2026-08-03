"use client";
import { useState } from "react";

import { slugify } from "../utils/slug.util";

export function useAutoSlug(
  initialSlug: string | undefined,
  fallbackPrefix: string,
) {
  const [manual, setManual] = useState(Boolean(initialSlug));
  const [slug, setSlug] = useState(initialSlug ?? "");

  const onNameChange = (name: string) => {
    if (!manual) setSlug(slugify(name, fallbackPrefix));
  };
  const onManualSlugChange = (value: string) => {
    setSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
  };
  const enableManualEditing = () => setManual(true);

  return { slug, manual, onNameChange, onManualSlugChange, enableManualEditing };
}
