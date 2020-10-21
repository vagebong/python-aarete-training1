
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Discord = exports.BIND_TYPE = void 0;
const eris_1 = require("eris");
const mongodb_1 = require("mongodb");
const shuffle_array_1 = __importDefault(require("shuffle-array"));
const AudioManager_1 = require("../Core/AudioManager");
const PromiseUtils_1 = require("../Core/Utils/PromiseUtils");
exports.BIND_TYPE = "discord";
const ERR_MISSING_TOKEN = Error("Discord token missing");
const ERR_CAN_NOT_GET_AUDIO = Error("Can not get audio from database");
const ERR_MISSING_AUDIO_FILE = Error("Audio missing in cache");
const MESSAGE_HI = "Hi!\nWant some music?";
const MESSAGE_HI_NOT_IN_VOICE = "Hi!\nYou are not in voice channel, so only can say hi using text.";
const MESSAGE_LIST_NOT_FOUND = "Play list not found!";
const MESSAGE_NOT_IN_VOICE = "You should say hi to me first!";
const MESSAGE_NOTHING_PLAYING = "Nothing playing";
var PlayMode;
(function (PlayMode) {
    PlayMode[PlayMode["normal"] = 0] = "normal";
    PlayMode[PlayMode["random"] = 1] = "random";
})(PlayMode || (PlayMode = {}));
class Discord {
    constructor(core) {
        this.playing = new Map();
        this.config = core.config.discord;
        if (!this.config.token)
            throw ERR_MISSING_TOKEN;
        this.bot = new eris_1.CommandClient(this.config.token, {
            intents: ['guilds', 'guildMessages', 'guildVoiceStates'],
            opusOnly: true
        }, { defaultCommandOptions: { caseInsensitive: true }, owner: this.config.owner });
        this.audio = core.audioManager;
        this.list = core.listManager;
        this.user = core.userManager;
        this.bot.on("ready", () => {
            console.log("[Discord] Ready!");
            this.bot.editStatus('online', {
                name: "Self",
                type: 2
            });
        });
        this.bot.on("error", (err, id) => {
            console.error(`[Discord] Error ${id}: ${err}`);
        });
        this.registerCommand();
        void this.bot.connect();
    }
    registerCommand() {
        this.bot.registerCommand("hi", this.commandHi.bind(this), {
            description: "Say Hi! make bot join voice channel",
            guildOnly: true,
        });
        this.bot.registerCommand("play", this.commandPlay.bind(this), {
            argsRequired: true,
            description: "Start play music playlist",
            guildOnly: true,
            usage: "<playlist> [random]"
        });
        this.bot.registerCommand("next", this.commandNext.bind(this), {
            description: "Next sound!",
            guildOnly: true,
        });
        this.bot.registerCommand("bye", this.commandBye.bind(this), {
            description: "Stop play and leave voice channel",
            guildOnly: true
        });
        this.bot.registerCommand("register", this.commandRegister.bind(this), {
            description: "Register or bind account",
            usage: "[token]"
        });
        this.bot.registerCommand("bind", this.commandBind.bind(this), {
            description: "Generate bind token"
        });
    }
    commandHi(msg) {
        if (!msg.member)
            return;
        if (msg.member.voiceState.channelID) {
            void this.bot.joinVoiceChannel(msg.member.voiceState.channelID).then(voice => {
                voice.on('warn', msg => console.error(`[Discord] warn: ${msg}`));
                voice.on('error', err => console.error("[Discord] error: ", err));
            });
            void msg.channel.createMessage(MESSAGE_HI);
        }
        else {
            void msg.channel.createMessage(MESSAGE_HI_NOT_IN_VOICE);
        }
    }
    async commandPlay(msg, args) {
        const list = await this.list.get(new mongodb_1.ObjectId(args[0]));
        const voice = this.bot.voiceConnections.get(msg.channel.guild.id);
        const mode = (args[1]) ? ((args[1].toLocaleLowerCase() === "random") ? PlayMode.random : PlayMode.normal) : PlayMode.normal;
        if (!list) {
            void msg.channel.createMessage(MESSAGE_LIST_NOT_FOUND);
            return;
        }
        if (!voice) {
            void msg.channel.createMessage(MESSAGE_NOT_IN_VOICE);
            return;
        }
        let isPlaying = false;
        if (mode === PlayMode.random)
            (0, shuffle_array_1.default)(list.audio);
        if (this.playing.has(voice.id))
            isPlaying = true;
        this.playing.set(voice.id, {
            index: 0,
            list,
            mode,
            statusMessage: await this.bot.createMessage(msg.channel.id, await this.genPlayingMessage(list, 0))
        });
        if (!isPlaying) {
            const onEnd = async () => {
                const status = this.playing.get(voice.id);
                if (!status) {
                    this.bot.closeVoiceConnection(voice.id);
                    return;
                }
                status.index++;
                if (status.index >= status.list.audio.length) {
                    const newList = await this.list.get(status.list._id);
                    if (newList) {
                        if (status.mode === PlayMode.random) {
                            newList.audio.sort();
                            (0, shuffle_array_1.default)(newList.audio);
                        }
                        status.list = newList;
                        status.index = 0;
                    }
                    else {