
import { ObjectId, WithId } from "mongodb";
import TelegramBot, { CallbackQuery, EditMessageTextOptions, InlineKeyboardButton, Message, User } from "node-telegram-bot-api";
import { basename } from "path";
import Queue from "promise-queue";
import { parse, URL } from "url";
import { Core } from "..";
import { AudioManager, ERR_MISSING_TITLE, IAudioData } from "../Core/AudioManager";
import { ListManager } from "../Core/ListManager";
import { UserManager } from "../Core/UserManager";
import { retry, sleep } from "../Core/Utils/PromiseUtils";

export const BIND_TYPE = "telegram";
const ERR_MISSING_TOKEN = Error("Telegram bot api token not found!");
const ERR_NOT_VALID_TITLE = Error("Not valid title");
const ERR_LIST_NOT_FOUND = Error("Playlist not found");
const ERR_NOT_REGISTER = "Please use /register to register or bind account!";
const ERR_PERMISSION_LOST = "Add sound session ended because you no longer have the permission.";

export class Telegram {
    private audio: AudioManager;
    private user: UserManager;
    private list: ListManager;
    private bot: TelegramBot;
    private me!: User;
    private messageQueue = new Queue(1);
    private audioAddSession = new Map<number, ObjectId>();

    constructor(core: Core) {
        if (!core.config.telegram.token) throw ERR_MISSING_TOKEN;

        this.user = core.userManager;
        this.audio = core.audioManager;
        this.list = core.listManager;

        // Create bot
        this.bot = new TelegramBot(core.config.telegram.token as string, {
            polling: true,
        });

        // Register URLParser
        this.audio.urlParser.registerURLHandler("^tg://", this.getFile.bind(this));
        this.audio.urlParser.registerMetadataProvider("^tg://", this.getMetadata.bind(this));

        // Register listener
        void this.bot.getMe().then(me => {
            this.me = me ;
            this.listener();
        });
    }

    private listener() {
        // Handle command
        this.bot.onText(/^\/(\w+)@?(\w*)/i, (msg, match) => {
            if (!match || msg.chat.type !== "private" && match[2] !== this.me.username) return;
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

        // Audio
        this.bot.on("audio", async (msg: Message) => {
            await this.checkSessionPermission(msg);
            void this.processAudio(msg);
        });

        // File
        this.bot.on("document", async (msg: Message) => {
            await this.checkSessionPermission(msg);
            void this.processFile(msg);
        });

        // Link
        this.bot.on("text", async (msg: Message) => {
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

        // Audio ID
        this.bot.onText(/^([0-9a-f]{24})$/i, async (msg, match) => {
            await this.checkSessionPermission(msg);
            const session = this.audioAddSession.get(msg.chat.id);
            if (!session || !match) return;

            const audio = await this.audio.get(new ObjectId(match[1]));
            if (!audio) {
                void this.queueSendMessage(msg.chat.id, "Sound ID not found in database", { reply_to_message_id: msg.message_id });
                return;
            }

            await this.list.addAudio(session, audio._id);
            void this.queueSendMessage(msg.chat.id, "Added to list!", { reply_to_message_id: msg.message_id });
        });

        // Inline button
        this.bot.on("callback_query", async (query: CallbackQuery) => {
            void this.bot.answerCallbackQuery(query.id);

            if (!query.data) return;
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

    private async commandRegister(msg: Message) {
        if (!msg.from || !msg.text) return;

        const args = msg.text.split(" ");

        try {
            if (args.length > 1) {
                await this.user.createFromToken(args[1], { type: BIND_TYPE, id: msg.from.id });
            } else {
                await this.user.create(
                    msg.from.username || msg.from.id.toString(),
                    { type: BIND_TYPE, id: msg.from.id }
                );
            }
        } catch (error) {
            this.sendError(msg, error.message as string);
            return;
        }

        void this.commandInfo(msg);
    }

    // Commands
    private async commandBind(msg: Message) {
        if (!msg.from) return;

        const user = await this.getUser(msg.from.id);

        if (!user) {
            this.sendError(msg, ERR_NOT_REGISTER);
            return;
        }

        void this.queueSendMessage(
            msg.chat.id,
            `Register token: ${this.user.createBindToken(user._id)}\nExpires after one hour`
        );
    }

    private async commandInfo(msg: Message) {
        if (!msg.from) return;

        const user = await this.user.getFromBind(BIND_TYPE, msg.from.id);
        if (!user) {
            void this.queueSendMessage(msg.chat.id, ERR_NOT_REGISTER);
        } else {
            void this.queueSendMessage(
                msg.chat.id,
                `ID: ${user._id}\nName: ${user.name}\nBind: ${user.bind.map(i => `${i.type}(${i.id})`).join(", ")}`
            );
        }
    }

    private async commandShowList(msg: Message) {
        if (!msg.from || !msg.text) return;

        const args = msg.text.split(" ");
        const user = await this.getUser(msg.from.id);

        if (!user) {
            this.sendError(msg, ERR_NOT_REGISTER);
            return;
        }

        let view;

        if (args[1] && args[1].toLocaleLowerCase() === "all") {
            view = await this.genPlaylistView();
        } else {
            view = await this.genPlaylistView(0, user._id);
        }

        if (view.button) {
            void this.queueSendMessage(msg.chat.id, view.text, { reply_markup: { inline_keyboard: view.button } });
        } else {
            void this.queueSendMessage(msg.chat.id, view.text);
        }
    }

    // Callbacks
    private async audioInfoCallback(query: CallbackQuery, data: string[]) {
        if (!query.message || !data[1]) return;

        const audio = await this.audio.get(new ObjectId(data[1]));
        if (!audio) return;

        void this.bot.editMessageText(`ID: ${audio._id.toHexString()}\nTitle: ${audio.title}`, { chat_id: query.message.chat.id, message_id: query.message.message_id });
    }

    private async playlistCallback(query: CallbackQuery, data: string[]) {
        if (!query.message) return;

        const view = await ((data[1]) ? this.genPlaylistView(parseInt(data[2], 10), new ObjectId(data[1])) : this.genPlaylistView(parseInt(data[2], 10)));

        void this.bot.editMessageText(view.text, {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
            reply_markup: { inline_keyboard: view.button }
        });
    }

    private async listInfoCallback(query: CallbackQuery, data: string[]) {
        if (!query.message) return;
        const user = await this.getUser(query.from.id);
        if (!user) return;
        const view = await this.genListInfoView(new ObjectId(data[1]), user._id);
        const options: EditMessageTextOptions = {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
            reply_markup: { inline_keyboard: view.button }
        };

        void this.bot.editMessageText(view.text, options);
    }

    private async listCreateCallback(query: CallbackQuery, data: string[]) {
        if (!query.message || !data[1]) return;
        const user = await this.getUser(query.from.id);
        if (!user || !user._id.equals(new ObjectId(data[1]))) return;

        const message = await this.queueSendMessage(query.message.chat.id, "Enter name for new playlist", {
            reply_markup: {
                force_reply: true,
                selective: true
            }
        });