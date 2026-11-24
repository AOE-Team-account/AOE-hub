#!/usr/bin/env python3
"""Rebuild supabase/parts/schema-part-N-of-4.sql from supabase/schema.sql.

The SQL editor has a size limit, so the schema is also kept in 4 parts. Each part
starts at a section header ("-- ====" line after a blank line, outside any $$ body),
near a quarter of the file. Joined in order (minus each part's 2-line header) the
parts are exactly schema.sql. Run after every change to schema.sql.
"""
import re
from pathlib import Path

root = Path(__file__).resolve().parent.parent
lines = (root / "supabase/schema.sql").read_text(encoding="utf8").split("\n")
cands, par = [], 0
for i, line in enumerate(lines):
    if (par == 0 and line.startswith("-- ====") and i > 0 and lines[i - 1] == ""
            and i + 1 < len(lines) and lines[i + 1].startswith("-- ") and not lines[i + 1].startswith("-- ====")):
        cands.append(i)
    par = (par + len(re.findall(r"\$\$", line))) % 2
n = len(lines)
cuts = [min(cands, key=lambda c: abs(c - n * k / 4)) for k in (1, 2, 3)]
bounds = [0] + cuts + [n]
for k in range(4):
    body = "\n".join(lines[bounds[k]:bounds[k + 1]]) + ("\n" if k < 3 else "")
    header = f"-- AOEhub database setup, part {k + 1} of 4. Run the parts in order (1, 2, 3 ...). Each part is safe to run again.\n\n"
    (root / f"supabase/parts/schema-part-{k + 1}-of-4.sql").write_text(header + body, encoding="utf8")
print("parts rebuilt at lines", cuts)
