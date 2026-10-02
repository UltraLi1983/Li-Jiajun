import zipfile, os, shutil, sys

xlsm = sys.argv[1]
out  = xlsm.replace('.xlsm', '_nopw.xlsm')

# Extract
with zipfile.ZipFile(xlsm) as z:
    vba = bytearray(z.read('xl/vbaProject.bin'))

# Replace CMG hash
old = b'CMG="1C1EB078D02ED42ED42BD92BD9"'
new = b'CMG="' + b' ' * 26 + b'"'
vba = vba.replace(old, new)

# Replace DPB hash
old = b'DPB="CECC62CAA6CE45EB45EBBA1546EBBFA12F2370DD30816F0787C46DA69F104587730E1B4A70F838"'
new = b'DPB="' + b' ' * 78 + b'"'
vba = vba.replace(old, new)

# Replace GC hash
old = b'GC="80822C2F2D2F2D2F"'
new = b'GC="' + b' ' * 16 + b'"'
vba = vba.replace(old, new)

# Write new zip
shutil.copy2(xlsm, out)
with zipfile.ZipFile(out, 'r') as zin:
    items = [(item, zin.read(item.filename)) for item in zin.infolist()]
with zipfile.ZipFile(out, 'w') as zout:
    for item, data in items:
        if item.filename == 'xl/vbaProject.bin':
            zout.writestr(item, bytes(vba))
        else:
            zout.writestr(item, data)

print(f'Done: {out}')
