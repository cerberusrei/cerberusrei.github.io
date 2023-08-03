const CACHE_DEBUG_MODE = "debugMode";
const SHARE_ICON_ID_PREFIX = 'share-icon-';
const SHARE_BUTTON_ID_PREFIX = 'share-button-';

let currentPaths = []; // [root, sub1, sub2, ...]
let nextPageToken = ""; // token for loading next page
let isNoMoreData = false; // true when reach end of the file list
let pageSize = 20;
let loading = false;
let currentFileInfo;
let fileMeta = {};
let fileListContainer = null;

let queryParams = new URLSearchParams(window.location.search);
let mgmtModeEnabled= queryParams.get('mgmtModeEnabled') === 'true';
let gaDisabled= queryParams.get('gaDisabled') === 'true';

// for testing
let autoFocusEnabled= queryParams.get('autoFocusEnabled') === 'true';

function initUi() {
    $('#debugMode').prop(
        'checked',
        localStorage.getItem(CACHE_DEBUG_MODE) === 'true'
    );

    // register listener to load more images when scrolling to bottom
    $(document.body).on('touchmove', onScroll); // for mobile
    $(window).on('scroll', onScroll);

    // prevent modal dialog to be closed after functional button is clicked
    $(".fixed-bottom button").click(function (event) {
        event.stopPropagation();
    });

    // initialize for bootstrap popover components
    initFileInfoPopovers();

    $(function () {
        $('.help-info').popover({
            container: 'body',
            html: true
        })
    });

    initMenu();

    fileListContainer = $('#fileListContainer');

    // load content of a album randomly
    switchPath(ALBUM_LIST[Math.floor(Math.random() * ALBUM_LIST.length)].id);
}

function initFileInfoPopovers() {
    new bootstrap.Popover('.file-info-btn', {
        container: 'body',
        html: true,
        content: function() {
            let info = JSON.parse(atob(currentFileInfo));
            let mediaInfo = info['imageMediaMetadata'];
            if (!mediaInfo) {
                return ''; // ignore file without media info
            }

            let html = '';
            for (let key in IMAGE_MEDIA_FIELDS) {
                if (IMAGE_MEDIA_FIELDS[key].hidden) {
                    continue; // ignore hidden information
                }
                if (!(key in mediaInfo) || mediaInfo[key] === null) {
                    continue; // ignore null value
                }

                let fieldName = key.replace(/([A-Z])/g, " $1");
                fieldName = fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
                html += '<div class="row">'
                    + '<div class="col-6">' + fieldName + '</div>'
                    + '<div class="col">' + mediaInfo[key] + '</div>'
                    + '</div>';
            }

            if (info.focusInfo) {
                html += `<div class="row">
              <div class="col-6">Focus Info</div>
              <div class="col">${JSON.stringify(info.focusInfo, null, 2)}</div>
            </div>`;
            }

            return '<div class="container">' + html + '</div>';
        }
    });
}

function initMenu() {
    let menu = $('.album-menu .dropdown-menu');

    ALBUM_LIST.forEach(album => {
        let menuItem =
            `
        <li>
          <a class="dropdown-item album-menu" href="#"
            onclick="onFolderChanged('${album.id}');switchPath('${album.id}')">
            ${album.name}
          </a>
        </li>
        `
        menu.html(menu.html() + menuItem);
    });
}

async function onScroll() {
    if ($(window).scrollTop() + window.innerHeight >= document.body.scrollHeight - 50) {
        // if ($(window).scrollTop() + $(window).height() == $(document).height()) {
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
            currentPaths.length = pathIndex;
        } else {
            // change to another root path
            currentPaths.length = 0; // clear paths
            currentPaths.push({ id: id, name: await getAlbumName(id) });
        }
    }

    // update breadcrumb
    $('.breadcrumb').html(''); // clear content
    currentPaths.forEach(
        (path, index) =>
            addBreadcrumbContent(path, index === currentPaths.length - 1, index === 0)
    );

    $(".source-link").attr("link", getSharedLink(id)); // change shared link

    // reload from new album
    $('#fileListContainer').html('');
    nextPageToken = "";
    isNoMoreData = false;

    await listFiles(true); // list folders first

    if (currentPaths.length === 1) {
        // load meta when switching to root directory
        let googleFileInfo = await getGoogleFileInfo(currentPaths[0].id);
        loadMeta(googleFileInfo.name)
            .then(function(meta) {
                fileMeta = meta;
                listFiles(false);
            });
    } else {
        listFiles(false); // list files, meta should be already loaded
    }
}

