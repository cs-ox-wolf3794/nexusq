"""Extract inert text from a bounded issuer transcript PDF."""
import io
import sys
from pypdf import PdfReader

data = sys.stdin.buffer.read(10_000_001)
if len(data) > 10_000_000 or not data.startswith(b"%PDF-"):
    raise ValueError("Unsupported transcript PDF")
pdf = PdfReader(io.BytesIO(data))
if len(pdf.pages) > 80:
    raise ValueError("Transcript page limit exceeded")
sys.stdout.buffer.write("\n".join(page.extract_text() or "" for page in pdf.pages).encode("utf-8"))
