const CACHE_INFO_READ = "infoRead";
const INFO_VERSION = '2';
const postProductionFolderName = 'post-production';

let currentPaths = []; // [root, sub1, sub2, ...]
let filePage = null; // current pagination result
let loadingLock = {
    loading: false,
    releasedTime: null,
    isLocked() {
        return this.loading;
    },
    lock() {
        this.loading = true;
        this.releasedTime = null;
    },
    release() {
        this.loading = false;
        this.releasedTime = new Date();
    },
    wasLockedInSeconds(seconds) {
        return this.releasedTime && new Date().getTime() - this.releasedTime.getTime() <= seconds * 1000;
    }
};
let fileMeta = {};

let queryParams = new URLSearchParams(window.location.search);
let gaDisabled= queryParams.get('gaDisabled') === 'true';
let initFileId= queryParams.get('fileId');

function initUi() {
    // register listener to load more images when scrolling to bottom
    $(document.body).on('touchmove', onScroll); // for mobile
    $(window).on('scroll', onScroll);

    // prevent modal dialog to be closed after functional button is clicked
    $(".fixed-bottom button").click(function (event) {
        event.stopPropagation();
    });

    $.get('./info.html?t=1716833088380', function (data) {
        $(function () {
            $('#infoFrame .modal-body').html(data);
            if (localStorage.getItem(CACHE_INFO_READ) !== INFO_VERSION) {
                $('#infoFrame').modal('show');
            }
        });
    });

    $('#infoFrame').on('hidden.bs.modal', function () {
        localStorage.setItem(CACHE_INFO_READ, INFO_VERSION);
    });

    new AlbumListController(ALBUM_LIST);

    // load content of an album randomly
    let randomAlbums = ALBUM_LIST.filter(album => album.version === 2);
    switchPath(initFileId || randomAlbums[Math.floor(Math.random() * randomAlbums.length)].id);

    let headerHeight = $('.header').height();
    $('#fileListContainer').css('margin', `${headerHeight + 10}px 0px`);
}

async function onScroll() {
    if (!loadingLock.isLocked()
        // the scroll event will be triggered multiple time when scrolling
        // the events are queued to be handled one by one
        // semaphore is not usable to avoid multiple API calls in one scroll behavior
        // so, we need to ignore scroll events in N milliseconds
        && !loadingLock.wasLockedInSeconds(0.2)
        && $(window).scrollTop() + window.innerHeight >= document.body.scrollHeight - 50) {
        // if ($(window).scrollTop() + $(window).height() == $(document).height()) {
        setLoading();
        await listFiles();
    }
}

function getCurrentPath() {
    return currentPaths[currentPaths.length - 1];
}

async function switchPath(id, toSubFolder) {
    if (toSubFolder) {
        currentPaths.push({ id: id, name: await getAlbumName(id) });
    } else {
        let pathIndex = currentPaths.findIndex(path => path.id === id);

        if (pathIndex > 0) {
            // change to another path in the same root path
            currentPaths.length = pathIndex + 1;
        } else {
            // change to another root path
            currentPaths.length = 0; // clear paths

            currentPaths.push({
                id: id,
                name: await getAlbumName(id),
                isShared: null
            });
        }
    }

    // update breadcrumb
    $('.breadcrumb').html(''); // clear content
    currentPaths.forEach(
        (path, index) => {
            addBreadcrumbContent(path, index === currentPaths.length - 1, index === 0);
        }
    );

    // reload from new album
    $('#fileListContainer').html('');
    filePage = null;

    listFiles(); // list folders first
}

async function getAlbumName(id) {
    let album = ALBUM_LIST.find(album => album.id === id);
    if (album) {
        return album.name;
    }

    // get name for the case when going to sub-folder
    try {
        let info = await getFileInfo(id);
        return info.fileName;
    } catch (err) {
        handleError(err);
        return "unknown-folder-name";
    }
}

async function getFileInfo(fileId) {
    const response = await fetch(
        `../file-api.php?request=info&fileId=${fileId}`
    );
    return await response.json();
}

function addBreadcrumbContent(path, isActive, isRootPath) {
    let displayName = path.name.length > 20 ? path.name.substring(0, 20) + '...' : path.name;

    let onclickHandler = isActive ? '' : `switchPath('${path.id}')`;

    // update breadcrumb
    let breadcrumb = $('.breadcrumb');

    let shareBtn = '';
    if (isActive) {
        const currentURL = new URL(window.location.href);
        if (currentURL.searchParams.has('fileId')) {
            currentURL.searchParams.delete('fileId');
            currentURL.searchParams.set('fileId', path.id);
        }

        shareBtn = `<i class="bi bi-share-fill" onclick="prompt('Share link:', '${currentURL.toString()}')"></i>`;
    }

    breadcrumb.html(
        breadcrumb.html() +
        `
        <li class="breadcrumb-item ${isActive ? 'active' : ''}" aria-current="page"
            onclick="${onclickHandler}">
          <span class="d-inline-block align-middle text-truncate" style="max-width: 300px;">
            <button class="btn btn-light" style="font-size: 0.8rem" title="${path.name}">${displayName}</button>
          </span>
        </li>
        &nbsp;
        ${shareBtn}
        `
    );
}

