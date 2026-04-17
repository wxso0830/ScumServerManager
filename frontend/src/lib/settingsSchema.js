// Settings schema is loaded dynamically from backend /api/settings/schema.
// This file provides the client-side helpers for field type detection + label humanization.

// Remove leading "scum." and convert CamelCase/kebab-case to readable label.
export const humanizeKey = (key) => {
  let s = String(key).replace(/^scum\./, "");
  s = s.replace(/[-_]/g, " ");
  s = s.replace(/([a-z])([A-Z])/g, "$1 $2");
  s = s.replace(/\s+/g, " ").trim();
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
};

// Detect an appropriate input type from a value.
export const detectFieldType = (value, key = "") => {
  if (typeof value === "boolean") return { type: "toggle" };
  if (typeof value === "number") {
    const lowerKey = key.toLowerCase();
    const isMult = lowerKey.includes("multiplier") || lowerKey.endsWith("chance") || lowerKey.includes("scale");
    if (isMult && value >= 0 && value <= 10) {
      return { type: "slider", min: 0, max: 10, step: 0.05 };
    }
    if (Number.isInteger(value)) return { type: "number", step: 1 };
    return { type: "number", step: 0.01 };
  }
  if (typeof value === "string") {
    if (/^\d{1,3}:\d{2}(:\d{2})?$/.test(value)) return { type: "text", placeholder: "HH:MM[:SS]" };
    if (/^-?\d+g$/i.test(value)) return { type: "text", placeholder: "Gold e.g. 1g" };
    if (value.length > 80) return { type: "textarea" };
    return { type: "text" };
  }
  return { type: "text" };
};
