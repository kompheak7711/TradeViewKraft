#!/usr/bin/env python3
"""WCAG 2.1 contrast check for the design tokens in packages/ui/src/tokens.css.
Checks text/muted/accent/up/down/warn against bg, bg-elev and surface for both themes.
Usage: python3 scripts/contrast.py   (exit code 1 when any AA check fails)"""
import re, sys, pathlib

css = pathlib.Path(__file__).resolve().parents[1].joinpath('packages/ui/src/tokens.css').read_text()

def block(selector):
    m = re.search(re.escape(selector) + r'\s*\{(.*?)\}', css, re.S)
    return dict(re.findall(r'--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})', m.group(1))) if m else {}

themes = {'dark': block(':root'), 'light': block(':root[data-theme="light"]')}

def lum(hexv):
    r, g, b = [int(hexv[i:i+2], 16) / 255 for i in (1, 3, 5)]
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)

def ratio(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)

# (foreground, background, required ratio, note)
checks = [
    ('text', 'bg', 4.5, 'body text'), ('text', 'bg-elev', 4.5, 'body text on panels'), ('text', 'surface-2', 4.5, 'text on chips/buttons'),
    ('text-muted', 'bg', 4.5, 'secondary text'), ('text-muted', 'bg-elev', 4.5, 'secondary text on panels'), ('text-muted', 'surface-2', 4.5, 'muted on chips'),
    ('text-faint', 'bg-elev', 3.0, 'placeholder / tertiary (large or non-essential)'),
    ('on-accent', 'accent', 4.5, 'button label on accent'),
    ('accent', 'bg-elev', 3.0, 'links / active icons (UI component)'),
    ('accent-text', 'bg-elev', 4.5, 'accent-colored small text (active tab, links)'),
    ('up', 'bg-elev', 3.0, 'price up (UI component / large)'), ('down', 'bg-elev', 3.0, 'price down'), ('warn', 'bg-elev', 3.0, 'warning'),
    ('up', 'bg', 4.5, 'price up small text'), ('down', 'bg', 4.5, 'price down small text'),
    ('border-strong', 'bg-elev', 3.0, 'control borders (non-text)'),
]
failed = 0
for name, t in themes.items():
    print(f'== {name} theme ==')
    for fg, bg, need, note in checks:
        if fg not in t or bg not in t:
            print(f'  ?? missing token {fg}/{bg}')
            continue
        r = ratio(t[fg], t[bg])
        ok = r >= need
        failed += 0 if ok else 1
        print(f"  {'PASS' if ok else 'FAIL'} {fg:14s} on {bg:10s} {r:5.2f} (need {need}) {note}")
print('\nAll checks passed' if not failed else f'\n{failed} check(s) failed')
sys.exit(1 if failed else 0)
