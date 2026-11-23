"""Read bounded issuer RSS/Atom as inert XML; retain titles verbatim."""
import sys, json, re
import xml.etree.ElementTree as ET
text = sys.stdin.read()
if len(text) > 5_000_000 or re.search(r'<!DOCTYPE|<!ENTITY', text, re.I):
    raise ValueError('Unsupported XML declarations or oversized feed')
root = ET.fromstring(text)
tag = lambda e: e.tag.split('}')[-1]
if tag(root) not in ('rss', 'feed'): raise ValueError('Not an RSS or Atom feed')
items = []
for entry in root.iter():
    if tag(entry) not in ('item', 'entry'): continue
    fields = {tag(x): ''.join(x.itertext()).strip() for x in entry}
    links = [x.attrib.get('href', ''.join(x.itertext()).strip()) for x in entry if tag(x) == 'link' and x.attrib.get('rel', 'alternate') == 'alternate']
    date = fields.get('pubDate') or fields.get('published') or fields.get('updated')
    items.append({'title': fields.get('title', ''), 'url': links[0] if links else '', 'at': date, 'dateKind': 'published' if fields.get('pubDate') or fields.get('published') else 'updated'})
json.dump(items, sys.stdout)
