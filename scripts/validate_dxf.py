#!/usr/bin/env python3
"""Independent structural smoke check for generated DXF AC1015.

This does not replace opening the drawing in AutoCAD, QCAD or LibreCAD.
"""
from __future__ import annotations

import pathlib
import sys
import ezdxf

path = pathlib.Path(sys.argv[1])
doc = ezdxf.readfile(path)
assert doc.dxfversion == 'AC1015', f'Unexpected DXF version: {doc.dxfversion}'
assert doc.header.get('$INSUNITS') == 4, 'Drawing must declare millimetres'
msp = doc.modelspace()
entities = list(msp)
types = {e.dxftype() for e in entities}
for kind in ('INSERT', 'TEXT', 'DIMENSION'):
    assert kind in types, f'Missing expected modelspace entity {kind}'
assert len([e for e in entities if e.dxftype() == 'DIMENSION']) >= 2
insert_names = [e.dxf.name for e in entities if e.dxftype() == 'INSERT']
assert insert_names and all(name in doc.blocks for name in insert_names)
texts = [e.dxf.text for e in entities if e.dxftype() == 'TEXT']
assert any('\\U+' in text or '廚' in text for text in texts), 'Chinese text should survive encoding'
auditor = doc.audit()
if auditor.errors:
    print('DXF auditor errors:')
    for entry in auditor.errors[:15]:
        print(entry)
    raise SystemExit(1)
print(f'ezdxf independent check OK: {len(entities)} modelspace entities, '
      f'{len(insert_names)} INSERT(s), {len(texts)} TEXT(s), {len(doc.layers)} layers.')
