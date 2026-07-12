/// <reference path="../pb_data/types.d.ts" />

const REFERENCE_IMAGES_COLLECTION = "ds_ref_images";
const WIDTH_FIELD_ID = "ref_width_px";
const HEIGHT_FIELD_ID = "ref_height_px";
const IMAGE_READ_BYTE_LIMIT = 1024 * 1024;

// PocketBase migrations do not have the browser Image API, so backfill reads image headers directly.
const pixelDimensionField = (
    id,
    name,
) => new Field({
    "help": "",
    "hidden": false,
    "id": id,
    "max": null,
    "min": 1,
    "name": name,
    "onlyInt": true,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number",
});

const readUint16BigEndian = (bytes, offset) => (
    bytes[offset] * 256
    + bytes[offset + 1]
);

const readUint16LittleEndian = (bytes, offset) => (
    bytes[offset]
    + bytes[offset + 1] * 256
);

const readUint24LittleEndian = (bytes, offset) => (
    bytes[offset]
    + bytes[offset + 1] * 256
    + bytes[offset + 2] * 65536
);

const readUint32BigEndian = (bytes, offset) => (
    bytes[offset] * 16777216
    + bytes[offset + 1] * 65536
    + bytes[offset + 2] * 256
    + bytes[offset + 3]
);

const readUint32LittleEndian = (bytes, offset) => (
    bytes[offset]
    + bytes[offset + 1] * 256
    + bytes[offset + 2] * 65536
    + bytes[offset + 3] * 16777216
);

const hasBytes = (bytes, offset, expected) => {
    if (offset + expected.length > bytes.length) return false;

    for (let index = 0; index < expected.length; index += 1) {
        if (bytes[offset + index] !== expected[index]) return false;
    }

    return true;
};

const asciiAt = (bytes, offset, length) => {
    let text = "";

    for (let index = 0; index < length; index += 1) {
        text += String.fromCharCode(bytes[offset + index]);
    }

    return text;
};

const normalizeDimensions = (width, height) => {
    if (width <= 0 || height <= 0) return null;

    return {
        width,
        height,
    };
};

