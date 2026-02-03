# Post-Mortem: Ridi Book Decryption

## Objective
Extract DRM-protected ebook from Ridi (Korean ebook platform) for personal use.

---

## Architecture Overview

Ridi desktop app is an Electron application. Books are stored encrypted at:
```
%APPDATA%/Ridibooks/library/<user_id>/<book_id>/
├── <book_id>.dat          # Encrypted key material
├── <book_id>.epub         # Encrypted epub (or .v11.epub)
└── content/               # Extracted & encrypted files
```

---

## Encryption Scheme

### Layer 1: Credential Storage
- Windows Credential Manager stores the datastore encryption key
- Target: `com.ridi.books/global`
- Value: Base64-encoded UUID (e.g., `OGE0MWI1MGQtOGY1Ni00NzJjLTgxOGEtZmQzYjBjYjFmNDAw` → `8a41b50d-8f56-472c-818a-fd3b0cb1f400`)

### Layer 2: Settings Datastore
- Location: `datastores/global/Settings`
- Format: 256-byte header + AES-ECB encrypted JSON
- Key derivation (from app code):
```javascript
function $b(e) {
    const t = CryptoJS.enc.Utf8.parse(e);
    if (e.length % 16) {
        CryptoJS.pad.Pkcs7.pad(t, 4);
    }
    return t;
}
```
- CryptoJS pads 36-byte UUID to 48 bytes internally - Python's cryptography library doesn't handle this the same way
- **Solution**: Use actual CryptoJS via Node.js (`decrypt_settings.js`)

### Layer 3: Book Key Derivation
From `dist/main/index.js` lines 60394-60395:
```javascript
const t = r.slice(0, 16),  // r = deviceId
n = lE(await Pg().readFile(nt().join(o, e, `${e}.dat`)), t),
```

The `lE` function (line 60339-60342):
```javascript
function lE(e, t) {
    const n = kw(e, t).toString("utf8").slice(68, 84);
    return new TextEncoder().encode(n);
}
```

The `kw` function (line 55181-55186):
```javascript
const Sw = "aes-128-cbc";
function kw(e, t) {
    const n = e.subarray(16),      // ciphertext
        r = e.subarray(0, 16),      // IV
        i = ip().createDecipheriv(Sw, t, r).setAutoPadding();
    return Buffer.concat([i.update(n), i.final()]);
}
```

**Key derivation flow:**
1. `intermediate_key = device_id[0:16].encode('utf-8')` (16 bytes)
2. Decrypt `.dat` file with AES-128-CBC (IV = first 16 bytes)
3. Decode decrypted bytes as UTF-8 string
4. `book_key = decrypted_string[68:84].encode('utf-8')` (16 bytes)

### Layer 4: Content Encryption
Each file in `content/` directory:
- AES-128-CBC
- IV = first 16 bytes of file
- Ciphertext = remaining bytes
- PKCS7 padding

---

## Mistakes Made

### Mistake 1: Wrong slice indices
**Wrong:**
```python
intermediate_key = device_id[2:18].encode('utf-8')
```
**Correct:**
```python
intermediate_key = device_id[0:16].encode('utf-8')
```

I confused two different code paths in the Ridi app:
- Line 60353: `s.slice(2, 18)` - used for **Comics**, not EPUBs
- Line 60394: `r.slice(0, 16)` - used for **EPUBs**

### Mistake 2: Bytes vs String slice
**Wrong:**
```python
book_key = decrypted[68:84]  # bytes slice
```
**Correct:**
```python
decrypted_str = decrypted.decode('utf-8')
book_key = decrypted_str[68:84].encode('utf-8')  # string slice, then encode
```

JavaScript's `.slice(68, 84)` on a string operates on characters, not bytes. For ASCII this is the same, but the distinction matters.

### Mistake 3: Selective file decryption
Misread this code block (lines 60411-60418):
```javascript
.filter((e) => {
    const t = nt().extname(e).slice(1);
    return "html" !== t && "xhtml" !== t;
});
// ...
const t = Ew(Pg().readFileSync(e), n);  // Ew = ENCRYPT
```

I thought this meant "don't decrypt html/xhtml". But `Ew` is the **encryption** function, not decryption. This code path is for creating the v11 format, not reading it.

**Reality:** All files in the content directory are encrypted. Just decrypt everything.

### Mistake 4: CryptoJS key handling
Python's `cryptography` library requires exact key lengths (16/24/32 bytes). CryptoJS handles arbitrary key lengths by padding internally:
```javascript
// 36-byte UUID gets PKCS7 padded to 48 bytes
// CryptoJS uses all 48 bytes across 3 AES key words
```

Spent way too long trying to replicate this in Python. Solution: just use CryptoJS via Node.js for the settings decryption.

### Mistake 5: iOS rabbit hole
The iOS Ridi app (runs on Mac via Catalyst) stores data at:
```
~/Library/Containers/<UUID>/Data/Library/data/books/
```

But:
- `.dat` file is only 112 bytes (vs ~200+ on Windows)
- Device ID stored differently (Amplitude analytics, not keychain)
- Key derivation completely different
- Decrypted `.dat` is raw bytes, not UTF-8

Wasted 20+ minutes before accepting iOS uses a different scheme entirely.

### Mistake 6: Full script rewrite
After iOS debugging corrupted the script with various attempted fixes, I rewrote it from scratch. This:
1. Introduced a Python invocation issue (`python` vs `py -3` on Windows)
2. Lost time re-testing things that already worked

Should have used git, or at minimum made incremental fixes instead of full rewrites.

---

## Final Working Code

### Key derivation:
```python
def derive_book_key(dat_file_contents: bytes, device_id: str) -> bytes:
    intermediate_key = device_id[0:16].encode('utf-8')

    iv = dat_file_contents[:16]
    ciphertext = dat_file_contents[16:]

    cipher = Cipher(algorithms.AES(intermediate_key), modes.CBC(iv))
    decryptor = cipher.decryptor()
    decrypted = decryptor.update(ciphertext) + decryptor.finalize()

    decrypted_str = decrypted.decode('utf-8')
    book_key = decrypted_str[68:84].encode('utf-8')

    return book_key
```

### File decryption:
```python
def decrypt_file_content(encrypted_content: bytes, key: bytes) -> bytes:
    if len(encrypted_content) < 16:
        return encrypted_content

    iv = encrypted_content[:16]
    ciphertext = encrypted_content[16:]

    if len(ciphertext) == 0 or len(ciphertext) % 16 != 0:
        return encrypted_content

    cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
    decryptor = cipher.decryptor()
    decrypted = decryptor.update(ciphertext) + decryptor.finalize()

    # Remove PKCS7 padding
    padding_len = decrypted[-1]
    if 0 < padding_len <= 16:
        if all(b == padding_len for b in decrypted[-padding_len:]):
            decrypted = decrypted[:-padding_len]

    return decrypted
```

---

## Lessons Learned

1. **Read the code more carefully** - `slice(2, 18)` vs `slice(0, 16)` cost 30+ minutes
2. **Don't be clever** - decrypt all files, let the function handle failures gracefully
3. **Know when to quit** - iOS was a dead end, should have bailed sooner
4. **Use version control** - even for throwaway scripts
5. **Test incrementally** - don't rewrite working code from scratch
