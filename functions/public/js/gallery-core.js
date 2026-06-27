/**
 * Shared file API helpers (no DOM). Used by the Vue gallery app.
 */

export const FILE_API_URI = 'https://cerberusrei.clear-net.jp/public/file-api.php';
export const postProductionFolderName = 'post-production';

let fileMeta = {};

export function setFileMeta(meta) {
  fileMeta = meta || {};
}

export function getFileExtension(fileName) {
  const lastDotIndex = fileName.lastIndexOf('.');
  if (lastDotIndex !== -1 && lastDotIndex < fileName.length - 1) {
    return fileName.substring(lastDotIndex + 1).toLowerCase();
  }
  return null;
}

export function buildFile(fileInfo) {
  const ext = getFileExtension(fileInfo.fileName);
  const file = Object.assign({}, fileInfo, {
    isImage() {
      if (ext == null) return false;
      return ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'gif';
    },
    isVideo() {
      if (ext == null) return false;
      return ext === 'mpg' || ext === 'mpeg' || ext === 'mp4' || ext === 'mov';
    },
    isFolder() {
      return this.type === 2;
    },
    isUnsupportedFile() {
      return fileInfo.fileName.startsWith('.') || fileInfo.fileName.endsWith('.ini');
    },
    toText() {
      return btoaUTF8(JSON.stringify(this));
    },
  });

  if (file.isImage()) {
    const meta = fileMeta[file.fileName];
    if (meta) {
      file.focusInfo = meta.focus;
    }
  }

  return file;
}

export function getPreviewImageLink(file, width = 512) {
  if (file.passwordRequired) {
    return 'images/password-protected-file.png';
  }
  if (!file.thumbnail) {
    return 'https://cdn-icons-png.flaticon.com/512/7757/7757558.png';
  }
  return `https://drive.google.com/thumbnail?authuser=0&sz=w${width}&id=${file.thumbnail}`;
}

export function getSourceLink(file) {
  return `${FILE_API_URI}?request=binary&fileId=${file.id}`;
}

export async function getAlbumInfo(id, includeParentInfo = false) {
  const album = typeof ALBUM_LIST !== 'undefined' ? ALBUM_LIST.find((a) => a.id === id) : null;
  if (album) {
    return { id: album.id, fileName: album.name };
  }
  return getFileInfo(id, includeParentInfo);
}

export async function getFileInfo(fileId, includeParentInfo = false) {
  const response = await fetchData('info', `fileId=${fileId}&includeParent=${includeParentInfo}`);
  return response.json();
}

export async function fetchFileListPage(request) {
  const response = await fetchData(
    'page',
    `fileId=${request.fileId}&page=${request.page}&pageSize=${request.pageSize}`,
  );
  return response.json();
}

export async function fetchFileListPageByTag(request) {
  const tags = request.tags
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => encodeURIComponent(tag))
    .join(',');
  const match = request.match || 'any';
  const page = request.page || 1;
  const size = request.pageSize || 12;
  const response = await fetchData(
    'pageByTag',
    `tags=${tags}&match=${match}&page=${page}&size=${size}`,
  );
  return response.json();
}

export async function fetchData(requestType, queryParams) {
  const fullUri = `${FILE_API_URI}?request=${requestType}`;
  return queryParams
    ? fetch(`${fullUri}&${queryParams}`, { credentials: 'include' })
    : fetch(fullUri, { credentials: 'include' });
}

export async function fetchProtectedFile(fileId, password) {
  const response = await fetch(`${FILE_API_URI}?request=protectedInfo&fileId=${fileId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ password }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const err = new Error(errorData.message || 'Unknown error');
    err.status = response.status;
    throw err;
  }
  return response.json();
}

export function getFileIdFromUrl() {
  const path = window.location.pathname;
  const pathSegments = path.split('/');
  if (pathSegments.length >= 3 && pathSegments[1] === 'album') {
    return pathSegments[2] || null;
  }
  return null;
}

export function getCustomAlbumConfigFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('customAlbums');
}

export function getNormalizedUrl(fileId) {
  const currentHost = window.location.hostname;
  return `https://${currentHost}/album/${fileId}`;
}

export function btoaUTF8(str) {
  if (!str) {
    return str;
  }
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}

export function atobUTF8(base64) {
  if (!base64) {
    return base64;
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}
