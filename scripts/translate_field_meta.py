"""
One-shot translation script:
- Reads /app/frontend/src/lib/fieldMeta.js
- For every FIELD_META entry that only has {en, tr}, asks Claude Sonnet 4.5
  to generate ru/de/fr/it/ar/az translations (label + desc each).
- Rewrites the JS file with all 8 languages in canonical form.

Run once locally:
    EMERGENT_LLM_KEY=sk-emergent-... python /app/scripts/translate_field_meta.py
"""

import asyncio
import json
import os
import re
import sys
import uuid
from pathlib import Path

from emergentintegrations.llm.chat import LlmChat, UserMessage

FIELDMETA_PATH = Path("/app/frontend/src/lib/fieldMeta.js")
CACHE_PATH = Path("/app/scripts/.fieldmeta_cache.json")
TARGET_LANGS = ["ru", "de", "fr", "it", "ar", "az"]
LANG_NAMES = {
    "ru": "Russian",
    "de": "German",
    "fr": "French",
    "it": "Italian",
    "ar": "Arabic",
    "az": "Azerbaijani",
}
BATCH = 12  # entries per LLM call

KEY_RE = re.compile(r'^\s*("scum\.[A-Za-z0-9_\-]+"|"[a-z][a-z0-9\-]+")\s*:\s*\{', re.MULTILINE)
LANG_BLOCK_RE = re.compile(
    r'([a-z]{2})\s*:\s*\{\s*label\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*desc\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}',
    re.DOTALL,
)


def _match_braces(src: str, open_idx: int):
    """Given position of `{`, return index just after matching `}`."""
    depth = 0
    in_str = False
    esc = False
    i = open_idx
    while i < len(src):
        c = src[i]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
        else:
            if c == '"':
                in_str = True
            elif c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    return i + 1
        i += 1
    return -1


class _Span:
    __slots__ = ("_start", "_end")

    def __init__(self, s, e):
        self._start = s
        self._end = e

    def start(self):
        return self._start

    def end(self):
        return self._end


def parse_entries(src: str):
    """Return list of dicts {key, match (span), langs:{lang:{label,desc}}}."""
    out = []
    for m in KEY_RE.finditer(src):
        key = m.group(1).strip('"')
        open_brace = src.index("{", m.start())
        close_after = _match_braces(src, open_brace)
        if close_after < 0:
            continue
        # Include trailing comma if present
        end = close_after
        if end < len(src) and src[end] == ",":
            end += 1
        body = src[open_brace + 1 : close_after - 1]
        langs = {}
        for lm in LANG_BLOCK_RE.finditer(body):
            langs[lm.group(1)] = {
                "label": lm.group(2),
                "desc": lm.group(3),
            }
        out.append({"key": key, "match": _Span(m.start(), end), "langs": langs})
    return out


def needs_translation(entry):
    return any(l not in entry["langs"] for l in TARGET_LANGS)


def js_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace('"', '\\"')


async def translate_batch(chat: LlmChat, batch):
    """Send a batch of entries (each: {key,label_en,desc_en}) to LLM and parse JSON."""
    payload = [{"key": e["key"], "label_en": e["langs"]["en"]["label"], "desc_en": e["langs"]["en"]["desc"]} for e in batch]
    prompt = (
        "Translate the following SCUM game server configuration UI strings.\n"
        "For EACH entry produce translations in these 6 languages: "
        + ", ".join(f"{l} ({LANG_NAMES[l]})" for l in TARGET_LANGS)
        + ".\n"
        "Rules:\n"
        "- Keep labels SHORT (1-4 words, like an input form label).\n"
        "- Keep descriptions concise (1 short sentence, max 18 words).\n"
        "- Preserve units in parentheses like (s), (min), (HH:MM:SS), numbers, ranges (0-1), 0=Low etc.\n"
        "- Do NOT translate technical tokens: PVE, PVP, MOTD, A2S, FOV, ADS, NPC, HP, XP, gold/USD numbers.\n"
        "- For Arabic use natural Arabic; Azerbaijani uses Latin alphabet.\n"
        "- Return STRICT JSON only, no markdown, no commentary.\n\n"
        "Output schema:\n"
        '{ "translations": { "<key>": { "ru": {"label":"","desc":""}, "de": {...}, "fr": {...}, "it": {...}, "ar": {...}, "az": {...} } } }\n\n'
        f"INPUT:\n{json.dumps(payload, ensure_ascii=False)}\n"
    )
    msg = UserMessage(text=prompt)
    raw = await chat.send_message(msg)
    # Best-effort strip code fences
    txt = raw.strip()
    if txt.startswith("```"):
        txt = re.sub(r"^```[a-zA-Z]*\n", "", txt)
        txt = re.sub(r"\n```$", "", txt)
    try:
        data = json.loads(txt)
    except Exception:
        # Try to locate JSON object
        start = txt.find("{")
        end = txt.rfind("}")
        data = json.loads(txt[start : end + 1])
    return data.get("translations", {})


