/**
 * xamlExporter.js — Convert the manager's i18n dictionary into the WPF
 * GlobalizationResourceDictionary XAML format used by ARK Server Manager and
 * its community translators.
 *
 * Why XAML?
 *  - Community SCUM translators are usually already familiar with ARK SM's
 *    workflow ("edit en-AU.xaml, send it back to the dev").
 *  - The format is plain UTF-8 XML so anyone can edit it in Notepad/VSCode
 *    without needing JSON-aware tooling.
 *  - LGSS receives the translated XAML, runs the companion
 *    `xamlToI18nJs.js` (offline) and pastes the result into I18nProvider.jsx
 *    for the next release.
 *
 * Output template (one entry per i18n key):
 *
 *   <Globalization:GlobalizationResourceDictionary
 *       xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
 *       xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
 *       xmlns:sys="clr-namespace:System;assembly=mscorlib"
 *       xmlns:Globalization="clr-namespace:WPFSharp.Globalizer;assembly=WPFSharp.Globalizer"
 *       Name="en"
 *       LinkedStyle="en-style"
 *       >
 *     <sys:String x:Key="brand">LGSS Managers</sys:String>
 *     ...
 *   </Globalization:GlobalizationResourceDictionary>
 *
 * The contributor opens the file, replaces each <sys:String>...</sys:String>
 * body with their language, renames it to e.g. `fr.xaml`, and sends it back.
 */

// Conservative XML escape — XAML/WPF parses with .NET's XmlReader which is
// strict, so we never emit raw < > & ' or " in attribute or text content.
const xmlEscape = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

/**
 * Build a XAML document for the given language dict.
 *
 * @param {string} lang        — ISO language code, used in the Name attribute & filename
 * @param {Object} dict        — flat {key: value} string map for that language
 * @param {Object} [meta]      — optional { translator, date } credit metadata.
 *                                Both fields are written as editable Generic_*
 *                                keys at the top of the file so contributors
 *                                replace them with their own name/date.
 * @returns {string} pretty-printed UTF-8 XAML
 */
export const buildXaml = (lang, dict, meta = {}) => {
  // Backward compat: old call sites passed a plain string (the translator name).
  // We coerce it into the new object shape so legacy callers still work.
  if (typeof meta === "string") {
    meta = { translator: meta };
  }
  const translator = meta.translator || "LGSS Community";
  // Default to today's UTC date in YYYY-MM-DD when contributor hasn't set one.
  const today = new Date().toISOString().slice(0, 10);
  const date = meta.date || today;

  const header = [
    "<Globalization:GlobalizationResourceDictionary",
    '    xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"',
    '    xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"',
    '    xmlns:sys="clr-namespace:System;assembly=mscorlib"',
    '    xmlns:Globalization="clr-namespace:WPFSharp.Globalizer;assembly=WPFSharp.Globalizer"',
    `    Name="${xmlEscape(lang)}"`,
    `    LinkedStyle="${xmlEscape(lang)}-style"`,
    "    >",
    "",
    "    <!-- ════════════════════════════════════════════════════════════ -->",
    "    <!--  CONTRIBUTOR CREDITS — edit these two lines to take credit:  -->",
    "    <!--    Generic_TranslatedBy   = your name / handle / team       -->",
    "    <!--    Generic_TranslationDate = YYYY-MM-DD date you submitted   -->",
    "    <!--  Both values appear in the LGSS Manager language picker.    -->",
    "    <!-- ════════════════════════════════════════════════════════════ -->",
    `    <sys:String x:Key="Generic_TranslatedBy">${xmlEscape(translator)}</sys:String>`,
    `    <sys:String x:Key="Generic_TranslationDate">${xmlEscape(date)}</sys:String>`,
    `    <sys:String x:Key="Generic_LanguageCode">${xmlEscape(lang)}</sys:String>`,
    "",
  ];

  // Group keys by lexicographic prefix so the generated file is easier to
  // diff & navigate for translators. Empty values aren't filtered — translators
  // still see the key with an empty body and can decide whether to fill it.
  const sortedKeys = Object.keys(dict).sort();
  const body = sortedKeys.map((k) => {
    const v = xmlEscape(dict[k]);
    return `    <sys:String x:Key="${xmlEscape(k)}">${v}</sys:String>`;
  });

  return [
    "\uFEFF" + header.join("\n"), // BOM keeps WPF happy with UTF-8 sources
    body.join("\n"),
    "",
    "</Globalization:GlobalizationResourceDictionary>",
    "",
  ].join("\n");
};

/**
 * Trigger a browser download of `<lang>.xaml`.
 *
 * @param {string} lang  — ISO language code (used as filename)
 * @param {Object} dict  — flat translation dict
 * @param {Object|string} meta — { translator, date } or a plain translator string
 */
export const downloadXaml = (lang, dict, meta) => {
  const xaml = buildXaml(lang, dict, meta);
  const blob = new Blob([xaml], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${lang}.xaml`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
