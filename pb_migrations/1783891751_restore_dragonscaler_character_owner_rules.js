/// <reference path="../pb_data/types.d.ts" />

const CHARACTERS_COLLECTION = "ifhsgi3s6p97ltf";
const CHARACTER_OWNER_RULE = (
    "owner_identity_ids.account_ids.id = @request.auth.id"
);

migrate((app) => {
    const collection = app.findCollectionByNameOrId(CHARACTERS_COLLECTION);

    // Public character writes could partially succeed before an owner-gated form write failed.
    unmarshal({
        createRule: CHARACTER_OWNER_RULE,
        deleteRule: CHARACTER_OWNER_RULE,
        updateRule: CHARACTER_OWNER_RULE,
    }, collection);

    return app.save(collection);
}, (app) => {
    const collection = app.findCollectionByNameOrId(CHARACTERS_COLLECTION);

    unmarshal({
        createRule: "",
        deleteRule: "",
        updateRule: "",
    }, collection);

    return app.save(collection);
});
