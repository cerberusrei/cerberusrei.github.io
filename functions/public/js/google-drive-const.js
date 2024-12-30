// Define the fields to fetch from the API
// See https://developers.google.com/drive/api/v3/reference/files
const IMAGE_MEDIA_FIELDS = {
    'width': {},
    'height': {},
    'rotation': {},
    'location': {}, // {"latitude": double, "longitude": double, "altitude": double}
    'time': {},
    'cameraMake': {},
    'cameraModel': {},
    'exposureTime': {},
    'aperture': {},
    'flashUsed': {},
    'focalLength': {},
    'isoSpeed': {},
    'meteringMode': {},
    'sensor': {},
    'exposureMode': {},
    'colorSpace': {},
    'whiteBalance': {},
    'exposureBias': {},
    'maxApertureValue': {},
    'subjectDistance': {},
    'lens': {}
};

const FILE_FIELDS = {
    'id': { hidden: true },
    'name': {},
    'mimeType': { hidden: true },
    'createdTime': {},
    'modifiedTime': {},
    'size': {},
    'hasThumbnail': { hidden: true },
    'webViewLink': { hidden: true },
    'properties': {},
    'permissions': { hidden: true } // should be better not to query this for public user
};

const FILE_FIELDS_CRITERIA =
    Object.keys(FILE_FIELDS).join(',')
    + ',imageMediaMetadata(' + Object.keys(IMAGE_MEDIA_FIELDS).join(',') + ')';