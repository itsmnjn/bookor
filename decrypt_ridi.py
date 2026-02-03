#!/usr/bin/env python
"""
Ridi DRM removal tool for personal use of purchased books.
"""

import os
import sys
import shutil
import zipfile
from pathlib import Path
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

backend = default_backend()


def derive_book_key(dat_file_contents: bytes, device_id: str) -> bytes:
    """
    Derive the AES key for a book from its .dat file and the device ID.

    1. Take device_id[0:16] as intermediate key
    2. Decrypt .dat file using AES-128-CBC (IV = first 16 bytes)
    3. Decode as UTF-8 string, take chars 68-84 as book key
    """
    intermediate_key = device_id[0:16].encode('utf-8')

    iv = dat_file_contents[:16]
    ciphertext = dat_file_contents[16:]

    cipher = Cipher(algorithms.AES(intermediate_key), modes.CBC(iv), backend=backend)
    decryptor = cipher.decryptor()
    decrypted = decryptor.update(ciphertext) + decryptor.finalize()

    decrypted_str = decrypted.decode('utf-8')
    book_key_str = decrypted_str[68:84]
    book_key = book_key_str.encode('utf-8')

    return book_key


def decrypt_file_content(encrypted_content: bytes, key: bytes) -> bytes:
    """Decrypt a single file's content using AES-128-CBC."""
    if len(encrypted_content) < 16:
        return encrypted_content

    iv = encrypted_content[:16]
    ciphertext = encrypted_content[16:]

    if len(ciphertext) == 0 or len(ciphertext) % 16 != 0:
        return encrypted_content

    try:
        cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=backend)
        decryptor = cipher.decryptor()
        decrypted = decryptor.update(ciphertext) + decryptor.finalize()

        # Remove PKCS7 padding
        padding_len = decrypted[-1]
        if 0 < padding_len <= 16:
            if all(b == padding_len for b in decrypted[-padding_len:]):
                decrypted = decrypted[:-padding_len]

        return decrypted
    except Exception:
        return encrypted_content


