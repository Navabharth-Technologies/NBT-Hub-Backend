const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const credentialsPath = process.env.GOOGLE_DRIVE_CREDENTIALS_PATH || './google-credentials.json';
const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || '1ZvQT64uD-Z-XH_WEP_ZkhM7iseGptnZG';

let driveClient = null;

const initializeDrive = () => {
    if (driveClient) return driveClient;

    if (!fs.existsSync(credentialsPath)) {
        console.warn(`[DRIVE WARNING] Credentials file not found at ${credentialsPath}. Drive uploads will likely fail.`);
        return null;
    }

    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: credentialsPath,
            scopes: ['https://www.googleapis.com/auth/drive'],
        });
        driveClient = google.drive({ version: 'v3', auth });
        console.log('[DRIVE SYSTEM] Google Drive client initialized successfully.');
        return driveClient;
    } catch (err) {
        console.error('[DRIVE ERROR] Initialization failed:', err.message);
        return null;
    }
};

/**
 * Uploads a file buffer to Google Drive.
 * @param {Buffer} buffer - File data
 * @param {string} fileName - Destination name
 * @param {string} mimeType - File MIME type
 * @returns {Promise<string>} - The web view link or file ID
 */
const uploadFileToDrive = async (buffer, fileName, mimeType) => {
    const drive = initializeDrive();
    if (!drive) throw new Error('Google Drive client not initialized. Check credentials.');

    const { Readable } = require('stream');
    const bufferStream = new Readable();
    bufferStream.push(buffer);
    bufferStream.push(null);

    try {
        const response = await drive.files.create({
            requestBody: {
                name: fileName,
                parents: [folderId],
            },
            media: {
                mimeType,
                body: bufferStream,
            },
            fields: 'id, webViewLink, webContentLink',
            supportsAllDrives: true,
        });

        // Set permissions to "anyone with link can view"
        await drive.permissions.create({
            fileId: response.data.id,
            requestBody: {
                role: 'reader',
                type: 'anyone',
            },
            supportsAllDrives: true,
        });

        console.log(`[DRIVE SUCCESS] File uploaded: ${fileName} (${response.data.id})`);
        return response.data.webViewLink; // or response.data.id
    } catch (err) {
        console.error('[DRIVE UPLOAD ERROR]', err.message);
        throw err;
    }
};

module.exports = {
    uploadFileToDrive,
    initializeDrive
};
