const CACHE_DEBUG_MODE = "debugMode";
const CACHE_INFO_READ = "infoRead";
const INFO_VERSION = '1';
const SHARE_ICON_ID_PREFIX = 'share-icon-';
const SHARE_BUTTON_ID_PREFIX = 'share-button-';
const postProductionFolderName = 'post-production';

let currentPaths = []; // [root, sub1, sub2, ...]
let paginationRequest = null; // current query criteria for pagination request
let isNoMoreData = false; // true when reach end of the file list
let pageSize = 20;
let loading = false;
let currentFileInfo;
let fileMeta = {};
let fileListContainer = null;

let queryParams = new URLSearchParams(window.location.search);
let mgmtModeEnabled= queryParams.get('mgmtModeEnabled') === 'true';
let gaDisabled= queryParams.get('gaDisabled') === 'true';
let initFileId= queryParams.get('fileId');

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

    $.get('./info.html', function (data) {
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

    initMenu();

    // load content of an album randomly
    let randomAlbums = ALBUM_LIST.filter(album => album.version !== 2);
    switchPath(initFileId || randomAlbums[Math.floor(Math.random() * randomAlbums.length)].id);

    if (mgmtModeEnabled) {
        $('#btnSwitchAccount').show();
    }

    let headerHeight = $('.header').height();
    $('#fileListContainer').css('margin', `${headerHeight + 10}px 0px`);
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
    let albumList = $('#albumListFrame .modal-body .container .row');

    ALBUM_LIST.forEach(album => {
        let coverImage = "";
        if (album.cover) {
            coverImage = `<img src="${album.cover}" class="card-img-top" alt="${album.name}">`;
        }

        let onclick = `onFolderChanged('${album.id}');switchPath('${album.id}');dismissAlbumList();`;
        if (album.version === 2) {
            onclick = `window.location.href = '${getV2Url(album.id)}'`;
        }

        let albumItem = `
            <div class="col-md-4">
              <div class="card mb-3">
                <a href="#"
                  onclick="${onclick}">
                  ${coverImage}
                  <div class="card-body">
                    <p class="card-title">${album.name}</p>
                    <p class="card-text"><!-- other information --></p>
                  </div>
                </a>
              </div>
            </div>
        `
        albumList.html(albumList.html() + albumItem);
    });
}

function getV2Url(fileId) {
    const queryString = window.location.search;
    const params = new URLSearchParams(queryString);
    const filteredParams = {};
    for (const [key, value] of params.entries()) {
        if (key !== "fileId") {
            filteredParams[key] = value;
        }
    }

    const subQueryStr = new URLSearchParams(filteredParams).toString()
    return `http://cerberusrei.clear-net.jp/public/viewer/index-v2.html?fileId=${fileId}&${subQueryStr}`;
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
            currentPaths.length = pathIndex + 1;
        } else {
            // change to another root path
            currentPaths.length = 0; // clear paths

            let rootPathInfo = null;
            if (mgmtModeEnabled) {
                rootPathInfo = await getGoogleFileInfo(id, 'permissions');
            }

            currentPaths.push({
                id: id,
                name: await getAlbumName(id),
                isShared: rootPathInfo ? isSharedToEveryone(rootPathInfo) : null
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

    $(".source-link").attr("link", getSharedLink(id)); // change shared link

    // reload from new album
    $('#fileListContainer').html('');
    paginationRequest = null;
    isNoMoreData = false;

    let postProductionFolder = await listFiles(true); // list folders first

    if (currentPaths.length === 1) {
        // TODO: auto-focus by loading meta is not used now
        // load meta when switching to root directory
        // let googleFileInfo = await getGoogleFileInfo(currentPaths[0].id);
        // loadMeta(googleFileInfo.name)
        //     .then(function(meta) {
        //         fileMeta = meta;
        //         listFiles(false);
        //     });
        listFiles(false, postProductionFolder);
    } else {
        listFiles(false, postProductionFolder); // list files, meta should be already loaded
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

    let displayName = path.name.length > 20 ? path.name.substring(0, 20) + '...' : path.name;
    let sharingButtonHtml = mgmtModeEnabled && isRootPath ? buildSharingButton(path) : "";

    let onclickHandler = isActive ? '' : `switchPath('${path.id}')`;

    // update breadcrumb
    let breadcrumb = $('.breadcrumb');
    breadcrumb.html(
        breadcrumb.html() +
        `
        <li class="breadcrumb-item ${isActive ? 'active' : ''}" aria-current="page"
            onclick="${onclickHandler}">
          ${driveLink}
          ${sharingButtonHtml}
          <span class="d-inline-block align-middle text-truncate" style="max-width: 300px;">
            <button class="btn btn-light" style="font-size: 0.8rem" title="${path.name}">${displayName}</button>
          </span>
        </li>
        `
    );
}

/**
 * Returns the Google file object of "post-production" folder if found.
 */
async function listFiles(forFolder, postProductionFolder) {
    if (loading) {
        return; // ignore
    }

    hideError();
    hideInfo();
    setLoading();

    try {
        let files = await getFileList(forFolder, postProductionFolder);

        if (files.length === 0) {
            showInfo('No more data to load');
            return;
        }

        let container = $('#fileListContainer');
        files
            .filter((file) => !file.isUnsupportedFile())
            .filter((file) => file.name !== postProductionFolderName)
            .forEach((file) => container.append(toFileCellHtml(file)));

        return (forFolder ? files.find((file) => file.name === postProductionFolderName) : null);
    } catch (err) {
        handleError(err);
    } finally {
        finishLoading();
    }
}

async function getFileList(forFolder, postProductionFolder) {
    if (isNoMoreData) {
        return [];
    }

    // TODO: workaround for pagination, need to refactor...
    let request = paginationRequest;
    if (!request) {
        // default fields: id, name, and mimeType
        request = {
            fileId: getCurrentPath().id,
            nextPageToken: "",
            postProductionFolder: postProductionFolder,
            toGoogleApiPayload: function () {
                // let criteria = " and createdTime > '2022-08-01T12:00:00' and mimeType = 'application/vnd.google-apps.folder'";
                let criteria = "and trashed=false and mimeType "
                    + (forFolder ? "=" : "!=")
                    + " 'application/vnd.google-apps.folder'";

                return {
                    q: `'${this.fileId}' in parents ${criteria}`, // link ID
                    fields: `nextPageToken, files(${FILE_FIELDS_CRITERIA})`,
                    pageSize: forFolder ? 1000 : pageSize,
                    orderBy: "name",
                    pageToken: this.nextPageToken
                }
            }
        };
    }

    let response = await gapi.client.drive.files.list(request.toGoogleApiPayload());
    debugAlert(response);
    let fileList = response.result.files.map((file) => buildFile(file));

    // folders are listed at once, so we don't keep the page token and avoid to impact pagination of files
    if (!forFolder) {
        paginationRequest = request;

        let nextPageToken = response.result.nextPageToken;
        if (nextPageToken) {
            paginationRequest.nextPageToken = nextPageToken;
        } else if (paginationRequest.postProductionFolder) {
            // files in root folder are all loaded, start loading from sub-folder
            paginationRequest.fileId = paginationRequest.postProductionFolder.id;
            paginationRequest.nextPageToken = "";
            paginationRequest.postProductionFolder = null;

            if (fileList.length < pageSize) {
                // TODO: should change page size
                fileList = fileList.concat(await getFileList(false, null));
            }
        } else {
            // all files are loaded
            isNoMoreData = true;
            paginationRequest = null;
        }
    }

    return fileList;
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
    let thumbnailWidth = 1024;
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
        divSizeStyle = `max-width: 100%; overflow: hidden; margin-top: 5px; 
                            width: ${divWidth}px; height: ${divHeight}px;`;
    } else {
        divSizeStyle = "width: fit-content; overflow: hidden; margin-top: 5px;";
    }

    let sharingOption = buildSharingOption(file);
    let downloadButton = `
        <div class="d-flex align-items-center justify-content-center"
            style="position: absolute; bottom: 0; right: 0;">
            <a href="https://drive.google.com/uc?export=download&id=${file.id}"
                class="download-link" download="${file.id}">
                <button class="btn btn-light btn-lg transparent-button">
                    <i class="bi bi-download"></i>
                </button>
            </a>
        </div>`;

    let cardWidth = getImageCardWidth();

    return `<figure class="figure">
                <div class="container" style="position: relative;  ${divSizeStyle}">
                    <div class="card" style="${cardWidth}">
                        <img id="img-${file.id}" src="${thumbnailLink}"
                            class="figure-img img-fluid rounded" alt="${file.name}"
                            style="${imageStyle}"
                            data-bs-toggle="modal" data-bs-target="#photoFrame"
                            onclick="showPhoto('${file.id}', '${file.toText()}')"/>
                        ${sharingOption}
                        ${downloadButton}
                    </div>
                </div>
                <figcaption class="figure-caption text-end">
                </figcaption>
              </figure>`;
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
                                onclick="onVideoView('${file.id}'); window.open('${file.webViewLink}')">
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

    let sharingButton = buildSharingButton(file);

    return `<div class="d-flex align-items-center justify-content-center"
                style="position: absolute; bottom: 0; right: 0;">
                ${sharingButton}
            </div>`
}

function buildSharingButton(file) {
    let sharingIcon = createSharingIconHtml(file);
    return `<button id="${SHARE_BUTTON_ID_PREFIX}${file.id}"
                        class="btn btn-danger transparent-button"
                        onClick="switchSharingMode('${file.id}', ${file.isShared})">
                    ${sharingIcon}
                </button>`;
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
        .attr("href", `https://drive.google.com/uc?export=download&id=${id}`)
        .attr("download", `${id}.jpg`); // not work due to CORS issue
    // $('#photoFrame .modal-body .download-button')
    //     .click(function() {
    //         let image = $(`#img-${id}`)[0];
    //         let canvas = document.createElement('canvas');
    //         canvas.width = image.naturalWidth;
    //         canvas.height = image.naturalHeight;
    //
    //         let context = canvas.getContext('2d');
    //         context.drawImage(image, 0, 0);
    //
    //         canvas.toBlob(function(blob) {
    //             let link = $('#photoFrame .modal-body .download-link');
    //             link.attr("href", URL.createObjectURL(blob))
    //                 .attr("download", `${id}.jpg`);
    //             link.click();
    //         });
    //         // $.ajax(
    //         //     {
    //         //         url: `https://drive.google.com/uc?export=download&id=${id}`,
    //         //         method: 'GET',
    //         //         xhrFields: {
    //         //             responseType: "blob"
    //         //         },
    //         //         success: function (data) {
    //         //             let link = $('#photoFrame .modal-body .download-link');
    //         //             link.attr("href", URL.createObjectURL(data))
    //         //                 .attr("download", `${id}.jpg`);
    //         //             link.click();
    //         //         }
    //         //     }
    //         // );
    //     });
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
        unshareChildren(fileId);
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

async function unshareChildren(fileId) {
    let fileInfo = await getGoogleFileInfo(fileId);
    if (!fileInfo.mimeType.includes("folder")) {
        return; // not a folder
    }

    let updatedCount = 0;
    let nextPageToken = "";

    do {
        let response = await gapi.client.drive.files.list({
            q: `'${fileId}' in parents and name!='post-production'`,
            fields: `nextPageToken, files(id,name)`,
            pageSize: 1000,
            orderBy: "name",
            pageToken: nextPageToken,
        });

        nextPageToken = response.result.nextPageToken;

        response.result.files.map((file) => {
            unshare(file.id);
            updatedCount++;
        })

        console.log("updated " + updatedCount + " children are updated to be unshared");
    } while (nextPageToken)

    alert(updatedCount + " files are changed to be unshared");
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