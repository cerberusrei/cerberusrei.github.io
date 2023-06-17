const CACHE_DEBUG_MODE = "debugMode";

let currentPaths = []; // [root, sub1, sub2, ...]
let nextPageToken = ""; // token for loading next page
let isNoMoreData = false; // true when reach end of the file list
let pageSize = 20;
let loading = false;
let currentFileInfo;
let fileMeta = {};
let fileListContainer = null;

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
            for (key in IMAGE_MEDIA_FIELDS) {
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
            onclick="switchPath('${album.id}')">
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
        (path, index) => addBreadcrumbContent(path, index === currentPaths.length - 1, index === 0)
    );

    $(".source-link").attr("link", getSharedLink(id)); // change shared link

    // reload from new album
    $('#fileListContainer').html('');
    nextPageToken = "";
    isNoMoreData = false;

    await listFiles(true); // list folders first

    if (currentPaths.length == 1) {
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

function addBreadcrumbContent(path, isActive, isDriveLinkRequired) {
    // generate shared link for drive
    let driveLink = '';
    if (isDriveLinkRequired) {
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
    let thumbnailWidth = focusPortion ? 1024 : null;
    let thumbnailLink = getPreviewImageLink(file.id, thumbnailWidth);
    let imageStyle = "width: 100%";
    let divSizeStyle = "max-width: 100%; overflow: hidden; margin-top: 5px;";

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
        imageStyle = `position: relative;
        width: ${imageWidth}px; left: -${offsets.left}px; top: -${offsets.top}px;
        -webkit-clip-path: inset(${offsetsStr}); clip-path: inset(${offsetsStr});`;

        let divWidth = focusPortion.portionWidth;
        if (divWidth > fileListContainer.innerWidth()) {
            divWidth = fileListContainer.innerWidth();
        }

        let ratio = divWidth / focusPortion.portionWidth;
        let divHeight = Math.floor(focusPortion.portionHeight * ratio);
        divSizeStyle += `width: ${divWidth}px; height: ${divHeight}px;`;
    }

    return `<div class="rounded" style="${divSizeStyle}">
                  <img src="${thumbnailLink}" class="" alt="${file.name}"
                          style="${imageStyle}"
                          data-bs-toggle="modal" data-bs-target="#photoFrame"
                          onclick="showPhoto('${file.id}', '${file.toText()}')"/>
              </div>`;
}

function toVideoFileCellHtml(file) {
    let thumbnailLink = getPreviewImageLink(file.id);
    return `<figure class="figure">
                  <div class="container" style="position: relative">
                    <img src="${thumbnailLink}" class="figure-img img-fluid rounded" alt="thumbnail" />

                    <div class="d-flex align-items-center justify-content-center"
                      style="position: absolute; top: 0; bottom: 0; left: 0; right: 0;">
                      <button class="btn btn-dark"
                        onclick="window.open('${file.webViewLink}')">
                        <i class="bi bi-play-circle-fill" style="font-size: 2em;"></i>
                      </button>
                    </div>
                  </div>
                  <figcaption class="figure-caption text-end"><!-- nothing to display --></figcaption>
              </figure>`;
}

function toFolderCellHtml(file) {
    return `<figure class="figure" style="width: 100%">
                  <button type="button"
                          class="btn btn-lg btn-secondary default-thumbnail"
                          style="width: 100%"
                          onclick="switchPath('${file.id}', true)">
                          <i class="bi bi-folder2">${file.name}</i>
                  </button>
              </figure>`;
}

function showPhoto(id, fileInfo) {
    let previewImage = $('#photoFrame .modal-body .preview-image');
    previewImage.show();

    let sourceImage = $('#photoFrame .modal-body .source-image');
    sourceImage.hide();
    $('#photoFrame .modal-body .source-image-spinner').show();

    previewImage.attr("src", getPreviewImageLink(id));
    sourceImage.attr("src", getSourceImageLink(id));

    $('#photoFrame .modal-body .download-link').attr("href", `https://drive.google.com/uc?export=download&id=${id}`);
    currentFileInfo = fileInfo;
}

function onSourceImageLoaded() {
    $('#photoFrame .modal-body .preview-image').hide();
    $('#photoFrame .modal-body .source-image-spinner').hide();
    $('#photoFrame .modal-body .source-image').show();
}

function dismissPhoto() {
    $("#photoFrame").modal('hide');
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