"""Read public filing HTML as inert text; never execute source markup."""
import json
import sys
import re
from html.parser import HTMLParser


class DisclosureReader(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.parts = []
        self.links = []
        self.active_link = None
        self.row = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        hidden = tag in ("head", "script", "style", "noscript", "ix:hidden") or "hidden" in attrs or "display:none" in attrs.get("style", "").replace(" ", "").lower()
        hidden = hidden or any(s[1] for s in self.stack)
        if tag not in ("br", "hr", "img", "meta", "link", "input", "wbr", "source"):
            self.stack.append((tag, hidden))
        if hidden:
            return
        if tag == "tr":
            self.row = {"text": "", "links": []}
        if tag in ("div", "p", "li", "tr", "h1", "h2", "h3", "h4", "br"):
            self.parts.append(" " if tag != "tr" and any(s[0] in ("td", "th") for s in self.stack) else "\n")
        if tag in ("td", "th"):
            self.parts.append(" | ")
        if tag == "a" and attrs.get("href"):
            self.active_link = {"href": attrs["href"], "text": ""}
            if self.row is not None:
                self.row["links"].append(self.active_link)

    def handle_endtag(self, tag):
        hidden = any(s[1] for s in self.stack)
        if not hidden and tag in ("div", "p", "li", "tr", "h1", "h2", "h3", "h4"):
            self.parts.append(" " if tag != "tr" and any(s[0] in ("td", "th") for s in self.stack) else "\n")
        if tag == "a" and self.active_link:
            self.links.append(self.active_link)
            self.active_link = None
        if tag == "tr" and self.row is not None:
            for link in self.row["links"]:
                link["context"] = " ".join(self.row["text"].split())
            self.row = None
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                break

    def handle_data(self, data):
        if not any(s[1] for s in self.stack):
            self.parts.append(re.sub(r"\s+", " ", data))
            if self.row is not None:
                self.row["text"] += " " + data
            if self.active_link:
                self.active_link["text"] += data


reader = DisclosureReader()
reader.feed(sys.stdin.buffer.read().decode("utf-8", errors="replace"))
blocks = [" ".join(line.split()).strip(" |•▪◦") for line in "".join(reader.parts).splitlines()]
json.dump({"blocks": [line for line in blocks if line], "links": reader.links}, sys.stdout, ensure_ascii=True)
