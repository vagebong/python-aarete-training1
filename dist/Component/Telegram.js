
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
                case "AudioInfo":
                    await this.audioInfoCallback(query, data);
                    break;
                case "List":
                    await this.playlistCallback(query, data);
                    break;
                case "ListInfo":
                    await this.listInfoCallback(query, data);
                    break;
                case "ListCreate":
                    await this.listCreateCallback(query, data);
                    break;
                case "ListAudioAdd":
                    await this.listAudioAddCallback(query, data);
                    break;
                case "ListAudioDel":
                    await this.listAudioDeleteCallback(query, data);
                    break;
                case "ListAudio":
                    await this.listAudioCallback(query, data);
                    break;
                case "AddAdmin":
                    await this.AddAdminCallback(query, data);
                    break;
                case "RemoveAdmin":
                    await this.RemoveAdminCallback(query, data);
                    break;
                case "ListRename":
                    await this.listRenameCallback(query, data);
                    break;
                case "ListDelete":
                    await this.listDeleteCallback(query, data);
                    break;
            }
        });
        this.bot.on("error", err => console.error(err));
    }
    async commandRegister(msg) {
        if (!msg.from || !msg.text)
            return;
        const args = msg.text.split(" ");
        try {
            if (args.length > 1) {
                await this.user.createFromToken(args[1], { type: exports.BIND_TYPE, id: msg.from.id });
            }
            else {
                await this.user.create(msg.from.username || msg.from.id.toString(), { type: exports.BIND_TYPE, id: msg.from.id });
            }
        }
        catch (error) {
            this.sendError(msg, error.message);
            return;
        }
        void this.commandInfo(msg);
    }
    async commandBind(msg) {
        if (!msg.from)
            return;
        const user = await this.getUser(msg.from.id);
        if (!user) {
            this.sendError(msg, ERR_NOT_REGISTER);
            return;
        }
        void this.queueSendMessage(msg.chat.id, `Register token: ${this.user.createBindToken(user._id)}\nExpires after one hour`);
    }
    async commandInfo(msg) {
        if (!msg.from)
            return;
        const user = await this.user.getFromBind(exports.BIND_TYPE, msg.from.id);
        if (!user) {
            void this.queueSendMessage(msg.chat.id, ERR_NOT_REGISTER);
        }
        else {
            void this.queueSendMessage(msg.chat.id, `ID: ${user._id}\nName: ${user.name}\nBind: ${user.bind.map(i => `${i.type}(${i.id})`).join(", ")}`);
        }
    }
    async commandShowList(msg) {
        if (!msg.from || !msg.text)
            return;
        const args = msg.text.split(" ");
        const user = await this.getUser(msg.from.id);
        if (!user) {
            this.sendError(msg, ERR_NOT_REGISTER);
            return;
        }
        let view;
        if (args[1] && args[1].toLocaleLowerCase() === "all") {
            view = await this.genPlaylistView();
        }
        else {
            view = await this.genPlaylistView(0, user._id);
        }
        if (view.button) {
            void this.queueSendMessage(msg.chat.id, view.text, { reply_markup: { inline_keyboard: view.button } });
        }
        else {
            void this.queueSendMessage(msg.chat.id, view.text);
        }
    }
    async audioInfoCallback(query, data) {
        if (!query.message || !data[1])
            return;
        const audio = await this.audio.get(new mongodb_1.ObjectId(data[1]));
        if (!audio)
            return;
        void this.bot.editMessageText(`ID: ${audio._id.toHexString()}\nTitle: ${audio.title}`, { chat_id: query.message.chat.id, message_id: query.message.message_id });
    }
    async playlistCallback(query, data) {
        if (!query.message)
            return;
        const view = await ((data[1]) ? this.genPlaylistView(parseInt(data[2], 10), new mongodb_1.ObjectId(data[1])) : this.genPlaylistView(parseInt(data[2], 10)));
        void this.bot.editMessageText(view.text, {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
            reply_markup: { inline_keyboard: view.button }
        });
    }
    async listInfoCallback(query, data) {
        if (!query.message)
            return;
        const user = await this.getUser(query.from.id);
        if (!user)
            return;
        const view = await this.genListInfoView(new mongodb_1.ObjectId(data[1]), user._id);
        const options = {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
            reply_markup: { inline_keyboard: view.button }
        };
        void this.bot.editMessageText(view.text, options);
    }
    async listCreateCallback(query, data) {
        if (!query.message || !data[1])
            return;
        const user = await this.getUser(query.from.id);
        if (!user || !user._id.equals(new mongodb_1.ObjectId(data[1])))
            return;
        const message = await this.queueSendMessage(query.message.chat.id, "Enter name for new playlist", {
            reply_markup: {
                force_reply: true,
                selective: true
            }
        });
        if (message instanceof Error)
            throw message;
        this.bot.onReplyToMessage(message.chat.id, message.message_id, async (reply) => {
            if (!reply.from || reply.from.id !== query.from.id)
                return;
            if (reply.text) {
                await this.list.create(reply.text, user._id);
                void this.queueSendMessage(reply.chat.id, "Success!", {
                    reply_to_message_id: reply.message_id
                });
            }
            else {
                void this.queueSendMessage(reply.chat.id, "Invalid name!");
            }
            this.bot.removeReplyListener(message.message_id);
        });
    }
    async listAudioAddCallback(query, data) {
        if (!query.message || !data[1])
            return;
        const list = await this.list.get(new mongodb_1.ObjectId(data[1]));
        const user = await this.getUser(query.from.id);
        if (!user || !list || !(list.owner.equals(user._id) || list.admin.find(id => id.equals(user._id))))
            return;
        if (data[2] === "done") {
            this.audioAddSession.delete(query.message.chat.id);
            void this.bot.editMessageText("Now this list have " + list.audio.length.toString() + " sounds!", { chat_id: query.message.chat.id, message_id: query.message.message_id });
        }
        else {
            this.audioAddSession.set(query.message.chat.id, list._id);
            void this.queueSendMessage(query.message.chat.id, "Send me audio file or sound ID you want add to list " + list.name, {
                reply_markup: { inline_keyboard: [[{ text: "Done", callback_data: `ListAudioAdd ${list._id.toHexString()} done` }]] }
            });
        }
    }
    async listAudioDeleteCallback(query, data) {
        if (!query.message || data.length < 3)
            return;
        if (data[3]) {
            await this.list.delAudio(new mongodb_1.ObjectId(data[1]), new mongodb_1.ObjectId(data[2]));
            void this.bot.editMessageReplyMarkup({ inline_keyboard: [[{ text: "Deleted", callback_data: "dummy" }]] }, { chat_id: query.message.chat.id, message_id: query.message.message_id });
        }
        else {
            const audioID = new mongodb_1.ObjectId(data[2]);
            const list = await this.list.get(new mongodb_1.ObjectId(data[1]));
            const audio = await this.audio.get(audioID);
            if (!list || !audio || !list.audio.find(id => id.equals(audioID)))
                return;
            void this.bot.sendMessage(query.message.chat.id, `Are you sure delete ${audio.title} from list ${list.name}?`, {
                reply_markup: { inline_keyboard: [[{ text: "Yes", callback_data: `ListAudioDel ${data[1]} ${data[2]} y` }]] }
            });
        }
    }
    async listAudioCallback(query, data) {
        if (!query.message || data.length < 3)
            return;
        const view = await this.genAudioListView(new mongodb_1.ObjectId(data[2]), parseInt(data[3], 10) || 0, data[1] === "delete");
        if (!view)
            return;
        if (view.button) {
            void this.bot.editMessageText(view.text, {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id,
                reply_markup: { inline_keyboard: view.button }
            });
        }
        else {
            void this.bot.editMessageText(view.text, {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id
            });
        }
    }
    async AddAdminCallback(query, data) {
        if (!query.message || !data[1])
            return;
        const list = await this.list.get(new mongodb_1.ObjectId(data[1]));
        const user = await this.getUser(query.from.id);
        if (!user || !list || !list.owner.equals(user._id))
            return;
        const message = await this.queueSendMessage(query.message.chat.id, "Enter user's ID to add admin", {
            reply_markup: {
                force_reply: true,
                selective: true,
            }
        });
        if (message instanceof Error)
            throw message;
        this.bot.onReplyToMessage(message.chat.id, message.message_id, async (reply) => {
            if (!reply.from || reply.from.id !== query.from.id)
                return;
            if (reply.text) {
                if (!mongodb_1.ObjectId.isValid(reply.text)) {
                    void this.queueSendMessage(reply.chat.id, "ID Invalid!");
                }
                else if (reply.text === user._id.toHexString()) {
                    void this.queueSendMessage(reply.chat.id, "You are adding your self!");
                }
                else {
                    const userToAdd = await this.user.get(new mongodb_1.ObjectId(reply.text));
                    if (!userToAdd) {
                        void this.queueSendMessage(reply.chat.id, "User not found!");
                    }
                    else {
                        await this.list.addAdmin(list._id, userToAdd._id);
                        void this.queueSendMessage(reply.chat.id, "Success!", {
                            reply_to_message_id: reply.message_id
                        });
                    }
                }
            }
            else {
                void this.queueSendMessage(reply.chat.id, "Invalid name!");
            }
            this.bot.removeReplyListener(message.message_id);
        });
    }
    async RemoveAdminCallback(query, data) {
        if (!query.message || !data[1])
            return;
        const list = await this.list.get(new mongodb_1.ObjectId(data[1]));
        const user = await this.getUser(query.from.id);
        if (!user || !list || !list.owner.equals(user._id))
            return;
        const message = await this.queueSendMessage(query.message.chat.id, "Enter user's ID to remove admin", {
            reply_markup: {
                force_reply: true,
                selective: true,
            }
        });
        if (message instanceof Error)
            throw message;
        this.bot.onReplyToMessage(message.chat.id, message.message_id, async (reply) => {
            if (!reply.from || reply.from.id !== query.from.id)
                return;
            if (reply.text) {
                if (!mongodb_1.ObjectId.isValid(reply.text)) {
                    void this.queueSendMessage(reply.chat.id, "ID Invalid!");
                }
                else if (reply.text === user._id.toHexString()) {
                    void this.queueSendMessage(reply.chat.id, "You are removing your self!");
                }
                else {
                    const userToRemove = await this.user.get(new mongodb_1.ObjectId(reply.text));
                    if (!userToRemove) {
                        void this.queueSendMessage(reply.chat.id, "User not found!");
                    }
                    else {
                        await this.list.removeAdmin(list._id, userToRemove._id);
                        void this.queueSendMessage(reply.chat.id, "Success!", {
                            reply_to_message_id: reply.message_id
                        });
                    }
                }
            }
            else {
                void this.queueSendMessage(reply.chat.id, "Invalid name!");
            }
            this.bot.removeReplyListener(message.message_id);
        });
    }
    async listRenameCallback(query, data) {
        if (!query.message || !data[1])
            return;
        const list = await this.list.get(new mongodb_1.ObjectId(data[1]));
        const user = await this.getUser(query.from.id);
        if (!user || !list || !list.owner.equals(user._id))
            return;
        const message = await this.queueSendMessage(query.message.chat.id, "Enter new name", {
            reply_markup: {
                force_reply: true,
                selective: true,
            }
        });
        if (message instanceof Error)
            throw message;
        this.bot.onReplyToMessage(message.chat.id, message.message_id, async (reply) => {
            if (!reply.from || reply.from.id !== query.from.id)
                return;
            if (reply.text) {
                await this.list.rename(list._id, reply.text);
                void this.queueSendMessage(reply.chat.id, "Success!", {
                    reply_to_message_id: reply.message_id
                });
            }
            else {
                void this.queueSendMessage(reply.chat.id, "Invalid name!");
            }
            this.bot.removeReplyListener(message.message_id);
        });
    }
    async listDeleteCallback(query, data) {
        if (!query.message || !data[1])
            return;
        const list = await this.list.get(new mongodb_1.ObjectId(data[1]));
        const user = await this.getUser(query.from.id);
        if (!user || !list || !list.owner.equals(user._id))
            return;
        if (data[2]) {