"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ListManager = void 0;
const MongoDB_1 = require("./MongoDB");
const PromiseUtils_1 = require("./Utils/PromiseUtils");
class ListManager {
    constructor(core) {
        core.on("init", () => {
            this.audioManager = core.audioManager;
        });
        core.on("ready", () => {
            if (!this.audioManager)
                throw Error("AudioManager not init");
            if (!core.database.client)
                throw Error("Database client not init");
            this.database = core.database.client.collection("list");
            void this.database.updateMany({ admin: { $exists: false } }, { $set: { admin: [] } });
            void this.database.createIndex({ owner: 1 });
            void this.database.createIndex({ admin: 1 });
        });
    }
    async create(name, owner) {
        if (!this.database)
            throw MongoDB_1.ERR_DB_NOT_INIT;
        await this.database.insertOne({
            admin: Array(),
            audio: Array(),
            name,
            owner
        });
    }
    get(id) {
        if (!this.database)
            throw MongoDB_1.ERR_DB_NOT_INIT;
        return (0, PromiseUtils_1.retry)(() => this.database.findOne({ _id: id }), 17280, 5000, false);
    }
    getAll() {
        if (!this.database)
           