/// <reference path="../pb_data/types.d.ts" />

const REFERENCE_IMAGES_COLLECTION = "ds_ref_images";
const SHOULDER_Y_FIELD_ID = "ref_shoulder_y";

migrate((app) => {
    const collection = app.findCollectionByNameOrId(REFERENCE_IMAGES_COLLECTION);

    collection.fields.add(new Field({
        "help": "",
        "hidden": false,
        "id": SHOULDER_Y_FIELD_ID,
        "max": 1,
        "min": 0,
        "name": "shoulder_y",
        "onlyInt": false,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "number",
    }));

    return app.save(collection);
}, (app) => {
    const collection = app.findCollectionByNameOrId(REFERENCE_IMAGES_COLLECTION);

    collection.fields.removeById(SHOULDER_Y_FIELD_ID);

    return app.save(collection);
});
