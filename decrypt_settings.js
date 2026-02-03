// Run this in the app_unpacked folder:
// node decrypt_settings.js "8a41b50d-8f56-472c-818a-fd3b0cb1f400" "C:\Users\eric\AppData\Roaming\Ridibooks\datastores\global\Settings"

const CryptoJS = require('crypto-js');
const fs = require('fs');

const key = process.argv[2];
const filePath = process.argv[3];

if (!key || !filePath) {
    console.log('Usage: node decrypt_settings.js <key> <settings_file_path>');
    process.exit(1);
}

// Read the file
const data = fs.readFileSync(filePath);
console.log('File size:', data.length);
console.log('First 32 bytes:', data.slice(0, 32).toString('hex'));

// Header is 256 bytes
const HEADER_SIZE = 256;
const encryptedData = data.slice(HEADER_SIZE);
console.log('Encrypted data size:', encryptedData.length);

// Convert key to WordArray (same as $b function in Ridi app)
function $b(e) {
    const t = CryptoJS.enc.Utf8.parse(e);
    if (e.length % 16) {
        CryptoJS.pad.Pkcs7.pad(t, 4);
    }
    return t;
}

// Convert encrypted data to WordArray
const ciphertext = CryptoJS.lib.WordArray.create(Uint8Array.from(encryptedData));

// Create cipher params
const cipherParams = CryptoJS.lib.CipherParams.create({ ciphertext: ciphertext });

// Decrypt
const keyWordArray = $b(key);
console.log('Key words:', keyWordArray.words.length, 'sigBytes:', keyWordArray.sigBytes);

const decrypted = CryptoJS.AES.decrypt(cipherParams, keyWordArray, {
    iv: undefined,
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.NoPadding
});

console.log('Decrypted sigBytes:', decrypted.sigBytes);

// Remove PKCS7 padding manually
const decryptedArray = [];
for (let i = 0; i < decrypted.sigBytes; i++) {
    decryptedArray.push((decrypted.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff);
}

// Check padding
const paddingLen = decryptedArray[decryptedArray.length - 1];
if (paddingLen > 0 && paddingLen <= 16) {
    const unpaddedArray = decryptedArray.slice(0, -paddingLen);
    const jsonStr = Buffer.from(unpaddedArray).toString('utf8');
    console.log('\n--- Decrypted JSON ---');
    const parsed = JSON.parse(jsonStr);
    console.log(JSON.stringify(parsed, null, 2));

    // Extract device ID
    if (parsed.data && parsed.data.device) {
        console.log('\n--- Device ID ---');
        console.log(parsed.data.device.deviceId);
    } else if (parsed.device) {
        console.log('\n--- Device ID ---');
        console.log(parsed.device.deviceId);
    }
} else {
    console.log('Decrypted bytes:', Buffer.from(decryptedArray).toString('hex').slice(0, 100));
}
