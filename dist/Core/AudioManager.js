
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AudioManager = exports.ERR_MAX_LENGTH = exports.ERR_NOT_AUDIO = exports.ERR_MISSING_TITLE = void 0;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const os_1 = require("os");
const path_1 = require("path");
const promise_queue_1 = __importDefault(require("promise-queue"));
const MongoDB_1 = require("./MongoDB");
const URLParser_1 = require("./URLParser");
const Encoder_1 = require("./Utils/Encoder");
const PromiseUtils_1 = require("./Utils/PromiseUtils");
exports.ERR_MISSING_TITLE = Error("Missing title");
exports.ERR_NOT_AUDIO = Error("This doesn't look like audio");
exports.ERR_MAX_LENGTH = Error("Audio length exceeds limit");
class AudioManager {
    constructor(core) {
        this.urlParser = new URLParser_1.UrlParser();
        this.metadataQueue = new promise_queue_1.default((0, os_1.cpus)().length);
        this.encodeQueue = new promise_queue_1.default((0, os_1.cpus)().length);
        this.config = core.config.audio;
        const encoder = new Encoder_1.Encoder(core.config);
        this.encode = encoder.encode.bind(encoder);
        core.on("init", () => {
            this.listManager = core.listManager;
        });
        core.on("ready", () => {
            if (!this.listManager)
                throw Error("ListManager hot init");
            if (!core.database.client)
                throw Error("Database client not init");
            this.database = core.database.client.collection("sound");
            void this.database.createIndex({ hash: 1 }, { unique: true });
        });
    }
    async add(sender, source, metadata = {}) {
        if (!this.database)
            throw MongoDB_1.ERR_DB_NOT_INIT;
        let exist = await this.search({ source }).next();
        if (exist)
            return exist;
        let info;
        try {
            info = await (0, PromiseUtils_1.retry)(() => this.metadataQueue.add(() => this.urlParser.getMetadata(source)));
        }
        catch (error) {
            console.error(error);
            throw exports.ERR_NOT_AUDIO;
        }
        const title = metadata.title || info.title;
        const artist = metadata.artist || info.artist;
        const duration = metadata.duration || info.duration;
        const size = metadata.size || info.size;
        if (!duration)
            throw exports.ERR_NOT_AUDIO;
        if (!title)
            throw exports.ERR_MISSING_TITLE;
        if (duration > this.config.length)
            throw exports.ERR_MAX_LENGTH;
        const hash = (0, crypto_1.createHash)("md5").update(title + artist + duration + size).digest("hex");
        exist = await this.search({ hash }).next();
        if (exist)
            return exist;
        const audio = (await this.database.findOne({
            _id: (await this.database.insertOne({
                artist,
                duration,
                hash,
                sender,
                source,
                title,
            })).insertedId
        }));
        try {
            await (0, PromiseUtils_1.retry)(() => this.encodeQueue.add(async () => this.encode(await this.urlParser.getFile(source), audio.hash, audio.duration)));
            return audio;
        }
        catch (error) {
            await this.delete(audio._id);
            throw error;
        }
    }
    edit(id, data) {
        if (!this.database)
            throw MongoDB_1.ERR_DB_NOT_INIT;
        return this.database.findOneAndUpdate({ _id: id }, {
            $set: {
                artist: data.artist,
                duration: data.duration,
                hash: data.hash,
                title: data.title,
            },
        }, { returnDocument: "after" });
    }
    async delete(id) {
        if (!this.database)