/**
 * This script wraps basic operations of Google Drive APIs.
 *
 * The following libraries must be imported in the page where this file is imported:
 * <script async defer src="https://apis.google.com/js/api.js" onLoad="gapiLoaded()"></script>
 * <script async defer src="https://accounts.google.com/gsi/client" onLoad="gisLoaded()"></script>
 *
 * "initUi" function is a hardcode callback function which will be called after initialization is completed.
 */


// Quick start: https://developers.google.com/drive/api/quickstart/js
// File list: https://developers.google.com/drive/api/v3/reference/files/list
const CLIENT_ID = "1015092151085-osb88kjq9jtmve4hv2bisa0ugda4iun0.apps.googleusercontent.com";
const API_KEY = SPECIFIC_API_KEY || "AIzaSyD6tDosGMgPK33O8K7yWhXbaMvXim121yY";

// Discovery doc URL for APIs used by the quickstart
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';

// Authorization scopes required by the API; multiple scopes can be included, separated by spaces.
const SCOPES = 'https://www.googleapis.com/auth/drive.metadata.readonly';

let tokenClient;
let gapiInited = false;
let gisInited = false;

/**
 * Callback after api.js is loaded.
 */
function gapiLoaded() {
    gapi.load('client', initializeGapiClient);
}

/**
 * Callback after the API client is loaded. Loads the
 * discovery doc to initialize the API.
 */
async function initializeGapiClient() {
    await gapi.client.init({
        apiKey: API_KEY,
        discoveryDocs: [DISCOVERY_DOC],
    });
    gapiInited = true;

    if (gapiInited && gisInited) {
        initUi();
    }
}

/**
 * Callback after Google Identity Services are loaded.
 */
function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: '', // defined later
    });
    gisInited = true;

    if (gapiInited && gisInited) {
        initUi();
    }
}

/**
 *  Sign in the user upon button click.
 */
function switchAccount() {
    try {
        signOut();

        tokenClient.callback = async (resp) => {
            if (resp.error !== undefined) {
                throw (resp);
            }
            await listFiles();
        };

        if (gapi.client.getToken() === null) {
            // Prompt the user to select a Google Account and ask for consent to share their data
            // when establishing a new session.
            tokenClient.requestAccessToken({prompt: 'consent'});
        } else {
            // Skip display of account chooser and consent dialog for an existing session.
            tokenClient.requestAccessToken({prompt: ''});
        }
    } catch (err) {
        handleError(err);
    }
}

function signOut() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token);
        gapi.client.setToken('');
    }
}

async function getAlbumName(id) {
    let album = ALBUM_LIST.find(album => album.id === id);
    if (album) {
        return album.name;
    }

    // get name from Google Drive (for case when going to sub-folder)
    try {
        let info = await getGoogleFileInfo(id);
        return info.name;
    } catch (err) {
        handleError(err);
        return "unknown-folder-name";
    }
}

async function getGoogleFileInfo(id) {
    let response = await gapi.client.drive.files.get({ fileId: id });
    return response.result;
}

function getPreviewImageLink(id, width) {
    if (!width) {
        width = 512;
    }
    return `https://drive.google.com/thumbnail?authuser=0&sz=w${width}&id=${id}`;
}

function getSourceImageLink(id) {
    return `https://drive.google.com/uc?export=view&id=${id}`;
}