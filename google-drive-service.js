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
        try {
            await drive.permissions.create({
                fileId: response.data.id,
                requestBody: {
                    role: 'reader',
                    type: 'anyone',
                },
                supportsAllDrives: true,
            });
            console.log(`[DRIVE SUCCESS] Permissions set to 'anyone' for file: ${response.data.id}`);
        } catch (permErr) {
            console.error(`[DRIVE PERMISSION ERROR] Failed to set public permissions: ${permErr.message}`);
            
            // FALLBACK: Try to share with the specific organization domain if 'anyone' is restricted
            try {
                console.log('[DRIVE INFO] Attempting domain-level sharing fallback...');
                await drive.permissions.create({
                    fileId: response.data.id,
                    requestBody: {
                        role: 'reader',
                        type: 'domain',
                        domain: 'navabharathtechnologies.com'
                    },
                    supportsAllDrives: true,
                });
                console.log("[DRIVE SUCCESS] Permissions set to 'domain' (navabharathtechnologies.com)");
            } catch (domainErr) {
                console.error(`[DRIVE DOMAIN ERROR] Failed to set domain permissions: ${domainErr.message}`);
                console.warn('[DRIVE HINT] Please ensure the Google Drive folder is accessible and the Service Account has permission to share files.');
            }
        }

        console.log(`[DRIVE SUCCESS] File uploaded: ${fileName} (${response.data.id})`);
        
        // Return embed-friendly link (using /preview instead of /view)
        let embedLink = response.data.webViewLink;
        if (embedLink && embedLink.includes('/view')) {
            embedLink = embedLink.replace('/view', '/preview');
        }
        return embedLink;
    } catch (err) {
        console.error('[DRIVE UPLOAD ERROR]', err.message);
        throw err;
    }
};

/**
 * Gets a file stream from Google Drive for proxying.
 * @param {string} fileId 
 * @returns {Promise<{ stream: any, mimeType: string, name: string }>}
 */
const getFileStream = async (fileId) => {
    const drive = initializeDrive();
    if (!drive) throw new Error('Google Drive client not initialized.');

    try {
        // 1. Get metadata (name and mimeType)
        const metadata = await drive.files.get({
            fileId,
            fields: 'name, mimeType',
            supportsAllDrives: true
        });

        // 2. Get content stream
        const response = await drive.files.get({
            fileId,
            alt: 'media',
            supportsAllDrives: true
        }, { responseType: 'stream' });

        return {
            stream: response.data,
            mimeType: metadata.data.mimeType,
            name: metadata.data.name
        };
    } catch (err) {
        console.error('[DRIVE STREAM ERROR]', err.message);
        throw err;
    }
};

module.exports = {
    uploadFileToDrive,
    initializeDrive,
    getFileStream
};