function addBreadcrumbContent(path, isActive, isRootPath) {
    // generate shared link for drive
    let driveLink = '';
    if (isRootPath && mgmtModeEnabled) {
        driveLink =
            `
          <a class="source-link" href="${getSharedLink(path.id)}" target="_blank">
          [<i class="bi bi-link-45deg"></i>元画像]</a>
        `;
    }

    let onclickHandler = isActive ? '' : `switchPath('${path.id}')`;

    // update breadcrumb
    let breadcrumb = $('.breadcrumb');
    breadcrumb.html(
        breadcrumb.html() +
        `
        <li class="breadcrumb-item ${isActive ? 'active' : ''}" aria-current="page"
            onclick="${onclickHandler}">
          ${driveLink}
          <span class="d-inline-block align-middle  text-truncate" style="max-width: 300px;">
            ${path.name}
          </span>
        </li>
        `
    );
}

async function listFiles(forFolder) {
    if (loading) {
        return; // ignore
    }

    hideError();
    hideInfo();
    setLoading();

    try {
        let files = await getFileList(forFolder);

        if (files.length === 0) {
            showInfo('No more data to load');
            return;
        }

        let container = $('#fileListContainer');
        files
            .filter((file) => !file.isUnsupportedFile())
            .forEach((file) => container.append(toFileCellHtml(file)));
    } catch (err) {
        handleError(err);
    } finally {
        finishLoading();
    }
}

async function getFileList(forFolder) {
    if (isNoMoreData) {
        return [];
    }

    // let criteria = " and createdTime > '2022-08-01T12:00:00' and mimeType = 'application/vnd.google-apps.folder'";
    let criteria = "and trashed=false and mimeType "
        + (forFolder ? "=" : "!=")
        + " 'application/vnd.google-apps.folder'";

    if (mgmtModeEnabled !== true) {
        //criteria += " and properties has { key='visible' and value='true'}";
    }

    // default fields: id, name, and mimeType
    let response = await gapi.client.drive.files.list({
        q: `'${getCurrentPath().id}' in parents ${criteria}`, // link ID
        fields: `nextPageToken, files(${FILE_FIELDS_CRITERIA})`,
        pageSize: forFolder ? 1000 : pageSize,
        orderBy: "name",
        pageToken: nextPageToken || "",
    });

    debugAlert(response);

    // folders are listed at once, so we don't keep the page token and avoid to impact pagination of files
    if (!forFolder) {
        nextPageToken = response.result.nextPageToken;
        if (!nextPageToken) {
            isNoMoreData = true; // all files are loaded
        }
    }

    return response.result.files.map((file) => buildFile(file));
}

function buildFile(googleDriveFile) {
    let file = $.extend(googleDriveFile, {
        // see: https://developers.google.com/drive/api/guides/mime-types
        isImage: function() {
            return this.mimeType.includes("image") || this.mimeType.includes("photo");
        },
        isVideo: function() {
            return this.mimeType.includes("video");
        },
        isFolder: function() {
            return this.mimeType.includes("folder");
        },
        isUnsupportedFile: function() {
            // avoid displaying system files
            return file.name.startsWith(".") || file.name.endsWith(".ini");
        },
        isShared: isSharedToEveryone(googleDriveFile),
        getExifTime: function() {
            return this.imageMediaMetadata ? this.imageMediaMetadata.time : "";
        },
        toText: function() {
            return btoa(JSON.stringify(this));
        }
    });

    if (file.isImage()) {
        let meta = fileMeta[file.name];
        if (meta) {
            file.focusInfo = meta.focus;
        }
    }

    return file;
}

