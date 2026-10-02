import zipfile, struct, shutil, math, sys
from oletools.olevba import decompress_stream

SRC = sys.argv[1]
OUT = sys.argv[2]

with zipfile.ZipFile(SRC) as z:
    vba = bytearray(z.read('xl/vbaProject.bin'))

# Remove VBA password
for old, new in [
    (b'CMG="1C1EB078D02ED42ED42BD92BD9"', b'CMG="' + b' ' * 26 + b'"'),
    (b'DPB="CECC62CAA6CE45EB45EBBA1546EBBFA12F2370DD30816F0787C46DA69F104587730E1B4A70F838"', b'DPB="' + b' ' * 78 + b'"'),
    (b'GC="80822C2F2D2F2D2F"', b'GC="' + b' ' * 16 + b'"'),
]:
    if old in vba: vba = vba.replace(old, new)

sector_size = 512; mini_size = 64
fat = []
for fs in [0, 128]:
    offset = sector_size + fs * sector_size
    for i in range(0, sector_size, 4):
        fat.append(struct.unpack('<I', vba[offset + i:offset + i + 4])[0])

mini_fat = []
s = 2
while s < 0xFFFFFFF0:
    offset = sector_size + s * sector_size
    for j in range(0, sector_size, 4):
        mini_fat.append(struct.unpack('<I', vba[offset + j:offset + j + 4])[0])
    s = fat[s] if s < len(fat) else 0xFFFFFFFF

dir_entries = {}
sector = 1
while sector < 0xFFFFFFF0:
    offset = sector_size + sector * sector_size
    for i in range(4):
        ed = vba[offset + i*128:offset + i*128 + 128]
        if ed[0] == 0 and ed[64] == 0: continue
        name = ''
        for j in range(0, 64, 2):
            if ed[j] == 0 and ed[j+1] == 0: break
            name += chr(ed[j])
        if name.strip():
            dir_entries[name] = {
                'start': struct.unpack('<I', ed[0x74:0x78])[0],
                'size': struct.unpack('<Q', ed[0x78:0x80])[0],
                'size_offset': sector_size + sector * sector_size + i*128 + 0x78
            }
    sector = fat[sector] if sector < len(fat) else 0xFFFFFFFF

root = dir_entries.get('Root Entry', {})
root_data_start = sector_size + root['start'] * sector_size

def read_stream(name):
    e = dir_entries.get(name)
    if not e: return None
    if e['size'] < 4096:
        s = e['start']; data = bytearray()
        while s < 0xFFFFFFF0:
            off = s * mini_size
            data.extend(vba[root_data_start + off:root_data_start + off + mini_size])
            if len(data) >= e['size']: break
            s = mini_fat[s] if s < len(mini_fat) else 0xFFFFFFFF
        return bytes(data[:e['size']])
    else:
        s = e['start']; data = bytearray()
        while s < 0xFFFFFFF0:
            off = sector_size + s * sector_size
            data.extend(vba[off:off + sector_size])
            if len(data) >= e['size']: break
            s = fat[s] if s < len(fat) else 0xFFFFFFFF
        return bytes(data[:e['size']])

def write_stream_data(name, actual_data, allocated_size):
    """Write actual_data (padded to allocated_size) to the stream, update dir entry size to actual length"""
    e = dir_entries.get(name)
    if not e: return False
    new_size = len(actual_data)
    if new_size > allocated_size: return False

    # Pad with zeros to fill the allocated space
    padded = actual_data + b'\x00' * (allocated_size - new_size)

    if e['size'] < 4096:
        s = e['start']; written = 0
        while s < 0xFFFFFFF0 and written < len(padded):
            off = s * mini_size
            chunk = padded[written:written + mini_size]
            for i, b in enumerate(chunk):
                vba[root_data_start + off + i] = b
            written += len(chunk)
            s = mini_fat[s] if s < len(mini_fat) else 0xFFFFFFFF
    else:
        s = e['start']; written = 0
        while s < 0xFFFFFFF0 and written < len(padded):
            off = sector_size + s * sector_size
            chunk = padded[written:written + sector_size]
            for i, b in enumerate(chunk):
                vba[off + i] = b
            written += len(chunk)
            s = fat[s] if s < len(fat) else 0xFFFFFFFF

    # Update directory entry size to ACTUAL data length
    struct.pack_into('<Q', vba, dir_entries[name]['size_offset'], new_size)
    dir_entries[name]['size'] = new_size
    return True

