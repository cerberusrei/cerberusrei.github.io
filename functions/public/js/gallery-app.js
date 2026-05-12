import {
  buildFile,
  fetchData,
  fetchFileListPage,
  fetchProtectedFile,
  getAlbumInfo,
  getCustomAlbumConfigFromUrl,
  getFileIdFromUrl,
  getNormalizedUrl,
  getPreviewImageLink,
  getSourceLink,
  postProductionFolderName,
} from './gallery-core.js';

import { createApp, ref, computed, onMounted, onUnmounted, nextTick, Teleport } from 'vue';

const CACHE_INFO_READ = 'infoRead';
const INFO_VERSION = '4';

const queryParams = new URLSearchParams(window.location.search);
const gaDisabled = ref(
  queryParams.get('gaDisabled') === 'true' || navigator.userAgent.includes('Googlebot'),
);

function useLoadingLock() {
  const loading = ref(false);
  let releasedTime = null;
  return {
    isLocked: () => loading.value,
    lock: () => {
      loading.value = true;
      releasedTime = null;
    },
    release: () => {
      loading.value = false;
      releasedTime = new Date();
    },
    wasLockedInSeconds(seconds) {
      return releasedTime && Date.now() - releasedTime.getTime() <= seconds * 1000;
    },
  };
}

