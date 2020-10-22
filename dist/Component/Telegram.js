
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Telegram = exports.BIND_TYPE = void 0;
const mongodb_1 = require("mongodb");
const node_telegram_bot_api_1 = __importDefault(require("node-telegram-bot-api"));
const path_1 = require("path");
const promise_queue_1 = __importDefault(require("promise-queue"));
const url_1 = require("url");
const AudioManager_1 = require("../Core/AudioManager");
const PromiseUtils_1 = require("../Core/Utils/PromiseUtils");
exports.BIND_TYPE = "telegram";
const ERR_MISSING_TOKEN = Error("Telegram bot api token not found!");
const ERR_NOT_VALID_TITLE = Error("Not valid title");
const ERR_LIST_NOT_FOUND = Error("Playlist not found");
const ERR_NOT_REGISTER = "Please use /register to register or bind account!";
const ERR_PERMISSION_LOST = "Add sound session ended because you no longer have the permission.";
class Telegram {
    constructor(core) {
        this.messageQueue = new promise_queue_1.default(1);
        this.audioAddSession = new Map();
        if (!core.config.telegram.token)
            throw ERR_MISSING_TOKEN;
        this.user = core.userManager;
        this.audio = core.audioManager;
        this.list = core.listManager;
        this.bot = new node_telegram_bot_api_1.default(core.config.telegram.token, {
            polling: true,
        });
        this.audio.urlParser.registerURLHandler("^tg://", this.getFile.bind(this));
        this.audio.urlParser.registerMetadataProvider("^tg://", this.getMetadata.bind(this));
        void this.bot.getMe().then(me => {
            this.me = me;
            this.listener();
        });
    }
    listener() {
        this.bot.onText(/^\/(\w+)@?(\w*)/i, (msg, match) => {
            if (!match || msg.chat.type !== "private" && match[2] !== this.me.username)
                return;
            switch (match[1]) {
                case "register":
                    void this.commandRegister(msg);
                    break;
                case "bind":
                    void this.commandBind(msg);
                    break;
                case "info":
                    void this.commandInfo(msg);
                    break;
                case "list":
                    void this.commandShowList(msg);
                    break;
            }
        });
        this.bot.on("audio", async (msg) => {
            await this.checkSessionPermission(msg);
            void this.processAudio(msg);
        });
        this.bot.on("document", async (msg) => {
            await this.checkSessionPermission(msg);
            void this.processFile(msg);
        });
        this.bot.on("text", async (msg) => {
            if (msg.entities && msg.entities.some(entity => entity.type.match(/url|text_link/ig) != null)) {
                await this.checkSessionPermission(msg);
                void this.sendProcessing(msg);
                for (const entity of msg.entities) {
                    if (entity.type === "url" && msg.text) {
                        void this.processLink(msg, msg.text.substr(entity.offset, entity.length));
                    }
                    if (entity.type === "text_link" && entity.url) {
                        void this.processLink(msg, entity.url);
                    }
                }
            }
        });
        this.bot.onText(/^([0-9a-f]{24})$/i, async (msg, match) => {
            await this.checkSessionPermission(msg);
            const session = this.audioAddSession.get(msg.chat.id);
            if (!session || !match)
                return;
            const audio = await this.audio.get(new mongodb_1.ObjectId(match[1]));
            if (!audio) {
                void this.queueSendMessage(msg.chat.id, "Sound ID not found in database", { reply_to_message_id: msg.message_id });
                return;
            }
            await this.list.addAudio(session, audio._id);
            void this.queueSendMessage(msg.chat.id, "Added to list!", { reply_to_message_id: msg.message_id });
        });
        this.bot.on("callback_query", async (query) => {
            void this.bot.answerCallbackQuery(query.id);
            if (!query.data)
                return;
            const data = query.data.split(" ");
            switch (data[0]) {