/**
 * Returns the Google file object of "post-production" folder if found.
 */
async function listFiles() {
    // we don't mark and set loading here because loading will be started from different actions
    // 1: when user scroll screen, 2: when loading by click event or initialization
    // in case 1, scroll may trigger multiple calls to this method, so we need to set loading flag at the beginning
    if (!loadingLock.isLocked()) {
        setLoading();
    }

    try {
        let files = await getFileList();

        if (files.length === 0) {
            return;
        }

        let container = $('#fileListContainer');
        files
            .filter((file) => !file.isUnsupportedFile())
            .filter((file) => file.fileName !== postProductionFolderName)
            .forEach((file) => container.append(toFileCellHtml(file)));
    } catch (err) {
        handleError(err);
    } finally {
        finishLoading();
    }
}

async function getFileList() {
    if (filePage && filePage.pageNumber >= Math.ceil(filePage.totalCount / filePage.pageSize)) {
        return []; // already loaded files for last page
    }

    let request = {
        fileId: filePage ? filePage.fileId : getCurrentPath().id,
        page: filePage ? filePage.pageNumber + 1 : 1,
        pageSize : filePage ? filePage.pageSize : 10
    };

    let response = await this.fetchFileListPage(request);
    filePage = { ...response, fileId: request.fileId };

    return response.records.map((file) => buildFile(file));
}

async function fetchFileListPage(request) {
    return await fetch(
        `../file-api.php?request=page&fileId=${request.fileId}&page=${request.page}&pageSize=${request.pageSize}`
    ).then(response => {
        return response.json()
    });
}

function buildFile(fileInfo) {
    let ext = getFileExtension(fileInfo.fileName);
    let file = $.extend(fileInfo, {
        isImage: function() {
            if (ext == null) {
                return false;
            }

            return ext == "jpg" || ext == "jpeg" || ext == "png" || ext == "gif";
        },
        isVideo: function() {
            if (ext == null) {
                return false;
            }

            return ext == "mpg" || ext == "mpeg" || ext == "mp4" || ext == "mov";
        },
        isFolder: function() {
            return this.type == 2;
        },
        isUnsupportedFile: function() {
            // avoid displaying system files
            return file.fileName.startsWith(".") || file.fileName.endsWith(".ini");
        },
        toText: function() {
            return btoa(JSON.stringify(this));
        }
    });

    if (file.isImage()) {
        let meta = fileMeta[file.fileName];
        if (meta) {
            file.focusInfo = meta.focus;
        }
    }

    return file;
}

function toFileCellHtml(file) {
    if (file.isImage()) {
        return toImageFileCellHtml(file);
    }

    if (file.isVideo()) {
        return toVideoFileCellHtml(file);
    }

    if (file.isFolder()) {
        return toFolderCellHtml(file);
    }

    return `<figure class="figure default-thumbnail">
                <i class="bi bi-file-earmark"></i>${file.fileName}
              </figure>`;
}

function toImageFileCellHtml(file) {
    let thumbnailWidth = 1024;
    let thumbnailLink = getPreviewImageLink(file, thumbnailWidth);
    let sourceFileLink = getSourceLink(file);
    let imageStyle = "margin-bottom: 0;"; // override the value in .figure-img to avoid space in bottom
    let divSizeStyle = "width: fit-content; overflow: hidden; margin-top: 5px;";
    let downloadButton = toSourceFileDownloadButton(file);
    let cardWidth = getImageCardWidth();

    return `<figure class="figure">
                <div class="container" style="position: relative;  ${divSizeStyle}">
                    <div class="card" style="${cardWidth}">
                        <img id="img-${file.id}" src="${thumbnailLink}"
                            class="figure-img img-fluid rounded" alt="${file.fileName}"
                            style="${imageStyle}"
                            data-bs-toggle="modal" data-bs-target="#photoFrame"
                            onclick="showPhoto('${file.id}', '${file.toText()}')"/>
                        ${downloadButton}
                    </div>
                </div>
                <figcaption class="figure-caption text-end">
                </figcaption>
              </figure>`;
}

function getFileExtension(fileName) {
    let lastDotIndex = fileName.lastIndexOf(".");

    if (lastDotIndex !== -1 && lastDotIndex < fileName.length - 1) {
        return fileName.substring(lastDotIndex + 1).toLowerCase();
    } else {
        return null;
    }
}