createApp({
  setup() {
    const currentPaths = ref([]);
    const files = ref([]);
    const filePage = ref(null);
    const uiLoading = ref(false);
    const loadingLock = useLoadingLock();
    const toastMessage = ref('');
    let toastTimer = null;

    const initFileId = getFileIdFromUrl();
    const customAlbumConfig = getCustomAlbumConfigFromUrl();

    const selectedFile = ref(null);
    const previewVisible = ref(true);
    const sourceLoaded = ref(false);

    const visibleFiles = computed(() =>
      files.value.filter((f) => !f.isUnsupportedFile() && f.fileName !== postProductionFolderName),
    );

    function getCurrentPath() {
      const arr = currentPaths.value;
      return arr.length ? arr[arr.length - 1] : null;
    }

    function showToast(message, duration = 500) {
      toastMessage.value = message;
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toastMessage.value = '';
      }, duration);
    }

    function setLoading() {
      loadingLock.lock();
      uiLoading.value = true;
    }

    function finishLoading() {
      loadingLock.release();
      uiLoading.value = false;
    }

    function onImageView(fileId) {
      if (gaDisabled.value) return;
      AnalyticsUtil.trackEvent('view', 'image', fileId);
    }

    function onVideoView(fileId) {
      if (gaDisabled.value) return;
      AnalyticsUtil.trackEvent('view', 'video', fileId);
    }

    function onFolderChanged(fileId) {
      if (gaDisabled.value) return;
      AnalyticsUtil.trackEvent('view', 'folder', fileId);
    }

    function displayName(name) {
      return name.length > 20 ? `${name.substring(0, 20)}...` : name;
    }

    async function switchPath(id, toSubFolder) {
      try {
        if (toSubFolder) {
          const info = await getAlbumInfo(id);
          currentPaths.value = [...currentPaths.value, { id, name: info.fileName }];
        } else {
          const pathIndex = currentPaths.value.findIndex((path) => path.id === id);
          if (pathIndex > 0) {
            currentPaths.value = currentPaths.value.slice(0, pathIndex + 1);
          } else {
            const next = [];
            const info = await getAlbumInfo(id, true);
            if (info.parent) {
              const albumListInfo = ALBUM_LIST.find((album) => album.id === info.parent.id);
              next.push({
                id: info.parent.id,
                name: albumListInfo ? albumListInfo.name : info.parent.fileName,
              });
            }
            next.push({ id, name: info.fileName });
            currentPaths.value = next;
          }
        }
        files.value = [];
        filePage.value = null;
        await listFiles();
      } catch (error) {
        console.error(error);
        throw error;
      }
    }

    async function getFileList() {
      if (
        filePage.value &&
        filePage.value.pageNumber >= Math.ceil(filePage.value.totalCount / filePage.value.pageSize)
      ) {
        showToast('No more records', 500);
        return [];
      }

      const request = {
        fileId: filePage.value ? filePage.value.fileId : getCurrentPath().id,
        page: filePage.value ? filePage.value.pageNumber + 1 : 1,
        pageSize: filePage.value ? filePage.value.pageSize : 12,
      };

      const response = await fetchFileListPage(request);
      filePage.value = { ...response, fileId: request.fileId };
      return response.records.map((file) => buildFile(file));
    }

    async function listFiles() {
      if (!getCurrentPath()) {
        return;
      }
      if (!loadingLock.isLocked()) {
        setLoading();
      }
      try {
        const list = await getFileList();
        files.value = files.value.concat(list);
      } catch (err) {
        console.error(err);
      } finally {
        finishLoading();
      }
    }

    async function listUpdatedRecently() {
      if (!loadingLock.isLocked()) {
        setLoading();
      }
      try {
        const response = await fetchData('updatedRecently').then((r) => r.json());
        files.value = response.records.map((file) => buildFile(file));
      } catch (err) {
        console.error(err);
      } finally {
        finishLoading();
      }
    }

    async function loadCustomAlbumList() {
      const jsonData = await fetch(customAlbumConfig).then((response) => response.json());
      files.value = jsonData
        .map((file) => {
          file.type = 2;
          file.categories = 1;
          file.organized = true;
          return file;
        })
        .map((file) => buildFile(file));
    }

    async function onScroll() {
      if (!getCurrentPath()) {
        return;
      }
      if (
        !loadingLock.isLocked() &&
        !loadingLock.wasLockedInSeconds(0.2) &&
        window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 50
      ) {
        setLoading();
        await listFiles();
      }
    }

    function thumbUrl(file) {
      return getPreviewImageLink(file, 512);
    }

    function tileClass(file) {
      if (file.isFolder()) {
        return file.organized ? '' : 'tile-folder--unorganized';
      }
      return '';
    }

    function openPhotoModal(file) {
      onImageView(file.id);
      selectedFile.value = file;
      previewVisible.value = true;
      sourceLoaded.value = false;
      nextTick(() => {
        const el = document.getElementById('photoFrame');
        if (el && window.bootstrap) {
          window.bootstrap.Modal.getOrCreateInstance(el).show();
        }
      });
    }

    function onSourceImageLoaded() {
      previewVisible.value = false;
      sourceLoaded.value = true;
    }

    function dismissPhoto() {
      const el = document.getElementById('photoFrame');
      if (el && window.bootstrap) {
        window.bootstrap.Modal.getInstance(el)?.hide();
      }
    }

    function onModalBodyClick(e) {
      if (
        e.target.closest('.gallery-photo-actions') ||
        e.target.closest('.btn-close-toolbar')
      ) {
        e.stopPropagation();
      }
    }

    function downloadName(file) {
      if (file.captureTime) {
        return file.captureTime.replace(/\D/g, '');
      }
      return file.id;
    }

    async function unlockFile(fileId) {
      const password = window.prompt('パスワードを入力してください');
      if (!password) {
        return;
      }
      try {
        const raw = await fetchProtectedFile(fileId, password);
        const built = buildFile(raw);
        const idx = files.value.findIndex((f) => f.id === fileId);
        if (idx >= 0) {
          const next = files.value.slice();
          next[idx] = built;
          files.value = next;
        }
      } catch (err) {
        if (err.status === 403) {
          window.alert('間違っています');
        } else {
          window.alert(`Failed: ${err.status || ''} ${err.message}`);
        }
      }
    }

    function onTileActivate(file) {
      if (file.isFolder()) {
        onFolderChanged(file.id);
        switchPath(file.id, true);
        return;
      }
      if (file.isImage() || file.passwordRequired) {
        openPhotoModal(file);
        return;
      }
      if (file.isVideo() && file.youtubeId) {
        onVideoView(file.id);
        window.open(`https://www.youtube.com/watch?v=${file.youtubeId}`, '_blank', 'noopener,noreferrer');
      }
    }

    function showInfoDialog() {
      if (navigator.userAgent.includes('Googlebot')) {
        return;
      }
      fetch('/info.html?t=1716833088380')
        .then((r) => r.text())
        .then((data) => {
          const body = document.querySelector('#infoFrame .modal-body');
          if (body) {
            body.innerHTML = data;
          }
          if (localStorage.getItem(CACHE_INFO_READ) !== INFO_VERSION) {
            const el = document.getElementById('infoFrame');
            if (el && window.bootstrap) {
              window.bootstrap.Modal.getOrCreateInstance(el).show();
            }
          }
        })
        .catch(console.error);
    }

    function shareCurrentAlbum(path) {
      const url = getNormalizedUrl(path.id);
      window.prompt('Share link:', url);
    }

    function onScrollHandler() {
      onScroll();
    }

    onMounted(() => {
      document.body.addEventListener('touchmove', onScrollHandler, { passive: true });
      window.addEventListener('scroll', onScrollHandler, { passive: true });

      const header = document.querySelector('.header');
      const gridWrap = document.querySelector('.gallery-page');
      if (header && gridWrap) {
        const h = header.getBoundingClientRect().height;
        gridWrap.style.marginTop = `${h + 10}px`;
      }

      window.switchPath = switchPath;
      window.dismissAlbumList = () => {
        const el = document.getElementById('albumListFrame');
        if (el && window.bootstrap) {
          window.bootstrap.Modal.getInstance(el)?.hide();
        }
      };
      window.onFolderChanged = onFolderChanged;
      window.dismissPhoto = dismissPhoto;
      window.onSourceImageLoaded = onSourceImageLoaded;

      const infoFrame = document.getElementById('infoFrame');
      if (infoFrame) {
        infoFrame.addEventListener('hidden.bs.modal', () => {
          localStorage.setItem(CACHE_INFO_READ, INFO_VERSION);
        });
      }

      new AlbumListController(ALBUM_LIST);
      showInfoDialog();

      if (initFileId) {
        switchPath(initFileId).catch(() => {
          listUpdatedRecently();
        });
      } else if (customAlbumConfig) {
        loadCustomAlbumList().finally(() => finishLoading());
      } else {
        listUpdatedRecently();
      }
    });

    onUnmounted(() => {
      document.body.removeEventListener('touchmove', onScrollHandler);
      window.removeEventListener('scroll', onScrollHandler);
    });

    return {
      currentPaths,
      visibleFiles,
      uiLoading,
      toastMessage,
      selectedFile,
      previewVisible,
      sourceLoaded,
      gaDisabled,
      displayName,
      thumbUrl,
      tileClass,
      getPreviewImageLink,
      getSourceLink,
      getNormalizedUrl,
      switchPath,
      onTileActivate,
      unlockFile,
      dismissPhoto,
      onModalBodyClick,
      onSourceImageLoaded,
      downloadName,
      shareCurrentAlbum,
    };
  },
  components: { Teleport },
  template: `
    <div class="gallery-page">
      <Teleport to="#breadcrumb-mount">
        <nav class="gallery-breadcrumb w-100" aria-label="breadcrumb">
          <ol class="breadcrumb align-middle align-items-center mb-0 flex-wrap">
            <li
              v-for="(path, index) in currentPaths"
              :key="path.id"
              class="breadcrumb-item"
              :class="{ active: index === currentPaths.length - 1 }"
              :aria-current="index === currentPaths.length - 1 ? 'page' : undefined"
            >
              <span class="d-inline-block align-middle text-truncate breadcrumb-label">
                <button
                  v-if="index < currentPaths.length - 1"
                  type="button"
                  class="btn btn-light btn-sm breadcrumb-btn"
                  :title="path.name"
                  @click="switchPath(path.id)"
                >{{ displayName(path.name) }}</button>
                <span v-else class="btn btn-light btn-sm breadcrumb-btn breadcrumb-btn--current" :title="path.name">
                  {{ displayName(path.name) }}
                </span>
              </span>
              <i
                v-if="index === currentPaths.length - 1"
                class="bi bi-share-fill ms-1 share-icon"
                role="button"
                tabindex="0"
                @click="shareCurrentAlbum(path)"
                @keydown.enter="shareCurrentAlbum(path)"
              ></i>
            </li>
          </ol>
        </nav>
      </Teleport>

      <div class="gallery-grid">
        <button
          v-for="file in visibleFiles"
          :key="file.id"
          type="button"
          class="gallery-tile"
          :class="tileClass(file)"
          @click="onTileActivate(file)"
        >
          <template v-if="file.isFolder()">
            <img class="gallery-tile-media" :src="thumbUrl(file)" :alt="file.fileName" loading="lazy" />
            <span class="gallery-tile-badge-wrap">
              <span v-if="(file.categories & 1)" class="gallery-cat-badge" style="background:#d2691e">よさこい</span>
              <span v-if="(file.categories & 2)" class="gallery-cat-badge" style="background:#0dcaf0">ソーラン</span>
              <span v-if="(file.categories & 4)" class="gallery-cat-badge" style="background:#d20df0">阿波踊り</span>
            </span>
            <span class="gallery-tile-caption">{{ file.fileName }}</span>
          </template>
          <template v-else-if="file.isVideo()">
            <template v-if="file.youtubeId">
              <div class="gallery-tile-video-placeholder">
                <i class="bi bi-youtube gallery-yt-icon"></i>
              </div>
            </template>
            <template v-else>
              <div class="gallery-tile-video-placeholder">
                <i class="bi bi-film"></i>
              </div>
            </template>
          </template>
          <template v-else>
            <img class="gallery-tile-media" :src="thumbUrl(file)" :alt="file.fileName" loading="lazy" />
            <button
              v-if="file.passwordRequired"
              type="button"
              class="gallery-tile-lock"
              @click.stop="unlockFile(file.id)"
            ><i class="bi bi-key"></i></button>
          </template>
        </button>
      </div>

      <div v-if="uiLoading" class="gallery-loading">
        <div class="spinner-border text-secondary" role="status"><span class="visually-hidden">Loading</span></div>
      </div>

      <div v-if="toastMessage" class="gallery-toast">{{ toastMessage }}</div>

      <div
        class="modal fade"
        id="photoFrame"
        tabindex="-1"
        aria-labelledby="photoFrameLabel"
        aria-hidden="true"
      >
        <div class="modal-dialog modal-fullscreen">
          <div v-if="selectedFile" class="modal-content gallery-photo-modal" @click="dismissPhoto">
            <div class="modal-body d-flex align-items-center justify-content-center" @click="onModalBodyClick">
              <button type="button" class="btn btn-secondary fixed-top transparent-button btn-close-toolbar" data-bs-dismiss="modal" aria-label="Close">X</button>
              <div class="container p-0 text-center">
                <img
                  :key="'p-' + selectedFile.id"
                  v-show="previewVisible"
                  class="img-fluid modal-content-image"
                  :src="getPreviewImageLink(selectedFile)"
                  alt=""
                />
                <img
                  :key="'s-' + selectedFile.id"
                  v-show="sourceLoaded"
                  class="img-fluid modal-content-image"
                  :src="getSourceLink(selectedFile)"
                  alt=""
                  @load="onSourceImageLoaded"
                />
              </div>
              <div v-show="previewVisible && !sourceLoaded" class="spinner-border source-image-spinner text-light" role="status"></div>
              <div class="fixed-bottom gallery-photo-actions">
                <a :href="getSourceLink(selectedFile)" class="download-link" :download="downloadName(selectedFile) + '.jpg'">
                  <button type="button" class="btn btn-light btn-lg transparent-button"><i class="bi bi-download"></i></button>
                </a>
                <button type="button" class="btn btn-lg btn-light transparent-button file-info-btn" data-bs-container="body" data-bs-toggle="popover" data-bs-custom-class="custom-popover" data-bs-title="Info" data-bs-placement="top">
                  <i class="bi bi-info-square"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
}).mount('#gallery-app');
