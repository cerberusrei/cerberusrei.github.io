const FILE_API_URI= 'https://cerberusrei.clear-net.jp/public/file-api.php';
const CACHE_INFO_READ = "infoRead";
const INFO_VERSION = '4';
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

let gaDisabled= queryParams.get('gaDisabled') === 'true' || navigator.userAgent.includes("Googlebot");
console.log(`gaDisabled=${gaDisabled}`);

let initFileId= getFileIdFromUrl();
let customAlbumConfig= getCustomAlbumConfigFromUrl();

function initUi() {
    // register listener to load more images when scrolling to bottom
    $(document.body).on('touchmove', onScroll); // for mobile
    $(window).on('scroll', onScroll);

    // prevent modal dialog to be closed after functional button is clicked
    $(".fixed-bottom button").click(function (event) {
        event.stopPropagation();
    });

    showInfoDialog();

    $('#infoFrame').on('hidden.bs.modal', function () {
        localStorage.setItem(CACHE_INFO_READ, INFO_VERSION);
    });

    new AlbumListController(ALBUM_LIST);

    // load content of an album randomly
    // let randomAlbums = ALBUM_LIST.filter(album => album.version === 2);
    if (initFileId) {
        // load content of an album randomly
        // let randomAlbums = ALBUM_LIST.filter(album => album.version === 2);
        // switchPath(initFileId || randomAlbums[Math.floor(Math.random() * randomAlbums.length)].id);
        switchPath(initFileId)
            //.then(() => updateSeoInfo());
            .catch((error) => {
                console.log(error);
                listUpdatedRecently();
            });
    } else if (customAlbumConfig) {
        loadCustomAlbumList();
        finishLoading(); // TODO: not centralized control...
    } else {
        listUpdatedRecently();
    }

    let headerHeight = $('.header').height();
    $('#fileListContainer').css('margin', `${headerHeight + 10}px 0px`);
}

async function onScroll() {
    if (!getCurrentPath()) {
        return; // User have not yet choose any album
    }

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
    return new Promise(async (resolve, reject) => {
        try {
            if (toSubFolder) {
                let info = await getAlbumInfo(id);
                currentPaths.push({id: id, name: info.fileName});
            } else {
                let pathIndex = currentPaths.findIndex(path => path.id === id);

                if (pathIndex > 0) {
                    // change to another path in the same root path
                    currentPaths.length = pathIndex + 1;
                } else {
                    // change to another root path
                    currentPaths.length = 0; // clear paths

                    let info = await getAlbumInfo(id, true);
                    if (info.parent) {
                        let albumListInfo = ALBUM_LIST.find(album => album.id === info.parent.id);
                        currentPaths.push({
                            id: info.parent.id,
                            name: albumListInfo ? albumListInfo.name : info.parent.fileName
                        });
                    }

                    currentPaths.push({id: id, name: info.fileName});
                }
            }
            resolve(); // Resolve the promise

            // update breadcrumb
            $('.breadcrumb').html(''); // clear content
            currentPaths.forEach(
                (path, index) => {
                    addBreadcrumbContent(
                        path,
                        index === currentPaths.length - 1,
                        index === 0
                    );
                }
            );

            // reload from new album
            $('#fileListContainer').html('');
            filePage = null;

            listFiles(); // list folders first
        } catch (error) {
            handleError(error);
            reject(error); // Reject with the error
        }
    });
}

async function getAlbumInfo(id, includeParentInfo = false) {
    let album = ALBUM_LIST.find(album => album.id === id);
    if (album) {
        return {id: album.id, fileName: album.name};
    }

    // get info for the case when going to sub-folder
    return await getFileInfo(id, includeParentInfo);
}