function getImageCardWidth() {
    if (window.innerWidth <= 576) {
        return "width: 100%;"; // mobile
    } else if (window.innerWidth <= 992) {
        return "width: 18rem;"; // Tablet
    } else {
        return "width: 18rem;"; // Desktop
    }
}

function toVideoFileCellHtml(file) {
    let downloadButton = toSourceFileDownloadButton(file);

    return `<figure class="figure">
                  <div class="container" style="position: relative">
                      <div class="card" style="width: 18rem;">
                          <i class="bi bi-film fs-1"></i>
                          ${downloadButton}
                      </div>
                  </div>
                  <figcaption class="figure-caption text-end"><!-- nothing to display --></figcaption>
              </figure>`;
}

function toFolderCellHtml(file) {
    const thumbnail = getPreviewImageLink(file);
    const organizedStyle = file.organized ? '' : 'organized-album';

    const yosakoiBadge = toCategoryBadgeHtml(file, 1, 'よさこい', '#d2691e');
    const soranBadge = toCategoryBadgeHtml(file, 2, 'ソーラン', '#0dcaf0');
    const categoryBadges =
        `<div class="position-absolute top-0 start-0" style="font-size: x-small;">
            ${yosakoiBadge}${soranBadge}
        </div>`;

    return `<figure class="figure">
                  <div class="container" style="position: relative">
                      <div class="card img-fluid align-middle align-items-center ${organizedStyle}"
                        style="width: 18rem;">
                          <button class="btn btn-light btn-lg"
                                  onclick="onFolderChanged('${file.id}');switchPath('${file.id}', true)">
                              <img src="${thumbnail}" class="card-img-top" alt="${file.fileName}"/>
                              ${categoryBadges}
                          </button>
                          <div>${file.fileName}</div>
                      </div>
                  </div>
                  <figcaption class="figure-caption text-end"><!-- nothing to display --></figcaption>
              </figure>`;
}

function toSourceFileDownloadButton(file) {
    let sourceFileLink = getSourceLink(file);

    return `<div class="d-flex align-items-center justify-content-center"
                style="position: absolute; bottom: 0; right: 0;">
                <a href="${sourceFileLink}"
                    class="download-link" download="${file.id}">
                    <button class="btn btn-light btn-lg transparent-button">
                        <i class="bi bi-download"></i>
                    </button>
                </a>
            </div>`
}

function toCategoryBadgeHtml(file, category, text, bgColor) {
    if ((file.categories & category) === 0) {
        return "";
    }

    return `<span class="text-white p-1"
                    style="opacity: 0.4; border-radius: 0.2rem; background-color: ${bgColor}">
                ${text}
            </span> `;
}

function showPhoto(id, fileInfoStr) {
    onImageView(id);

    let previewImage = $('#photoFrame .modal-body .preview-image');
    previewImage.show();

    let sourceImage = $('#photoFrame .modal-body .source-image');
    sourceImage.hide();
    $('#photoFrame .modal-body .source-image-spinner').show();

    let fileInfo = JSON.parse(atob(fileInfoStr));
    previewImage.attr("src", getPreviewImageLink(fileInfo));
    sourceImage.attr("src", getSourceLink(fileInfo));

    $('#photoFrame .modal-body .download-link')
        .attr("href", getSourceLink(fileInfo))
        .attr("download", `${id}.jpg`); // not work due to CORS issue
}

function getPreviewImageLink(file, width = 512) {
    if (!file.thumbnail) {
        return 'https://cdn-icons-png.flaticon.com/512/7757/7757558.png';
    }
    return `https://drive.google.com/thumbnail?authuser=0&sz=w${width}&id=${file.thumbnail}`;
}

function getSourceLink(file) {
    return `../file-api.php?request=binary&fileId=${file.id}`;
}

function onSourceImageLoaded() {
    $('#photoFrame .modal-body .preview-image').hide();
    $('#photoFrame .modal-body .source-image-spinner').hide();
    $('#photoFrame .modal-body .source-image').show();
}

function dismissPhoto() {
    $("#photoFrame").modal('hide');
}

function dismissAlbumList() {
    $("#albumListFrame").modal('hide');
}

function setLoading() {
    loadingLock.lock();
    $('.spinner-border').show();
}

function finishLoading() {
    loadingLock.release();
    $('.spinner-border').hide();
}

function handleError(err) {
    console.error(err);
}

function onImageView(fileId) {
    onViewingGoogleDriveFile('image', fileId);
}

function onVideoView(fileId) {
    onViewingGoogleDriveFile('video', fileId);
}

function onFolderChanged(fileId) {
    onViewingGoogleDriveFile('folder', fileId);
}

function onViewingGoogleDriveFile(fileType, fileId) {
    if (gaDisabled) {
        return; // do nothing
    }
    AnalyticsUtil.trackEvent('view', fileType, fileId)
}