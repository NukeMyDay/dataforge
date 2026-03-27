import { useState, useEffect } from "react";

const STORAGE_KEY = "dataforge_compare";
const MAX_COMPARE = 3;

function readStorage(): string[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function useCompare() {
  const [slugs, setSlugs] = useState<string[]>(readStorage);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(slugs));
  }, [slugs]);

  function addProgram(slug: string) {
    setSlugs((prev) => {
      if (prev.includes(slug) || prev.length >= MAX_COMPARE) return prev;
      return [...prev, slug];
    });
  }

  function removeProgram(slug: string) {
    setSlugs((prev) => prev.filter((s) => s !== slug));
  }

  function clearCompare() {
    setSlugs([]);
  }

  function isSelected(slug: string) {
    return slugs.includes(slug);
  }

  return {
    slugs,
    addProgram,
    removeProgram,
    clearCompare,
    isSelected,
    canAdd: slugs.length < MAX_COMPARE,
    count: slugs.length,
  };
}
