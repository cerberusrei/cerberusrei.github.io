import {
  buildFile,
  fetchData,
  fetchFileListPage,
  fetchFileListPageByTag,
  fetchProtectedFile,
  getAlbumInfo,
  getCustomAlbumConfigFromUrl,
  getFileExtension,
  getFileIdFromUrl,
  getNormalizedUrl,
  getPreviewImageLink,
  getSourceLink,
  postProductionFolderName,
} from './gallery-core.js';

import { createApp, ref, computed, onMounted, onUnmounted, nextTick } from 'vue';

const CACHE_INFO_READ = 'infoRead';
const INFO_VERSION = '4';
const LAYOUT_STORAGE_KEY = 'galleryLayoutMode';

function readStoredLayoutMode() {
  try {
    const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (saved === 'single' || saved === 'triple') {
      return saved;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeStoredLayoutMode(mode) {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

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

    const layoutMode = ref(readStoredLayoutMode() ?? 'triple');

    const tagSearchInput = ref('');
    const activeTagSearch = ref('');
    const tagSearchMatch = ref('any');
    const inTagSearchMode = ref(false);

    const visibleFiles = computed(() =>
      files.value.filter((f) => !f.isUnsupportedFile() && f.fileName !== postProductionFolderName),
    );

    const loadedVisibleCount = computed(() => visibleFiles.value.length);

    const albumTotalCount = computed(() => {
      const fp = filePage.value;
      if (fp == null || typeof fp.totalCount !== 'number') {
        return null;
      }
      return fp.totalCount;
    });

    const inAlbumBrowseMode = computed(() => currentPaths.value.length > 0);

    const hasMorePages = computed(() => {
      const fp = filePage.value;
      if (!fp || typeof fp.totalCount !== 'number' || !fp.pageSize) {
        return false;
      }
      return fp.pageNumber < Math.ceil(fp.totalCount / fp.pageSize);
    });

    const showAlbumProgress = computed(
      () =>
        (inAlbumBrowseMode.value || inTagSearchMode.value) && albumTotalCount.value != null,
    );

    const showLooseCountChip = computed(() => {
      if (showAlbumProgress.value) {
        return false;
      }
      if (!loadedVisibleCount.value) {
        return false;
      }
      return true;
    });

    const looseCountLabel = computed(() => {
      if (inTagSearchMode.value) {
        return `タグ: ${activeTagSearch.value}`;
      }
      if (customAlbumConfig) {
        return 'カスタム一覧';
      }
      if (inAlbumBrowseMode.value) {
        return 'このフォルダ';
      }
      return '最近の更新';
    });

    function exitTagSearchMode() {
      inTagSearchMode.value = false;
      activeTagSearch.value = '';
    }

    function resetFileListState() {
      files.value = [];
      filePage.value = null;
    }

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
        exitTagSearchMode();
        tagSearchInput.value = '';
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

    async function getTagSearchFileList() {
      if (
        filePage.value &&
        filePage.value.pageNumber >= Math.ceil(filePage.value.totalCount / filePage.value.pageSize)
      ) {
        showToast('No more records', 500);
        return [];
      }

      const request = {
        tags: activeTagSearch.value,
        match: tagSearchMatch.value,
        page: filePage.value ? filePage.value.pageNumber + 1 : 1,
        pageSize: filePage.value ? filePage.value.pageSize : 12,
      };

      const response = await fetchFileListPageByTag(request);
      filePage.value = { ...response, tagSearch: true };
      return response.records.map((file) => buildFile(file));
    }

    async function listTagSearchFiles(append = true) {
      if (!activeTagSearch.value) {
        return;
      }
      if (!loadingLock.isLocked()) {
        setLoading();
      }
      try {
        const list = await getTagSearchFileList();
        files.value = append ? files.value.concat(list) : list;
      } catch (err) {
        console.error(err);
        showToast('タグ検索に失敗しました', 1200);
      } finally {
        finishLoading();
      }
    }

    async function submitTagSearch() {
      const tags = tagSearchInput.value
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
        .join(',');

      if (!tags) {
        await clearTagSearch();
        return;
      }

      currentPaths.value = [];
      resetFileListState();
      activeTagSearch.value = tags;
      inTagSearchMode.value = true;

      if (gaDisabled.value === false) {
        AnalyticsUtil.trackEvent('search', 'tag', tags);
      }

      await listTagSearchFiles(false);
    }

    async function clearTagSearch() {
      if (!inTagSearchMode.value && !tagSearchInput.value) {
        return;
      }
      tagSearchInput.value = '';
      exitTagSearchMode();
      currentPaths.value = [];
      resetFileListState();
      await listUpdatedRecently();
    }

    function onTagSearchKeydown(event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        submitTagSearch();
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
      if (inTagSearchMode.value) {
        if (
          !loadingLock.isLocked() &&
          !loadingLock.wasLockedInSeconds(0.2) &&
          window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 50
        ) {
          setLoading();
          await listTagSearchFiles();
        }
        return;
      }
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
      const w = layoutMode.value === 'single' ? 800 : 512;
      return getPreviewImageLink(file, w);
    }

    function youtubeThumbUrl(youtubeId) {
      if (!youtubeId) {
        return '';
      }
      return `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;
    }

    function tileClass(file) {
      if (file.isFolder()) {
        const parts = ['gallery-tile--folder'];
        if (!file.organized) {
          parts.push('tile-folder--unorganized');
        }
        return parts.join(' ');
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

    function downloadFilename(file) {
      if (!file) {
        return '';
      }
      if (file.isImage()) {
        return `${downloadName(file)}.jpg`;
      }
      if (file.isVideo()) {
        const ext = getFileExtension(file.fileName);
        if (ext && file.fileName) {
          return file.fileName;
        }
        return `${file.id}.mp4`;
      }
      return String(file.id);
    }

    function showDownloadFor(file) {
      return !file.passwordRequired && (file.isImage() || file.isVideo());
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

    function toggleLayout() {
      const next = layoutMode.value === 'triple' ? 'single' : 'triple';
      layoutMode.value = next;
      writeStoredLayoutMode(next);
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
      loadedVisibleCount,
      albumTotalCount,
      showAlbumProgress,
      showLooseCountChip,
      looseCountLabel,
      hasMorePages,
      inAlbumBrowseMode,
      uiLoading,
      toastMessage,
      selectedFile,
      previewVisible,
      sourceLoaded,
      gaDisabled,
      layoutMode,
      toggleLayout,
      tagSearchInput,
      tagSearchMatch,
      inTagSearchMode,
      submitTagSearch,
      clearTagSearch,
      onTagSearchKeydown,
      displayName,
      thumbUrl,
      youtubeThumbUrl,
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
      downloadFilename,
      showDownloadFor,
      shareCurrentAlbum,
    };
  },
  template: `
    <div class="gallery-page" :class="{ 'gallery-page--single': layoutMode === 'single' }">
      <Teleport to="#tag-search-mount">
        <form class="gallery-tag-search" role="search" @submit.prevent="submitTagSearch">
          <input
            v-model="tagSearchInput"
            type="search"
            class="form-control form-control-sm gallery-tag-search-input"
            placeholder="タグ検索"
            aria-label="タグで検索（カンマ区切り）"
            autocomplete="off"
            enterkeyhint="search"
            @keydown="onTagSearchKeydown"
          />
          <select
            v-model="tagSearchMatch"
            class="form-select form-select-sm gallery-tag-search-match"
            aria-label="タグ一致条件"
            title="any = いずれかのタグ、all = すべてのタグ"
          >
            <option value="any">any</option>
            <option value="all">all</option>
          </select>
          <button
            type="submit"
            class="btn btn-light btn-sm gallery-tag-search-btn"
            aria-label="タグ検索"
            title="検索"
          >
            <i class="bi bi-search"></i>
          </button>
          <button
            v-if="inTagSearchMode || tagSearchInput"
            type="button"
            class="btn btn-light btn-sm gallery-tag-search-clear"
            aria-label="検索をクリア"
            title="クリア"
            @click="clearTagSearch"
          >
            <i class="bi bi-x-lg"></i>
          </button>
        </form>
      </Teleport>

      <Teleport to="#breadcrumb-mount">
        <div class="gallery-header-bar w-100 d-flex align-items-center flex-nowrap gap-1">
          <nav class="gallery-breadcrumb flex-grow-1 min-w-0" aria-label="breadcrumb">
            <ol class="breadcrumb align-middle align-items-center mb-0 flex-nowrap">
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
          <button
            type="button"
            class="btn btn-light btn-sm gallery-layout-toggle flex-shrink-0"
            :aria-pressed="layoutMode === 'single'"
            :aria-label="layoutMode === 'triple' ? '1列表示に切り替え' : '3列表示に切り替え'"
            :title="layoutMode === 'triple' ? '1列（画面幅・元の比率）' : '3列グリッド'"
            @click="toggleLayout"
          >
            <span class="gallery-layout-picto" :data-mode="layoutMode" aria-hidden="true">
              <span class="glp-one"></span>
              <span class="glp-three"><i></i><i></i><i></i></span>
            </span>
          </button>
        </div>
      </Teleport>

      <div class="gallery-grid">
        <div
          v-for="file in visibleFiles"
          :key="file.id"
          class="gallery-tile"
          :class="tileClass(file)"
          role="button"
          tabindex="0"
          @click="onTileActivate(file)"
          @keydown.enter.prevent="onTileActivate(file)"
          @keydown.space.prevent="onTileActivate(file)"
        >
          <template v-if="file.isFolder()">
            <template v-if="layoutMode === 'single'">
              <div class="gallery-album-single">
                <div class="gallery-album-single-frame">
                  <img
                    class="gallery-tile-media gallery-album-single-cover"
                    :src="thumbUrl(file)"
                    :alt="file.fileName"
                    loading="lazy"
                  />
                  <span class="gallery-tile-badge-wrap">
                    <span v-if="(file.categories & 1)" class="gallery-cat-badge" style="background:#d2691e">よさこい</span>
                    <span v-if="(file.categories & 2)" class="gallery-cat-badge" style="background:#0dcaf0">ソーラン</span>
                    <span v-if="(file.categories & 4)" class="gallery-cat-badge" style="background:#d20df0">阿波踊り</span>
                  </span>
                </div>
                <div class="gallery-album-single-name">{{ file.fileName }}</div>
              </div>
            </template>
            <template v-else>
              <img class="gallery-tile-media" :src="thumbUrl(file)" :alt="file.fileName" loading="lazy" />
              <span class="gallery-tile-badge-wrap">
                <span v-if="(file.categories & 1)" class="gallery-cat-badge" style="background:#d2691e">よさこい</span>
                <span v-if="(file.categories & 2)" class="gallery-cat-badge" style="background:#0dcaf0">ソーラン</span>
                <span v-if="(file.categories & 4)" class="gallery-cat-badge" style="background:#d20df0">阿波踊り</span>
              </span>
              <span class="gallery-tile-caption">{{ file.fileName }}</span>
            </template>
          </template>
          <template v-else-if="file.isVideo()">
            <template v-if="file.youtubeId">
              <img
                class="gallery-tile-media"
                :src="youtubeThumbUrl(file.youtubeId)"
                :alt="file.fileName"
                loading="lazy"
              />
              <span class="gallery-tile-play" aria-hidden="true"><i class="bi bi-play-fill"></i></span>
            </template>
            <template v-else>
              <div class="gallery-tile-video-placeholder">
                <i class="bi bi-film"></i>
              </div>
            </template>
            <a
              v-if="showDownloadFor(file)"
              :href="getSourceLink(file)"
              class="gallery-tile-download"
              :download="downloadFilename(file)"
              title="ダウンロード"
              aria-label="ダウンロード"
              @click.stop
            ><i class="bi bi-download"></i></a>
          </template>
          <template v-else>
            <img class="gallery-tile-media" :src="thumbUrl(file)" :alt="file.fileName" loading="lazy" />
            <a
              v-if="showDownloadFor(file)"
              :href="getSourceLink(file)"
              class="gallery-tile-download"
              :download="downloadFilename(file)"
              title="ダウンロード"
              aria-label="ダウンロード"
              @click.stop
            ><i class="bi bi-download"></i></a>
            <button
              v-if="file.passwordRequired"
              type="button"
              class="gallery-tile-lock"
              @click.stop="unlockFile(file.id)"
            ><i class="bi bi-key"></i></button>
          </template>
        </div>
      </div>

      <div
        v-if="uiLoading"
        class="gallery-fetch-overlay"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div class="gallery-fetch-overlay-inner">
          <div class="gallery-fetch-spinners">
            <div class="spinner-border spinner-border-sm text-light"></div>
            <div class="spinner-grow spinner-grow-sm text-light gallery-fetch-pulse"></div>
          </div>
          <span class="gallery-fetch-text">読み込み中…</span>
        </div>
      </div>

      <div
        v-if="showAlbumProgress"
        class="gallery-progress-chip"
        :class="{
          'gallery-progress-chip--more': hasMorePages,
          'gallery-progress-chip--with-loader': uiLoading
        }"
      >
        <span class="gallery-progress-chip-count">{{ loadedVisibleCount }} / {{ albumTotalCount }}</span>
        <span class="gallery-progress-chip-hint">{{
          hasMorePages ? '下にスクロールで続きを表示' : 'すべて表示しました'
        }}</span>
      </div>
      <div
        v-else-if="showLooseCountChip"
        class="gallery-progress-chip gallery-progress-chip--single"
        :class="{ 'gallery-progress-chip--with-loader': uiLoading }"
      >
        <span class="gallery-progress-chip-count">{{ looseCountLabel }} · {{ loadedVisibleCount }} 件</span>
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
            <div class="modal-body gallery-photo-modal-body d-flex align-items-center justify-content-center" @click="onModalBodyClick">
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
              <div class="gallery-photo-actions">
                <a
                  v-if="showDownloadFor(selectedFile)"
                  :href="getSourceLink(selectedFile)"
                  class="download-link"
                  :download="downloadFilename(selectedFile)"
                >
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