function getThumbnailFocusPortion(file) {
    if (!autoFocusEnabled) {
        return; // return null to skip the process since the feature is disabled
    }

    let meta = fileMeta[file.name];
    if (!meta) {
        return null;
    }

    switch (file.imageMediaMetadata.focalLength) {
        case 70:
            return get70mmFocusPortion(file, meta);
        default:
            return null; // not supported
    }
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
                <i class="bi bi-file-earmark"></i>${file.name}
              </figure>`;
}

function toImageFileCellHtml(file) {
    let focusPortion = getThumbnailFocusPortion(file);
    let thumbnailWidth = focusPortion ? 512 : null;
    let thumbnailLink = getPreviewImageLink(file.id, thumbnailWidth);
    let imageStyle = "margin-bottom: 0;"; // override the value in .figure-img to avoid space in bottom
    let divSizeStyle;

    if (focusPortion) {
        let imageWidth = thumbnailWidth; // set width of thumbnail as default image width
        let actualPortionWidth = Math.floor(
            focusPortion.portionWidth * imageWidth / focusPortion.imageWidth
        );
        if (actualPortionWidth < fileListContainer.innerWidth()) {
            imageWidth *= fileListContainer.innerWidth() / actualPortionWidth;
        }

        let offsets = focusPortion.getOffsets(imageWidth);
        let offsetsStr = `${offsets.top}px ${offsets.right}px ${offsets.bottom}px ${offsets.left}px`;
        imageStyle += `position: relative;
        width: ${imageWidth}px; left: -${offsets.left}px; top: -${offsets.top}px;
        -webkit-clip-path: inset(${offsetsStr}); clip-path: inset(${offsetsStr});`;

        let divWidth = focusPortion.portionWidth;
        if (divWidth > fileListContainer.innerWidth()) {
            divWidth = fileListContainer.innerWidth();
        }

        let ratio = divWidth / focusPortion.portionWidth;
        let divHeight = Math.floor(focusPortion.portionHeight * ratio);
        divSizeStyle += `max-width: 100%; overflow: hidden; margin-top: 5px; 
                            width: ${divWidth}px; height: ${divHeight}px;`;
    } else {
        divSizeStyle = "width: fit-content; overflow: hidden; margin-top: 5px;";
    }

    let sharingOption = buildSharingOption(file);
    return `<figure class="figure">
                <div class="container" style="position: relative;  ${divSizeStyle}">
                    <div class="card" style="width: 18rem;">
                        <img src="${thumbnailLink}" class="figure-img img-fluid rounded" alt="${file.name}"
                              style="${imageStyle}"
                              data-bs-toggle="modal" data-bs-target="#photoFrame"
                              onclick="showPhoto('${file.id}', '${file.toText()}')"/>
                        ${sharingOption}
                    </div>
                </div>
                  <figcaption class="figure-caption text-end"><!-- nothing to display --></figcaption>
              </figure>`;
}

function toVideoFileCellHtml(file) {
    let thumbnailLink = getPreviewImageLink(file.id);
    let sharingOption = buildSharingOption(file);

    return `<figure class="figure">
                  <div class="container" style="position: relative">
                      <div class="card" style="width: 18rem;">
                          <img src="${thumbnailLink}"
                               class="figure-img img-fluid rounded"
                               style="margin-bottom: 0"
                               alt="thumbnail" />

                          <div class="d-flex align-items-center justify-content-center"
                              style="position: absolute; top: 0; bottom: 0; left: 0; right: 0;">
                              <button class="btn btn-dark"
                                onclick="onVideoView(${file.id}); window.open('${file.webViewLink}')">
                                <i class="bi bi-play-circle-fill" style="font-size: 2em;"></i>
                              </button>
                          </div>
                          ${sharingOption}
                      </div>
                  </div>
                  <figcaption class="figure-caption text-end"><!-- nothing to display --></figcaption>
              </figure>`;
}

function toFolderCellHtml(file) {
    let sharingOption = buildSharingOption(file);
    return `<figure class="figure">
                  <div class="container" style="position: relative">
                      <div class="card img-fluid align-middle align-items-center" style="width: 18rem;">
                          <button class="btn btn-light btn-lg transparent-button"
                                  onclick="onFolderChanged('${file.id}');switchPath('${file.id}', true)">
                              <img src="https://cdn-icons-png.flaticon.com/512/7757/7757558.png"
                                   class="card-img-top" alt="${file.name}"
                                   style="max-width: 50%"/>
                          </button>
                          <div class="card-body">
                              <p class="card-text">${sharingOption}${file.name}</p>
                          </div>
                      </div>
                  </div>
                  <figcaption class="figure-caption text-end"><!-- nothing to display --></figcaption>
              </figure>`;
}

function buildSharingOption(file) {
    if (!mgmtModeEnabled) {
        return ""; // do not display sharing options
    }

    let sharingIcon = createSharingIconHtml(file);

    return `<div class="d-flex align-items-center justify-content-center"
                style="position: absolute; bottom: 0px; right: 0px;">
                <button id="${SHARE_BUTTON_ID_PREFIX}${file.id}"
                        class="btn btn-danger transparent-button"
                        onClick="switchSharingMode('${file.id}', ${file.isShared})">
                    ${sharingIcon}
                </button>
            </div>`
}

function showPhoto(id, fileInfo) {
    onImageView(id);

    let previewImage = $('#photoFrame .modal-body .preview-image');
    previewImage.show();

    let sourceImage = $('#photoFrame .modal-body .source-image');
    sourceImage.hide();
    $('#photoFrame .modal-body .source-image-spinner').show();

    previewImage.attr("src", getPreviewImageLink(id));
    sourceImage.attr("src", getSourceImageLink(id));

    $('#photoFrame .modal-body .download-link')
        .attr("href", `https://drive.google.com/uc?export=download&id=${id}`);
    currentFileInfo = fileInfo;
}

