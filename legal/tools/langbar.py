"""Puts a language picker at the top of each current legal page.

One dropdown per document family (terms, privacy, delete-account), listing
only the languages that exist, so a page never shows a row of language links
(Sophie 2026-11-12). Re-run after adding a translation:

    python legal/tools/langbar.py

Archived versions (terms-20261024.html etc.) are left alone.
"""
import os
import re

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

LANGS = [("ko", "", "한국어"), ("en", "-en", "English"), ("ja", "-ja", "日本語"), ("zh-Hans", "-zh-hans", "简体中文"), ("zh-Hant", "-zh-hant", "繁體中文")]
FAMILIES = ["terms", "privacy", "delete-account"]

# Language links that used to sit in the crosslink row, now in the picker.
OLD_LINK = re.compile(r'\s*(&nbsp;\s*)?<a href="(terms|privacy|delete-account)(-en|-ja|-zh-hans|-zh-hant)?\.html">(한국어|English|日本語|简体中文|繁體中文)</a>(\s*&nbsp;)?')

STYLE = """.topbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.lang select { font: inherit; font-size: 13px; color: var(--ink); background: var(--soft); border: 1px solid var(--line); border-radius: 6px; padding: 4px 8px; }
"""


def picker(family: str, current: str) -> str:
    options = []
    for code, suffix, label in LANGS:
        name = f"{family}{suffix}.html"
        if os.path.exists(os.path.join(HERE, name)):
            sel = " selected" if name == current else ""
            options.append(f'<option value="{name}"{sel}>{label}</option>')
    if len(options) < 2:
        return '<div class="wordmark">CORTEX</div>'
    return (
        '<div class="topbar"><div class="wordmark">CORTEX</div>'
        '<label class="lang"><select aria-label="Language" onchange="location.href=this.value">'
        + "".join(options)
        + "</select></label></div>"
    )


def main() -> None:
    for family in FAMILIES:
        for _, suffix, _ in LANGS:
            name = f"{family}{suffix}.html"
            path = os.path.join(HERE, name)
            if not os.path.exists(path):
                continue
            s = open(path, encoding="utf8").read()
            if ".topbar {" not in s:
                s = s.replace("</style>", STYLE + "</style>", 1)
            bar = picker(family, name)
            s, n = re.subn(r'<div class="topbar">.*?</select></label></div>|<div class="wordmark">CORTEX</div>', bar, s, count=1, flags=re.S)
            assert n == 1, name
            # Drop the old one-link-per-language row entries.
            s = re.sub(r'(<div class="crosslink">)(.*?)(</div>)', lambda m: m.group(1) + OLD_LINK.sub(" &nbsp; ", m.group(2)).strip(" &nbsp;") + m.group(3), s, count=1, flags=re.S)
            s = re.sub(r"(&nbsp;\s*){2,}", "&nbsp; ", s)
            open(path, "w", encoding="utf8").write(s)
            print("updated", name)


if __name__ == "__main__":
    main()
