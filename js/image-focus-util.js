class FocusPortion {
    constructor(
        imageWidth,
        imageHeight,
        portionWidth,
        portionHeight,
        offsetTop,
        offsetRight,
        offsetBottom,
        offsetLeft
    ) {
        this.imageWidth = imageWidth;
        this.imageHeight = imageHeight;
        this.portionWidth = portionWidth;
        this.portionHeight = portionHeight;

        this.offsets = {
            top: offsetTop,
            right: offsetRight,
            bottom: offsetBottom,
            left: offsetLeft
        };
    }

    getOffsets(targetImageWidth) {
        let ratio = this.imageWidth / targetImageWidth;

        let offsets = $.extend({}, this.offsets);
        for (let key in offsets) {
            offsets[key] = Math.floor(offsets[key] / ratio);
        }
        return offsets;
    }
}

function get70mmFocusPortion(file, meta) {
    let focusDistance = meta.getFocusDistance();
    let imageWidth = file.imageMediaMetadata.width;
    let imageHeight = file.imageMediaMetadata.height;

    if (focusDistance >= 120) {
        return getFocusPortion(imageWidth, imageHeight, meta.focus.location, 4);
    } else if (focusDistance >= 70) {
        return getFocusPortion(imageWidth, imageHeight, meta.focus.location, 3);
    } else if (focusDistance >= 50) {
        return getFocusPortion(imageWidth, imageHeight, meta.focus.location, 2);
    } else if (focusDistance >= 20) {
        return getFocusPortion(imageWidth, imageHeight, meta.focus.location, 2);
    }
    return null; // focus portion is not useful
}

function getFocusPortion(imageWidth, imageHeight, focusPoint, denominator) {
    // -webkit-clip-path: inset(30px 10px 30px 10px);
    // clip-path: inset(30px 10px 30px 10px);
    // top right bottom left
    // let isLandscape = imageWidth > imageHeight;
    let portionWidth = Math.floor(imageWidth / denominator);
    let portionHeight = Math.floor(imageHeight / denominator);

    let top = focusPoint.y - Math.floor(portionHeight / 2);
    if (top < 0) {
        top = 0;
    }

    let left = focusPoint.x - Math.floor(portionWidth / 2);
    if (left < 0) {
        left = 0;
    }

    //  left   portion width  right
    // |-----|---------------|-----|
    let right = imageWidth - portionWidth - left;
    let bottom = imageHeight - portionHeight - top;
    return new FocusPortion(
        imageWidth, imageHeight,
        portionWidth, portionHeight,
        top, right, bottom, left,
    );
}

function loadMeta(name) {
    if (!name) {
        return {}; // ignore invalid input
    }

    let deffered = $.Deferred();

    $.get(
        `https://cerberusrei.github.io/resources/meta/${name}.csv`,
        function(data) {
            let meta = {};

            data.split("\n")
                .slice(1) // skip header
                .forEach(line => {
                    let parsed = parseMeta(line);
                    if (parsed) {
                        meta[parsed.fileName] = parsed.meta;
                    }
                });

            deffered.resolve(meta);
        }
    ).fail(function() {
        deffered.resolve({});
        console.log("Failed to get meta");
    });

    return deffered;
}

function parseMeta(line) {
    let values = line.split(",");
    if (!/\d+ {1}\d+ {1}\d+ {1}\d+/.test(values[1])) {
        return null; // not expected values like "7008 3944 3044 1963"
    }

    let fileName = values[0];
    let focusLocation = values[1].split(' ');

    return {
        fileName: fileName,
        meta: {
            focus: {
                location: {
                    x: focusLocation[2],
                    y: focusLocation[3]
                },
                distance: {
                    // Focus Distance 2 e.g. "125.6 m" or "inf"
                    value: values[2].split(' ')[0],
                    // Hyperfocus Distance e.g. "12.6 m"
                    hyper: values[3].split(' ')[0]
                }
            },
            getFocusDistance: function() {
                if (/^\d+(\.\d+)?$/.test(this.focus.distance.value)) {
                    return parseFloat(this.focus.distance.value);
                }
                return parseFloat(this.focus.distance.hyper);
            }
        }
    }
}