function createSharingIconHtml(file) {
    let iconId = getSharingIconId(file.id, file.isShared);
    return `<i id='${SHARE_ICON_ID_PREFIX}${file.id}' class="bi ${iconId}"></i>`;
}

function getSharingIconId(fileId, isShared) {
    if (isShared === true) {
        return 'bi-unlock';
    }

    if (isShared === false) {
        return 'bi-lock-fill';
    }

    return 'bi-question-diamond';
}

// TODO: file object is inconsistent since it is not bound with UI
async function switchSharingMode(fileId, isShared) {
    let icon = $(`#${SHARE_ICON_ID_PREFIX}${fileId}`);
    if (icon.hasClass('bi-question-diamond')) {
        return; // ignore since we are not sure what is the current status
    }

    isShared = icon.hasClass('bi-unlock');

    if (isShared) {
        await unshare(fileId);
    } else {
        await share(fileId);
    }

    icon.removeClass();
    icon.addClass('bi');
    icon.addClass(getSharingIconId(fileId, !isShared));

    // the part of re-binding onclick handler is not working, use workaround for now
    // if (isShared === undefined || isShared == null) {
    //     return; // ignore since we are not sure what is the current status
    // }
    //
    // if (isShared === true) {
    //     await unshare(fileId);
    // } else {
    //     await share(fileId);
    // }

    // change icon
    // let icon = $(`#${SHARE_ICON_ID_PREFIX}${fileId}`);
    // icon.removeClass();
    // icon.addClass('bi');
    // icon.addClass(getSharingIconId(fileId, !isShared));

    // re-register onclick event
    // let button = $(`#${SHARE_BUTTON_ID_PREFIX}${fileId}`);
    // button.removeAttr('onclick');
    // button.unbind('click')
    // button.click(function () {
    //     switchSharingMode(fileId, !isShared);
    // });
}

function onSourceImageLoaded() {
    $('#photoFrame .modal-body .preview-image').hide();
    $('#photoFrame .modal-body .source-image-spinner').hide();
    $('#photoFrame .modal-body .source-image').show();
}

function dismissPhoto() {
    $("#photoFrame").modal('hide');
}

/**
 * Update visibility of the file by adding/removing custom properties.
 *
 * @see https://developers.google.com/drive/api/guides/properties
 */
function setVisibility(fileId, visible) {
    setCustomProperties(fileId, 'visible', visible);
}

function setLoading() {
    loading = true;
    $('.spinner-border').show();
}

function finishLoading() {
    loading = false;
    $('.spinner-border').hide();
}

function handleError(err) {
    try {
        showError(JSON.stringify(err) + "<br/>");
    } catch (err) {
        showError(err.message);
    }
}

function showInfo(message) {
    $('#info').html(message).show();
}

function hideInfo() {
    $('#info').hide();
}

function showError(message) {
    $('#error').html(message).show();
}

function hideError() {
    $('#error').hide();
}

function debugAlert(message) {
    if (!isDebugModeEnabled()) {
        return; // debug mode is disabled
    }

    try {
        alert(typeof message === "string" ? message : JSON.stringify(message));
    } catch (err) {
        alert("Not able to parse message: " + message);
    }
}

function storeDebugMode() {
    localStorage.setItem(CACHE_DEBUG_MODE, isDebugModeEnabled());
}

function isDebugModeEnabled() {
    return $('#debugMode').is(':checked');
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