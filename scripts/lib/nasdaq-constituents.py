"""Extract the public Nasdaq membership PDFs; no index weights are republished."""
import io
import json
import re
import sys
from pypdf import PdfReader

reader = PdfReader(io.BytesIO(sys.stdin.buffer.read()))
text = "\n".join(page.extract_text(extraction_mode="layout") or "" for page in reader.pages)
date = re.search(r"Data as of:\s*(\d{2})/(\d{2})/(\d{4})", text)
if not date:
    raise ValueError("Nasdaq publication date missing")
members = []
for line in text.splitlines():
    match = re.fullmatch(r"\s*(.+?)\s+([A-Z][A-Z0-9.\-]{0,7})\s+(\d+\.\d{2})\s*", line)
    if match:
        members.append({"name": re.sub(r"\s+", " ", match[1]).strip(), "symbol": match[2]})
if len(members) != len({row["symbol"] for row in members}):
    raise ValueError("Duplicate Nasdaq members")
print(json.dumps({"asOf": f"{date[3]}-{date[1]}-{date[2]}", "members": members}))
