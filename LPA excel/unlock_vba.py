import zipfile, olefile, io, os, sys

xlsm = sys.argv[1]
out = xlsm.replace('.xlsm', '_nopw.xlsm')

# Extract vbaProject.bin from zip
with zipfile.ZipFile(xlsm) as z:
    vba = bytearray(z.read('xl/vbaProject.bin'))

# Open OLE in write mode
ole = olefile.OleFileIO(io.BytesIO(vba), write_mode=True)
proj = bytearray(ole.openstream('PROJECT').read())
print(f'PROJECT stream: {len(proj)} bytes', file=sys.stderr)

# Replace CMG hash with spaces (same length)
old = b'CMG="1C1EB078D02ED42ED42BD92BD9"'
new = b'CMG="' + b' ' * 26 + b'"'
assert len(old) == len(new)
proj = proj.replace(old, new)

# Replace DPB hash
old = b'DPB="CECC62CAA6CE45EB45EBBA1546EBBFA12F2370DD30816F0787C46DA69F104587730E1B4A70F838"'
new = b'DPB="' + b' ' * 78 + b'"'
assert len(old) == len(new)
proj = proj.replace(old, new)

# Replace GC hash
old = b'GC="80822C2F2D2F2D2F"'
new = b'GC="' + b' ' * 16 + b'"'
assert len(old) == len(new)
proj = proj.replace(old, new)

# Write back
ole.write_stream('PROJECT', bytes(proj))
ole.close()

# Write to new zip
with zipfile.ZipFile(xlsm, 'r') as zin:
    with zipfile.ZipFile(out, 'w') as zout:
        for item in zin.infolist():
            if item.filename == 'xl/vbaProject.bin':
                zout.writestr(item, bytes(vba))
            else:
                zout.writestr(item, zin.read(item.filename))

print(f'Created: {out}', file=sys.stderr)
