/// <reference path="../pb_data/types.d.ts" />

const REFERENCE_IMAGES_COLLECTION = "ds_ref_images";
const MEASUREMENTS_FIELD_ID = "ref_measurements";
const REFERENCE_MEASUREMENT_ID_FIELD_ID = "ref_reference_mid";
const SHOULDER_MEASUREMENT_ID_FIELD_ID = "ref_shoulder_mid";

const jsonField = (
    id,
    name,
) => new Field({
    "help": "",
    "hidden": false,
    "id": id,
    "maxSize": 0,
    "name": name,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json",
});

const textField = (
    id,
    name,
) => new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": id,
    "max": 0,
    "min": 0,
    "name": name,
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text",
});

const point = (
    value,
    fallback,
) => (
    value !== null
    && typeof value === "object"
    && Number.isFinite(value.x)
    && Number.isFinite(value.y)
)
    ? {
        x: value.x,
        y: value.y,
    }
    : fallback;

const backfillMeasurements = (app) => {
    for (const referenceImage of app.findAllRecords(REFERENCE_IMAGES_COLLECTION)) {
        const storedMeasurements = referenceImage.get("measurements");
        if (Array.isArray(storedMeasurements) && storedMeasurements.length > 0) continue;

        const referenceMeasurementId = `${referenceImage.id}-reference`;
        const baselinePoints = referenceImage.get("baseline_points");
        const measurements = [{
            id: referenceMeasurementId,
            points: Array.isArray(baselinePoints) ? baselinePoints : [],
            descriptor: referenceImage.getString("baseline_descriptor"),
            reference_sizing_method:
                referenceImage.getString("reference_sizing_method")
                || "measurement_line",
            pixel_measurement_px: referenceImage.get("pixel_measurement_px") ?? null,
        }];
        const anchor = point(
            referenceImage.get("anchor_point"),
            {
                x: 0.5,
                y: 0,
            },
        );
        const shoulderY = referenceImage.get("shoulder_y");
        let shoulderMeasurementId = "";

        if (
            Number.isFinite(shoulderY)
            && anchor.y < shoulderY
            && shoulderY <= 1
        ) {
            shoulderMeasurementId = `${referenceImage.id}-shoulder`;
            measurements.push({
                id: shoulderMeasurementId,
                points: [
                    anchor,
                    {
                        x: anchor.x,
                        y: shoulderY,
                    },
                ],
                descriptor: "to shoulder",
                reference_sizing_method: "measurement_line",
                pixel_measurement_px: null,
            });
        }

        referenceImage.set("measurements", measurements);
        referenceImage.set("reference_measurement_id", referenceMeasurementId);
        referenceImage.set("shoulder_measurement_id", shoulderMeasurementId);
        app.save(referenceImage);
    }
};

migrate((app) => {
    const collection = app.findCollectionByNameOrId(REFERENCE_IMAGES_COLLECTION);

    collection.fields.add(
        jsonField(
            MEASUREMENTS_FIELD_ID,
            "measurements",
        ),
        textField(
            REFERENCE_MEASUREMENT_ID_FIELD_ID,
            "reference_measurement_id",
        ),
        textField(
            SHOULDER_MEASUREMENT_ID_FIELD_ID,
            "shoulder_measurement_id",
        ),
    );
    app.save(collection);

    backfillMeasurements(app);
}, (app) => {
    const collection = app.findCollectionByNameOrId(REFERENCE_IMAGES_COLLECTION);

    collection.fields.removeById(MEASUREMENTS_FIELD_ID);
    collection.fields.removeById(REFERENCE_MEASUREMENT_ID_FIELD_ID);
    collection.fields.removeById(SHOULDER_MEASUREMENT_ID_FIELD_ID);

    return app.save(collection);
});
