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
for kind in ('INSERT', 'TEXT', 'DIMENSION', 'ARC'):
    assert kind in types, f'Missing expected modelspace entity {kind}'
assert len([e for e in entities if e.dxftype() == 'DIMENSION']) >= 2
arcs = [e for e in entities if e.dxftype() == 'ARC']
assert len(arcs) >= 2, 'Snapshot angular DIM must be emitted as real ARC and LINE/TEXT geometry'
assert arcs and abs(arcs[0].dxf.radius - 500) < 0.001
assert abs(arcs[0].dxf.start_angle - 350) < 0.001
assert abs(arcs[0].dxf.end_angle - 45) < 0.001
insert_names = [e.dxf.name for e in entities if e.dxftype() == 'INSERT']
assert insert_names and all(name in doc.blocks for name in insert_names)
texts = [e.dxf.text for e in entities if e.dxftype() == 'TEXT']
assert any('\\U+' in text or '廚' in text for text in texts), 'Chinese text should survive encoding'
assert any('R500' in text for text in texts), 'Expanded radius dimension label missing'
assert any('55' in text for text in texts), 'Expanded arc-angle dimension label missing'
auditor = doc.audit()
if auditor.errors:
    print('DXF auditor errors:')
    for entry in auditor.errors[:15]:
        print(entry)
    raise SystemExit(1)
print(f'ezdxf independent check OK: {len(entities)} modelspace entities, '
      f'{len(insert_names)} INSERT(s), {len(texts)} TEXT(s), {len(doc.layers)} layers.')

# Independent reverse-interchange fixture: created entirely by ezdxf, not our writer.
external = ezdxf.new('R2000', setup=True)
external.units = 4
external.layers.new('外牆', dxfattribs={'color': 7})
external_msp = external.modelspace()
external_msp.add_line((0, 0), (3000, 0), dxfattribs={'layer': '外牆'})
external_msp.add_circle((1500, 900), 450)
external_msp.add_arc(center=(2400, 1400), radius=500, start_angle=350, end_angle=35)
external_msp.add_lwpolyline([(0, 0), (1000, 0), (1000, 800)], close=True)
external_msp.add_text('廚房', height=180,
                      dxfattribs={'layer': '外牆', 'insert': (50, 300)})
window = external.blocks.new('窗型', base_point=(0, 0))
window.add_line((0, 0), (1200, 0))
external_msp.add_blockref('窗型', (1500, 200), dxfattribs={'rotation': 90})
external_file = path.with_name('ezdxf-generated.dxf')
external.saveas(external_file)
print(f'Created independent ezdxf fixture: {external_file}')
