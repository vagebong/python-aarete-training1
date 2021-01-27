"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserManager = exports.ERR_BIND_TOKEN_NOT_FOUND = exports.ERR_USER_EXIST = void 0;
const crypto_1 = require("crypto");
const MongoDB_1 = require("./MongoDB");
exports.ERR_USER_EXIST = Error("User exist");
exports.ERR_BIND_TOKEN_NOT_FOUND = Error("Bind token not found");
class UserManager {
    constructor(core) {
        this.bindToken = new Map();
        core.on("ready", () => {
            if (!core.database.client)
                throw Error("Database client not init");
            this.database = core.database.client.collection("user");
            void this.database.createIndex({ "bind.type": 1, "bind.id": 1 }, { unique: true });
        });
    }
    get(id) {
        if (!this.database)
            throw MongoDB_1.ERR_DB_NOT_INIT;
        return this.database.findOne({ _id: id });
    }
    getFromBind(type, id) {
        if (!this.database)
            throw MongoDB_1