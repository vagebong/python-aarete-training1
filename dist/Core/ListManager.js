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
            void this.database.u