def decrypt_epub(book_dir: Path, output_dir: Path, key: bytes) -> Path:
    """Decrypt all encrypted files in an EPUB and create a new EPUB file."""
    book_id = book_dir.name
    content_dir = book_dir / "content"
    epub_file = book_dir / f"{book_id}.epub"
    v11_epub_file = book_dir / f"{book_id}.v11.epub"

    # Determine source
    if content_dir.exists():
        source_type = "directory"
        print(f"Source: Extracted content directory")
    elif v11_epub_file.exists():
        source_type = "v11_epub"
        print(f"Source: v11 EPUB file")
    elif epub_file.exists():
        source_type = "epub"
        print(f"Source: EPUB file")
    else:
        raise FileNotFoundError(f"No content found in {book_dir}")

    # Create output directory
    output_dir.mkdir(parents=True, exist_ok=True)
    work_dir = output_dir / "content"

    if work_dir.exists():
        shutil.rmtree(work_dir)

    if source_type == "directory":
        shutil.copytree(content_dir, work_dir)
    else:
        source_epub = v11_epub_file if source_type == "v11_epub" else epub_file
        with zipfile.ZipFile(source_epub, 'r') as zf:
            zf.extractall(work_dir)

    # Decrypt all files
    for root, dirs, files in os.walk(work_dir):
        for file in files:
            file_path = Path(root) / file
            print(f"Decrypting: {file_path.relative_to(work_dir)}")
            try:
                with open(file_path, "rb") as f:
                    encrypted = f.read()
                decrypted = decrypt_file_content(encrypted, key)
                with open(file_path, "wb") as f:
                    f.write(decrypted)
            except Exception as e:
                print(f"  Warning: Failed to decrypt {file}: {e}")

    # Create the final EPUB
    epub_output = output_dir / f"{book_id}-decrypted.epub"

    with zipfile.ZipFile(epub_output, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("mimetype", "application/epub+zip", compress_type=zipfile.ZIP_STORED)

        for root, dirs, files in os.walk(work_dir):
            for file in files:
                if file == "mimetype":
                    continue
                file_path = Path(root) / file
                if not file_path.exists():
                    continue
                arcname = file_path.relative_to(work_dir)
                zf.write(file_path, arcname)

    print(f"\nCreated: {epub_output}")
    return epub_output


def list_books(library_dir: Path):
    """List all downloaded books."""
    books = []
    if not library_dir.exists():
        return books
    for item in library_dir.iterdir():
        if item.is_dir():
            dat_file = item / f"{item.name}.dat"
            if dat_file.exists():
                books.append(item.name)
    return books


def find_ridi_paths():
    """Find Ridi app data paths."""
    home = Path.home()
    if sys.platform == "win32":
        app_data = Path(os.environ.get("APPDATA", home / "AppData" / "Roaming"))
        return app_data / "Ridibooks"
    else:
        return home / "Library" / "Application Support" / "Ridibooks"


def main():
    print("=" * 60)
    print("Ridi Book Decryption Tool")
    print("=" * 60)
    print()

    ridi_base = find_ridi_paths()
    print(f"Ridi data directory: {ridi_base}")

    if not ridi_base.exists():
        print(f"\nError: Ridi directory not found at {ridi_base}")
        sys.exit(1)

    # Parse arguments
    args = sys.argv[1:]
    device_id = None
    book_id_arg = None

    i = 0
    while i < len(args):
        if args[i] == "--device-id" and i + 1 < len(args):
            device_id = args[i + 1]
            i += 2
        elif not args[i].startswith("-"):
            book_id_arg = args[i]
            i += 1
        else:
            i += 1

    if not device_id:
        print("\nUsage: python decrypt_ridi.py --device-id \"YOUR-DEVICE-ID\" [book_id]")
        sys.exit(1)

    print(f"Using device ID: {device_id[:8]}...{device_id[-4:]}")

    # Find books
    library_base = ridi_base / "library"
    all_books = []
    library_dir = None

    if library_base.exists():
        for item in library_base.iterdir():
            if item.is_dir():
                books = list_books(item)
                if books:
                    library_dir = item
                    all_books = books
                    break

    if not all_books:
        print("\nNo downloaded books found.")
        sys.exit(1)

    print(f"\nFound {len(all_books)} book(s):")
    for i, bid in enumerate(all_books, 1):
        print(f"  {i}. {bid}")

    # Select book
    if book_id_arg:
        if book_id_arg in all_books:
            book_ids = [book_id_arg]
        elif book_id_arg.isdigit():
            idx = int(book_id_arg) - 1
            if 0 <= idx < len(all_books):
                book_ids = [all_books[idx]]
            else:
                print(f"\nInvalid selection: {book_id_arg}")
                sys.exit(1)
        else:
            print(f"\nBook ID '{book_id_arg}' not found.")
            sys.exit(1)
    else:
        print("\nEnter book ID to decrypt (or 'all'):")
        selection = input("> ").strip()
        if selection.lower() == 'all':
            book_ids = all_books
        elif selection.isdigit():
            idx = int(selection) - 1
            if 0 <= idx < len(all_books):
                book_ids = [all_books[idx]]
            else:
                print("Invalid selection")
                sys.exit(1)
        else:
            book_ids = [selection]

    output_base = Path.cwd() / "decrypted_books"
    output_base.mkdir(exist_ok=True)

    for book_id in book_ids:
        print(f"\n{'=' * 60}")
        print(f"Processing: {book_id}")
        print('=' * 60)

        book_dir = library_dir / book_id
        dat_file = book_dir / f"{book_id}.dat"

        if not dat_file.exists():
            print(f"Warning: .dat file not found, skipping...")
            continue

        try:
            with open(dat_file, "rb") as f:
                dat_contents = f.read()

            book_key = derive_book_key(dat_contents, device_id)
            print(f"Derived book key: {book_key.hex()}")

            output_dir = output_base / book_id
            decrypt_epub(book_dir, output_dir, book_key)

        except Exception as e:
            print(f"Error processing {book_id}: {e}")
            import traceback
            traceback.print_exc()

    print(f"\n{'=' * 60}")
    print(f"Done! Decrypted books are in: {output_base}")
    print('=' * 60)


if __name__ == "__main__":
    main()
