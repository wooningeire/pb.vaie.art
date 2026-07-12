/// <reference path="../pb_data/types.d.ts" />

const REFERENCE_IMAGES_COLLECTION = "ds_ref_images";
const REFERENCE_SIZING_METHOD_FIELD_ID = "ref_sizing_method";
const PIXEL_MEASUREMENT_FIELD_ID = "ref_pixel_measurement_px";
const MEASUREMENT_LINE = "measurement_line";
const PIXEL_MEASUREMENT = "pixel_measurement";

const referenceSizingMethodField = required => new Field({
    "help": "",
    "hidden": false,
    "id": REFERENCE_SIZING_METHOD_FIELD_ID,
    "maxSelect": 1,
    "name": "reference_sizing_method",
    "presentable": false,
    "required": required,
    "system": false,
    "type": "select",
    "values": [
        MEASUREMENT_LINE,
        PIXEL_MEASUREMENT,
    ],
});

const pixelMeasurementField = () => new Field({
    "help": "",
    "hidden": false,
    "id": PIXEL_MEASUREMENT_FIELD_ID,
    "max": null,
    "min": null,
    "name": "pixel_measurement_px",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number",
});

const backfillReferenceSizingMethods = app => {
    for (const record of app.findAllRecords(REFERENCE_IMAGES_COLLECTION)) {
        const currentMethod = record.getString("reference_sizing_method");
        if (
            currentMethod === MEASUREMENT_LINE
            || currentMethod === PIXEL_MEASUREMENT
        ) {
            continue;
        }

        record.set(
            "reference_sizing_method",
            record.getFloat("pixel_measurement_px") > 0
                ? PIXEL_MEASUREMENT
                : MEASUREMENT_LINE,
        );
        app.save(record);
    }
};

migrate((app) => {
    const collection = app.findCollectionByNameOrId(REFERENCE_IMAGES_COLLECTION);
    const fieldNames = collection.fields.fieldNames();

    // The live schema already has this field from a Dashboard change whose
    // generated migration may not exist in older source checkouts.
    if (!fieldNames.includes("pixel_measurement_px")) {
        collection.fields.add(pixelMeasurementField());
    }

    collection.fields.add(referenceSizingMethodField(false));
    app.save(collection);

    backfillReferenceSizingMethods(app);

    collection.fields.add(referenceSizingMethodField(true));

    return app.save(collection);
}, (app) => {
    const collection = app.findCollectionByNameOrId(REFERENCE_IMAGES_COLLECTION);

    collection.fields.removeById(REFERENCE_SIZING_METHOD_FIELD_ID);
    // This id only exists when this migration had to create the pixel field.
    collection.fields.removeById(PIXEL_MEASUREMENT_FIELD_ID);

    return app.save(collection);
});
