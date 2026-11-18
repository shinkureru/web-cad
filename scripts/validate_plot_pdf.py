#!/usr/bin/env python3
"""Independent SVG -> PDF physical-size smoke test; not a browser print-driver proof."""
from __future__ import annotations
import math
import pathlib
import sys
import xml.etree.ElementTree as ET
import cairosvg
from pypdf import PdfReader

source = pathlib.Path(sys.argv[1])
result_path = source.with_suffix('.pdf')
xml = source.read_bytes()
root = ET.fromstring(xml)
assert root.get('width') == '420mm', root.get('width')
assert root.get('height') == '297mm', root.get('height')

ns = {'svg': 'http://www.w3.org/2000/svg'}
lines = root.findall('.//svg:g/svg:polyline', ns)
assert lines, 'No vector linework in SVG'
first = lines[0].get('points', '')
a, b = first.split()[:2]
ax, ay = [float(n) for n in a.split(',')]
bx, by = [float(n) for n in b.split(',')]
length = math.hypot(bx - ax, by - ay)
assert abs(length - 120.0) < 0.001, f'6000mm at 1:50 should be 120mm on paper, got {length}'

cairosvg.svg2pdf(bytestring=xml, write_to=str(result_path))
pdf = PdfReader(str(result_path))
assert len(pdf.pages) == 1
pts_per_mm = 72 / 25.4
width_mm = float(pdf.pages[0].mediabox.width) / pts_per_mm
height_mm = float(pdf.pages[0].mediabox.height) / pts_per_mm
assert abs(width_mm - 420.0) < 0.05, f'Paper width is {width_mm} mm'
assert abs(height_mm - 297.0) < 0.05, f'Paper height is {height_mm} mm'
print('Independent PDF test OK: A3 landscape 420 x 297 mm, vector line 120 mm at 1:50.')