async function getFileInfo(fileId, includeParentInfo = false) {
    const response = await fetchData(
        'info',
        `fileId=${fileId}&includeParent=${includeParentInfo}`
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
        const currentURL = this.getNormalizedUrl(path.id);

        shareBtn = `<i class="bi bi-share-fill"
                        onclick="prompt('Share link:', '${currentURL.toString()}')">
                    </i>`;
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
    if (!getCurrentPath()) {
        return; // User have not yet choose any album
    }

    // we don't mark and set loading here because loading will be started from different actions
    // 1: when user scroll screen, 2: when loading by click event or initialization
    // in case 1, scroll may trigger multiple calls to this method, so we need to set loading flag at the beginning
    if (!loadingLock.isLocked()) {
        setLoading();
    }

    try {
        let files = await getFileList();
        renderFiles(files);
    } catch (err) {
        handleError(err);
    } finally {
        finishLoading();
    }
}

async function getFileList() {
    if (filePage && filePage.pageNumber >= Math.ceil(filePage.totalCount / filePage.pageSize)) {
        showToast("No more records", 500);
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

async function loadCustomAlbumList() {
    const jsonData = await fetch(customAlbumConfig)
        .then(response => {
            return response.json()
        });

    const dataList = jsonData
        .map((file) => {
            file.type = 2;
            file.categories = 1;
            file.organized = true;
            return file;
        })
        .map((file) => buildFile(file));

    renderFiles(dataList);
}

async function listUpdatedRecently() {
    if (!loadingLock.isLocked()) {
        setLoading();
    }

    try {
        let response = await fetchData('updatedRecently')
            .then(response => {
                return response.json()
            });

        renderFiles(
            response.records.map((file) => buildFile(file)),

        );
    } catch (err) {
        handleError(err);
    } finally {
        finishLoading();
    }
}

async function fetchFileListPage(request) {
    return await fetchData(
        'page',
        `fileId=${request.fileId}&page=${request.page}&pageSize=${request.pageSize}`
    ).then(response => {
        return response.json()
    });
}

function renderFiles(files) {
    if (files.length === 0) {
        return;
    }

    let container = $('#fileListContainer');
    files
        .filter((file) => !file.isUnsupportedFile())
        .filter((file) => file.fileName !== postProductionFolderName)
        .forEach((file) => container.append(toFileCellHtml(file)));
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
    let passwordButton = toPasswordButton(file);
    let cardWidth = getImageCardWidth();

    return `<figure id="figure-${file.id}" class="figure">
                <div class="container" style="position: relative; ${divSizeStyle}">
                    <div class="card" style="${cardWidth}">
                        <img id="img-${file.id}" src="${thumbnailLink}"
                            class="figure-img img-fluid rounded" alt="${file.fileName}"
                            style="${imageStyle}"
                            data-bs-toggle="modal" data-bs-target="#photoFrame"
                            onclick="showPhoto('${file.id}', '${file.toText()}')"/>
                        ${downloadButton}
                        ${passwordButton}
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
    if (file.passwordRequired) {
        return toImageFileCellHtml(file);
    }

    let downloadButton = toSourceFileDownloadButton(file);
    let contentHtml = file.youtubeId ?
        `<div class="embed-responsive embed-responsive-16by9">
            <iframe class="embed-responsive-item"
                    src="https://www.youtube.com/embed/${file.youtubeId}"
                    style="max-width: 100%; max-height: 100%;"
                    allowFullScreen>
            </iframe>
            ${downloadButton}
        </div>`
        : `<div class="card" style="width: 18rem;">
               <i class="bi bi-film fs-1">${file.fileName}</i>
               ${downloadButton}
           </div>`;

    return `<figure id="figure-${file.id}" class="figure">
                  <div class="container" style="position: relative">
                      ${contentHtml}
                  </div>
                  <figcaption class="figure-caption text-end"><!-- nothing to display --></figcaption>
              </figure>`;
}

function toFolderCellHtml(file) {
    const thumbnail = getPreviewImageLink(file);
    const organizedStyle = file.organized ? '' : 'organized-album';

    const yosakoiBadge = toCategoryBadgeHtml(file, 1, 'よさこい', '#d2691e');
    const soranBadge = toCategoryBadgeHtml(file, 2, 'ソーラン', '#0dcaf0');
    const awaodoriBadge = toCategoryBadgeHtml(file, 4, '阿波踊り', '#d20df0');
    const categoryBadges =
        `<div class="position-absolute top-0 start-0" style="font-size: x-small;">
            ${yosakoiBadge}${soranBadge}${awaodoriBadge}
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
    let display = file.passwordRequired ? "none" : "block";
    let dFlex = file.passwordRequired ? "" : "d-flex"; // need to remove this class, or display will be always "block"

    return `<div class="${dFlex} align-items-center justify-content-center"
                style="position: absolute; bottom: 0; right: 0; display: ${display}">
                <a href="${sourceFileLink}"
                    class="download-link" download="${file.id}">
                    <button class="btn btn-light btn-lg transparent-button">
                        <i class="bi bi-download"></i>
                    </button>
                </a>
            </div>`
}

function toPasswordButton(file) {
    if (!file.passwordRequired) {
        return "";
    }

    return `<div class="d-flex align-items-center justify-content-center"
                style="position: absolute; bottom: 0; right: 0;">
                <button class="btn btn-light btn-lg transparent-button"
                    onclick="getProtectedContent('${file.id}')">
                    <i class="bi bi-key"></i>
                </button>
            </div>`
}

async function getProtectedContent(fileId) {
    const password = prompt("パスワードを入力してください");
    if (!password) {
        return;
    }

    try {
        const response = await fetch(`${FILE_API_URI}?request=protectedInfo&fileId=${fileId}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            credentials: 'include',
            body: JSON.stringify({"password": password})
        });

        if (!response.ok) {
            const errorData = await response.json();
            alert(errorData.message || 'Unknown error');
            return;
        }

        const file = buildFile(await response.json());
        $(`#figure-${fileId}`).replaceWith(
            file.isVideo() ? toVideoFileCellHtml(file) : toImageFileCellHtml(file)
        );
    } catch (err) {
        if (err.status === 403) {
            alert("間違っています");
        } else {
            alert(`Failed: ${err.status} ${err.message}`);
        }
    }
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

    let fileName = id;
    if (fileInfo.captureTime) {
        fileName = fileInfo.captureTime.replace(/\D/g, '')
    }

    $('#photoFrame .modal-body .download-link')
        .attr("href", getSourceLink(fileInfo))
        .attr("download", `${fileName}.jpg`); // not work due to CORS issue
}

function getPreviewImageLink(file, width = 512) {
    if (file.passwordRequired) {
        return 'images/password-protected-file.png';
    }

    if (!file.thumbnail) {
        return 'https://cdn-icons-png.flaticon.com/512/7757/7757558.png';
    }

    //return `https://drive.google.com/uc?export=view&id=${file.thumbnail}`;
    return `https://drive.google.com/thumbnail?authuser=0&sz=w${width}&id=${file.thumbnail}`;
}

function getSourceLink(file) {
    return `${FILE_API_URI}?request=binary&fileId=${file.id}`;
}

function getFileIdFromUrl() {
    // This part is unnecessary after changed the URL pattern from query parameter style to path parameter style
    // const urlParams = new URLSearchParams(window.location.search);
    // let fileId = urlParams.get('fileId');
    // if (fileId) {
    //     return fileId;
    // }

    // Extract the fileId from the path (allow just /album/{fileId})
    const path = window.location.pathname;
    const pathSegments = path.split('/');

    // Ensure the path matches the expected format
    if (pathSegments.length >= 3 && pathSegments[1] === 'album') {
        return pathSegments[2] || null;
    }

    return null;
}

function getCustomAlbumConfigFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('customAlbums');
}

function getNormalizedUrl(fileId) {
    const currentHost = window.location.hostname;
    return `https://${currentHost}/album/${fileId}`;

    // This part is unnecessary after changed the URL pattern from query parameter style to path parameter style
    // const currentURL = new URL(window.location.href);
    //
    // // change path if the URL path is */album/{fileId}
    // const pathSegments = currentURL.pathname.split('/');
    // if (pathSegments.length >= 3 && pathSegments[1] === 'album') {
    //     currentURL.pathname = '/';
    // }
    //
    // if (currentURL.searchParams.has('fileId')) {
    //     currentURL.searchParams.delete('fileId');
    // }
    //
    // currentURL.searchParams.set('fileId', fileId);
    //
    // return currentURL.toString();
}

/**
 * Unused because we changed to update SEO info by firebase functions.
 */
function updateSeoInfo() {
    if (currentPaths.length === 0) {
        return;
    }

    let keywords = [];

    currentPaths.forEach(function (path) {
        // Remove the 8 digits and white space if they exist
        let name = path.name.replace(/^\d{8}\s/, '');
        keywords.push(name);
    });

    // Get album name, remove the 8 digits and white space if they exist
    let lastPathName = currentPaths[currentPaths.length - 1].name.replace(/^\d{8}\s/, '');


    // Update keywords
    let metaKeywords = keywords.join(', ');
    let keywordsTag = $(`meta[name="keywords"]`);
    keywordsTag.prop('content', metaKeywords + ', ' + keywordsTag.prop('content'));

    // Update description meta tag
    let jaDate = "";
    let enDate = "";
    let date = "";
    for (let i = currentPaths.length - 1; i >= 0; i--) {
        if (/^\d{8}\s/.test(currentPaths[i].name)) {
            let dateString = currentPaths[i].name.match(/^\d{8}/)[0];
            let year = dateString.substring(0, 4);
            let month = dateString.substring(4, 6);
            let day = dateString.substring(6, 8);
            date = `${year}/${month}/${day}`;
            jaDate = `の${year}年${month}月${day}日`;
            enDate = ` on ${date}`;
            break;
        }
    }

    let jaEvent = "";
    let enEvent = "";
    if (currentPaths.length > 1) {
        let eventName = currentPaths[currentPaths.length - 2].name;
        if (/^\d{8}\s/.test(eventName)) {
            eventName = eventName.substring(9);
        }
        jaEvent = eventName;
        enEvent = " at " + eventName;
    }

    // Update title
    $('title').text(`よさこい写真 - ${date} ${jaEvent} ${lastPathName}`);
    updateMetaDescription("ja", `${lastPathName}${jaDate}${jaEvent}の写真と動画`);
    updateMetaDescription("en", `Photos and videos of ${lastPathName}${enEvent}${enDate}`);

    // Update canonical
    $("link[rel='canonical']").attr("href", window.location.href);
}

function updateMetaDescription(lang, description) {
    let $tag = $(`meta[name="description"][lang="${lang}"]`);
    if ($tag.length) {
        $tag.prop('content', description);
    } else {
        $('head').append(`<meta name="description" lang="${lang}" content="${description}">`);
    }
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

function showToast(message, duration) {
    const alertDiv = $(`<div class="alert alert-light alert-dismissible fade show" role="alert">${message}</div>`);
    $('.toast-container').empty().append(alertDiv);

    setTimeout(
        () => {
            alertDiv.alert('close');
        },
        duration
    );
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

async function fetchData(requestType, queryParams) {
    let fullUri = `${FILE_API_URI}?request=${requestType}`;
    return queryParams
        ? fetch(`${fullUri}&${queryParams}`, {credentials: 'include'})
        : fetch(fullUri, {credentials: 'include'});
}

function showInfoDialog() {
    if (navigator.userAgent.includes("Googlebot")) {
        return;
    }

    $.get('/info.html?t=1716833088380', function (data) {
        $(function () {
            $('#infoFrame .modal-body').html(data);
            if (localStorage.getItem(CACHE_INFO_READ) !== INFO_VERSION) {
                $('#infoFrame').modal('show');
            }
        });
    });
}