def compress_stream(data):
    if isinstance(data, str): data = data.encode('cp1252')
    result = bytearray([0x01])
    src_pos = 0
    while src_pos < len(data):
        remaining = len(data) - src_pos
        chunk_data_size = min(4096, remaining)
        compressed = bytearray()
        decompressed_in_chunk = 0
        i = 0
        while i < chunk_data_size:
            flag_byte = 0; tokens = bytearray()
            for bit in range(8):
                if i >= chunk_data_size: break
                window = data[:src_pos + i]; wlen = len(window)
                best_offset = 0; best_length = 0
                if wlen > 0:
                    max_match = min(4098, chunk_data_size - i)
                    for wp in range(wlen - 1, max(0, wlen - 4096) - 1, -1):
                        ml = 0
                        while (ml < max_match and wp + ml < wlen and 
                               src_pos + i + ml < len(data) and 
                               window[wp + ml] == data[src_pos + i + ml]):
                            ml += 1
                        if ml >= 3 and ml > best_length:
                            best_offset = wlen - wp; best_length = ml
                if best_offset > 0:
                    diff = decompressed_in_chunk
                    bit_count = int(math.ceil(math.log(max(diff, 1), 2)))
                    bit_count = max(bit_count, 4)
                    max_len = (0xFFFF >> bit_count) + 3
                    al = min(best_length, max_len)
                    if best_offset <= (1 << bit_count):
                        flag_byte |= (1 << bit)
                        token = ((best_offset-1) << (16-bit_count)) | (al-3)
                        tokens.extend(struct.pack('<H', token))
                        i += al; decompressed_in_chunk += al; continue
                tokens.append(data[src_pos + i]); i += 1; decompressed_in_chunk += 1
            compressed.append(flag_byte); compressed.extend(tokens)
        chunk_total = len(compressed) + 2
        if chunk_total >= 4098 or chunk_total >= remaining + 2 + 2:
            result.extend(struct.pack('<H', 0x3FFF))
            result.extend(data[src_pos:src_pos+chunk_data_size])
            if chunk_data_size < 4096: result.extend(b'\x00' * (4096 - chunk_data_size))
        else:
            result.extend(struct.pack('<H', 0xB000 | (chunk_total - 3)))
            result.extend(compressed)
        src_pos += chunk_data_size
    return bytes(result)

text_offsets = {'LOP_Erstellen': 5596, 'Speichern': 4571}

def modify_LOP(s):
    s = s.replace('Sub erstelle_LOP()', 'Sub CreateLOP()')
    s = s.replace('Dim quellBlatt As String', 'Dim sourceSheet As String')
    s = s.replace('Dim zielBlatt As String', 'Dim targetSheet As String')
    s = s.replace('quellBlatt = "Remarks"', 'sourceSheet = "Remarks"')
    s = s.replace('zielBlatt = "LOP"', 'targetSheet = "LOP"')
    s = s.replace('Worksheets(quellBlatt)', 'Worksheets(sourceSheet)')
    s = s.replace('Worksheets(zielBlatt)', 'Worksheets(targetSheet)')
    s = s.replace('quellBlatt', 'sourceSheet')
    s = s.replace('zielBlatt', 'targetSheet')
    # Use hex escapes for German umlauts to avoid encoding issues
    U = '\xfc'   # ü
    O = '\xf6'   # ö
    A = '\xe4'   # ä
    sharp = '\xdf'  # ß
    for de, en in [
        ("'Erstellt die LOP basierend auf den Anmerkungen (Blatt \"Anmerkungen\")",
         "'Creates LOP based on remarks (sheet \"Remarks\")"),
        ("'Aufgelistet werden alle Kommentare aus Fragen mit einer Bewertung <= '++'",
         "'Lists all comments from questions rated <= '++'"),
        ("'Variablen definieren", "'Define variables"),
        (f"'Variablen bef{U}llen", "'Set variables"),
        (f"'L{O}sche: Zeile 25 - Endeliste; danach: benenne Zeile 25 = Nr. 20",
         "'Delete row 25 to end; rename row 25 = No. 20"),
        ("'Bereich leeren", "'Clear range"),
        (f"'Bef{U}lle LOP", "'Fill LOP"),
        ("'Quellblatt durchsuchen", "'Search source sheet"),
        (f"'Bef{U}llen wenn schlechter als \"voll erf{U}llt\" bewertet",
         "'Fill if rating worse than \"fully fulfilled\""),
        ("'Wenn Frage schlecht bewertet aber kein Kommentar eingef" + U + "gt",
         "'If poorly rated but no comment added"),
        ("'Ansonsten kopiere Kommentar", "'Otherwise copy comment"),
        (f"'Neue Zeile unter aktueller einf{U}gen", "'Insert row below current"),
        ("'Nummerierung anpassen", "'Renumber items"),
        ("'endeListe neu setzen", "'Reset endList"),
        (f"'endeListe sollte = 24 sein - ansonsten: {U}berfl{U}ssige Zeilen l{O}schen!",
         "'endList should = 24 - otherwise delete extra rows!"),
        (f"'Modul-Nummer einf{U}gen", "'Insert module number"),
        (f"'===== L{O}sche LOP ==========================================",
         "'===== Clear LOP ============================================"),
        (f"'===== Bef{U}lle LOP =========================================",
         "'===== Fill LOP ============================================="),
    ]:
        s = s.replace(de, en)
    s = s.replace(f' wurde nicht voll erf{U}llt.', ' was not fully fulfilled.')
    return s