def render_entry(key: str, langs: dict) -> str:
    """Render a single FIELD_META entry as multi-line JS."""
    order = ["en", "tr", "ru", "de", "fr", "it", "ar", "az"]
    lines = [f'  "{key}": {{']
    for lg in order:
        if lg not in langs:
            continue
        lbl = js_escape(langs[lg]["label"])
        dsc = js_escape(langs[lg]["desc"])
        lines.append(f'    {lg}: {{ label: "{lbl}", desc: "{dsc}" }},')
    lines.append("  },")
    return "\n".join(lines)


async def main():
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        print("ERROR: EMERGENT_LLM_KEY missing", file=sys.stderr)
        sys.exit(1)

    model_provider = os.environ.get("LLM_PROVIDER", "anthropic")
    model_name = os.environ.get("LLM_MODEL", "claude-sonnet-4-5-20250929")

    src = FIELDMETA_PATH.read_text(encoding="utf-8")
    entries = parse_entries(src)
    print(f"Parsed {len(entries)} entries")

    # Load cache (key -> {lang -> {label,desc}})
    cache: dict = {}
    if CACHE_PATH.exists():
        try:
            cache = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
            print(f"Loaded cache for {len(cache)} keys")
        except Exception:
            cache = {}

    # Merge cache into entries
    for e in entries:
        c = cache.get(e["key"])
        if c:
            for lg, v in c.items():
                if lg in TARGET_LANGS and lg not in e["langs"] and "label" in v and "desc" in v:
                    e["langs"][lg] = {"label": v["label"], "desc": v["desc"]}

    todo = [e for e in entries if needs_translation(e) and "en" in e["langs"]]
    print(f"Need translation for {len(todo)} entries (after cache)")

    chat = LlmChat(
        api_key=api_key,
        session_id=f"fieldmeta-{uuid.uuid4().hex[:8]}",
        system_message=(
            "You are a precise UI translator for a video-game server admin panel. "
            "Output STRICT JSON only."
        ),
    ).with_model(model_provider, model_name)
    print(f"Using model: {model_provider}/{model_name}")

    # Process batches
    failed_batches = 0
    for i in range(0, len(todo), BATCH):
        batch = todo[i : i + BATCH]
        print(f"  -> batch {i//BATCH + 1}/{(len(todo)+BATCH-1)//BATCH}: {len(batch)} keys", flush=True)
        trans = None
        for attempt in range(3):
            try:
                trans = await translate_batch(chat, batch)
                break
            except Exception as ex:
                msg = str(ex)
                print(f"     attempt {attempt+1} failed: {msg[:200]}", flush=True)
                if "Budget has been exceeded" in msg:
                    failed_batches += 1
                    break  # stop retrying; will skip
                await asyncio.sleep(2 * (attempt + 1))

        if not trans:
            print(f"     SKIPPED batch", flush=True)
            if "Budget" in (msg if 'msg' in dir() else ""):
                # Save progress and abort gracefully
                pass
            continue

        for e in batch:
            t = trans.get(e["key"]) or {}
            for lg in TARGET_LANGS:
                if lg in e["langs"]:
                    continue
                v = t.get(lg)
                if v and "label" in v and "desc" in v:
                    e["langs"][lg] = {"label": v["label"], "desc": v["desc"]}
            # persist to cache
            cache.setdefault(e["key"], {})
            for lg in TARGET_LANGS:
                if lg in e["langs"]:
                    cache[e["key"]][lg] = e["langs"][lg]

        # Save cache after every batch
        CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")

    # Re-emit the file. We rebuild by replacing each matched entry block with rendered version,
    # working in reverse to keep offsets valid.
    new_src = src
    for e in sorted(entries, key=lambda x: x["match"].start(), reverse=True):
        m = e["match"]
        rendered = render_entry(e["key"], e["langs"])
        # Preserve leading whitespace of the original entry by keeping prefix up to m.start()
        new_src = new_src[: m.start()] + rendered.lstrip() + new_src[m.end():]

    FIELDMETA_PATH.write_text(new_src, encoding="utf-8")
    print("Wrote", FIELDMETA_PATH)


if __name__ == "__main__":
    asyncio.run(main())
