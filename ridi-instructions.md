# Ridi Book Decryption - Instructions

## Prerequisites
- Windows VM with Ridi desktop app installed and logged in
- Python 3 with `cryptography` package installed (`pip install cryptography`)
- Device ID: `69820618-7326-45c6-8c91-623daac212dc`
- Shared folder mounted at `Z:\` pointing to this repo

## Steps

### 1. Download the book in the Ridi app
Open the Ridi desktop app on Windows and download the book you want.

### 2. Find the book ID
```powershell
dir C:\Users\eric\AppData\Roaming\Ridibooks\library\_4521285
```
Each folder name is a book ID (e.g., `659000190`).

### 3. Run the decryption script
```powershell
py -3 Z:\decrypt_ridi.py --device-id "69820618-7326-45c6-8c91-623daac212dc" <BOOK_ID>
```

Or decrypt all books at once:
```powershell
py -3 Z:\decrypt_ridi.py --device-id "69820618-7326-45c6-8c91-623daac212dc" all
```

### 4. Grab the epub
Decrypted files are saved to `Z:\decrypted_books\<BOOK_ID>\<BOOK_ID>-decrypted.epub`.

Open in Apple Books or any epub reader.