const pngDimensions = bytes => {
    if (!hasBytes(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return null;
    if (bytes.length < 24) return null;

    return normalizeDimensions(
        readUint32BigEndian(bytes, 16),
        readUint32BigEndian(bytes, 20),
    );
};

const gifDimensions = bytes => {
    if (bytes.length < 10) return null;
    if (asciiAt(bytes, 0, 3) !== "GIF") return null;

    return normalizeDimensions(
        readUint16LittleEndian(bytes, 6),
        readUint16LittleEndian(bytes, 8),
    );
};

const isJpegStartOfFrameMarker = marker => (
    marker >= 0xc0
    && marker <= 0xcf
    && marker !== 0xc4
    && marker !== 0xc8
    && marker !== 0xcc
);

const jpegDimensions = bytes => {
    if (!hasBytes(bytes, 0, [0xff, 0xd8])) return null;

    let offset = 2;
    while (offset + 3 < bytes.length) {
        if (bytes[offset] !== 0xff) {
            offset += 1;
            continue;
        }

        while (bytes[offset] === 0xff) {
            offset += 1;
        }

        const marker = bytes[offset];
        offset += 1;

        if (marker === 0xd9 || marker === 0xda) break;
        if (marker === 0xd8 || marker === 0x01) continue;
        if (offset + 1 >= bytes.length) break;

        const segmentLength = readUint16BigEndian(bytes, offset);
        if (segmentLength < 2 || offset + segmentLength > bytes.length) break;

        if (isJpegStartOfFrameMarker(marker)) {
            return normalizeDimensions(
                readUint16BigEndian(bytes, offset + 5),
                readUint16BigEndian(bytes, offset + 3),
            );
        }

        offset += segmentLength;
    }

    return null;
};

const webpDimensions = bytes => {
    if (bytes.length < 30) return null;
    if (asciiAt(bytes, 0, 4) !== "RIFF" || asciiAt(bytes, 8, 4) !== "WEBP") return null;

    let offset = 12;
    while (offset + 8 <= bytes.length) {
        const chunkType = asciiAt(bytes, offset, 4);
        const chunkLength = readUint32LittleEndian(bytes, offset + 4);
        const dataOffset = offset + 8;

        if (chunkType === "VP8X" && dataOffset + 10 <= bytes.length) {
            return normalizeDimensions(
                readUint24LittleEndian(bytes, dataOffset + 4) + 1,
                readUint24LittleEndian(bytes, dataOffset + 7) + 1,
            );
        }

        if (chunkType === "VP8L" && dataOffset + 5 <= bytes.length && bytes[dataOffset] === 0x2f) {
            return normalizeDimensions(
                (((bytes[dataOffset + 2] & 0x3f) << 8) | bytes[dataOffset + 1]) + 1,
                (
                    ((bytes[dataOffset + 4] & 0x0f) << 10)
                    | (bytes[dataOffset + 3] << 2)
                    | ((bytes[dataOffset + 2] & 0xc0) >> 6)
                ) + 1,
            );
        }

        if (chunkType === "VP8 " && dataOffset + 10 <= bytes.length) {
            if (hasBytes(bytes, dataOffset + 3, [0x9d, 0x01, 0x2a])) {
                return normalizeDimensions(
                    readUint16LittleEndian(bytes, dataOffset + 6) & 0x3fff,
                    readUint16LittleEndian(bytes, dataOffset + 8) & 0x3fff,
                );
            }
        }

        offset = dataOffset + chunkLength + (chunkLength % 2);
    }

    return null;
};

const imageDimensions = bytes => (
    pngDimensions(bytes)
    ?? jpegDimensions(bytes)
    ?? gifDimensions(bytes)
    ?? webpDimensions(bytes)
);

const readStoredImageBytes = (filesystem, record, filename) => {
    const reader = filesystem.getReader(`${record.baseFilesPath()}/${filename}`);

    try {
        const byteCount = Math.min(
            reader.size(),
            IMAGE_READ_BYTE_LIMIT,
        );
        const bytes = Array.from({length: byteCount}, () => 0);
        const readCount = reader.read(bytes);

        return bytes.slice(0, readCount);
    } finally {
        reader.close();
    }
};

const backfillReferenceImageDimensions = app => {
    const filesystem = app.newFilesystem();

    try {
        for (const record of app.findAllRecords(REFERENCE_IMAGES_COLLECTION)) {
            if (record.get("width_px") > 0 && record.get("height_px") > 0) continue;

            const filename = record.getString("image");
            if (filename === "") continue;

            try {
                const dimensions = imageDimensions(readStoredImageBytes(
                    filesystem,
                    record,
                    filename,
                ));
                if (dimensions === null) {
                    console.warn(`Could not read reference image dimensions for ${record.id}`);
                    continue;
                }

                record.set("width_px", dimensions.width);
                record.set("height_px", dimensions.height);
                app.save(record);
            } catch (error) {
                console.warn(`Could not backfill reference image dimensions for ${record.id}: ${error}`);
            }
        }
    } finally {
        filesystem.close();
    }
};

migrate((app) => {
    const collection = app.findCollectionByNameOrId(REFERENCE_IMAGES_COLLECTION);

    collection.fields.addAt(8, pixelDimensionField(WIDTH_FIELD_ID, "width_px"));
    collection.fields.addAt(9, pixelDimensionField(HEIGHT_FIELD_ID, "height_px"));
    app.save(collection);

    backfillReferenceImageDimensions(app);
}, (app) => {
    const collection = app.findCollectionByNameOrId(REFERENCE_IMAGES_COLLECTION);

    collection.fields.removeById(WIDTH_FIELD_ID);
    collection.fields.removeById(HEIGHT_FIELD_ID);

    return app.save(collection);
});