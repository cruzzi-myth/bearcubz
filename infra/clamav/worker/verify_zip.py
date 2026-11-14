"""Bounded, full ZIP decompression/CRC verification. No archive-supplied output paths.
Optional private output directory receives server-named regular files for individual AV scans.
The decompressor must reach EOF with no trailing compressed bytes; declared sizes alone
and ZipExtFile.read() are insufficient proof when hostile metadata understates size.
"""
import sys, zipfile, resource, os, json, hashlib, struct, zlib
resource.setrlimit(resource.RLIMIT_CPU, (10, 10))
if sys.platform == 'linux':
    resource.setrlimit(resource.RLIMIT_AS, (256 * 1024 * 1024, 256 * 1024 * 1024))
MAX_EXPANDED = 100 * 1024 * 1024
try:
    total = 0
    manifest = []
    output = sys.argv[2] if len(sys.argv) > 2 else None
    if output: os.mkdir(output, 0o700)
    with zipfile.ZipFile(sys.argv[1]) as archive, open(sys.argv[1], 'rb') as raw:
        entries = archive.infolist()
        if len(entries) > 100: raise ValueError()
        for index, entry in enumerate(entries):
            if entry.flag_bits & 1 or entry.compress_type not in (0, 8): raise ValueError()
            # Have Python validate local filename/header relationships as well.
            with archive.open(entry): pass
            raw.seek(entry.header_offset)
            header = raw.read(30)
            if len(header) != 30 or header[:4] != b'PK\x03\x04': raise ValueError()
            flags, method = struct.unpack_from('<HH', header, 6)
            name_size, extra_size = struct.unpack_from('<HH', header, 26)
            if flags != entry.flag_bits or method != entry.compress_type: raise ValueError()
            offset = entry.header_offset + 30 + name_size + extra_size
            if offset + entry.compress_size > archive.start_dir: raise ValueError()
            raw.seek(offset)
            count = 0
            prefix = b''
            crc = 0
            checksum = hashlib.sha256()
            generated_name = 'entry-%04d' % index
            target = open(os.open(os.path.join(output, generated_name), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'wb') if output else None
            def consume(chunk):
                global total, count, prefix, crc
                count += len(chunk)
                total += len(chunk)
                if total > MAX_EXPANDED or count > MAX_EXPANDED or count > max(entry.compress_size, 1) * 20: raise ValueError()
                if len(prefix) < 512: prefix += chunk[:512-len(prefix)]
                checksum.update(chunk)
                crc = zlib.crc32(chunk, crc)
                if target: target.write(chunk)
            decoder = zlib.decompressobj(-15) if method == 8 else None
            remaining = entry.compress_size
            try:
                while remaining:
                    compressed = raw.read(min(65536, remaining))
                    if not compressed: raise ValueError()
                    remaining -= len(compressed)
                    if decoder:
                        pending = compressed
                        while pending:
                            consume(decoder.decompress(pending, 65536))
                            pending = decoder.unconsumed_tail
                            if decoder.unused_data: raise ValueError()
                    else: consume(compressed)
                if decoder and (not decoder.eof or decoder.unused_data or decoder.unconsumed_tail): raise ValueError()
            finally:
                if target: target.close()
            if count != entry.file_size or (crc & 0xffffffff) != entry.CRC: raise ValueError()
            if prefix.startswith((b'PK\x03\x04', b'PK\x05\x06', b'PK\x07\x08', b'\x1f\x8b', b'Rar!', b'7z\xbc\xaf\x27\x1c')) or prefix[257:262] == b'ustar': raise ValueError()
            manifest.append({'name': generated_name, 'size': count, 'sha256': checksum.hexdigest()})
    print(json.dumps({'complete': True, 'entryCount': len(manifest), 'expandedBytes': total, 'entries': manifest}) if output else 'COMPLETE')
except Exception:
    print('ZIP_INCOMPLETE')
    sys.exit(1)