def modify_Speichern(s):
    s = s.replace("Case -2147018887   ' Divide by zero error",
                  "Case -2147018887   ' RPC server unavailable (file opened by another process)")
    U = '\xfc'; O = '\xf6'; A = '\xe4'
    for de, en in [
        ("'Abspeichern eines Arrays als PDF", "'Save array of sheets as PDF"),
        ("'Speicherpfad ermitteln", "'Get save path"),
        ("'Datei als PDF speichern", "'Save file as PDF"),
        ("'LOP getrennt speichern (falls lop = true)", "'Save LOP separately (if lop = True)"),
        ("'Nach Kopiervorgang Audit-WB wieder auf Standard Format setzen",
         "'Reset audit workbook to default format after copy"),
        (f"'(da Speichern zu lange dauert und Makro weiterl{A}uft)",
         "'(save takes too long, macro continues)"),
        (f"'in neue LOP Z{U}r{U}ckkehren und spreichern", "'Return to new LOP and save"),
        ("'Ohne LOP: Default herstellen", "'Without LOP: restore default"),
        (f"'nur 1. Seite ausw{A}hlen", "'Select only first sheet"),
        ("'Array erstellen", "'Create array"),
    ]:
        s = s.replace(de, en)
    return s

print("=== Patching LOP_Erstellen and Speichern ===")
for mod_name, mod_func in [('LOP_Erstellen', modify_LOP), ('Speichern', modify_Speichern)]:
    raw = read_stream(mod_name)
    toff = text_offsets[mod_name]
    orig_bytes = decompress_stream(bytearray(raw[toff:]))
    orig_str = orig_bytes.decode('cp1252')
    new_str = mod_func(orig_str)
    new_bytes = new_str.encode('cp1252')
    new_comp = compress_stream(new_bytes)
    
    new_total = toff + len(new_comp)
    old_total = len(raw)
    
    if new_total > old_total:
        print(f"  {mod_name}: TOO BIG ({new_total}>{old_total})")
        continue
    
    actual_data = raw[:toff] + new_comp
    if write_stream_data(mod_name, actual_data, old_total):
        changes = sum(1 for a, b in zip(orig_str.split('\n'), new_str.split('\n')) if a != b)
        print(f"  {mod_name}: OK ({old_total}->{new_total}b, {changes} lines changed)")
    else:
        print(f"  {mod_name}: WRITE FAILED")

# Create output
shutil.copy2(SRC, OUT)
with zipfile.ZipFile(OUT, 'r') as zin:
    items = [(item, zin.read(item.filename)) for item in zin.infolist()]
with zipfile.ZipFile(OUT, 'w') as zout:
    for item, data in items:
        if item.filename == 'xl/vbaProject.bin':
            zout.writestr(item, bytes(vba))
        else:
            zout.writestr(item, data)

print(f"\nDone: {OUT}")
