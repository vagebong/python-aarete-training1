
import { CommandClient, Message, MessageContent, TextChannel, VoiceConnection } from "eris";
import { ObjectId, WithId } from "mongodb";
import shuffle from "shuffle-array";
import { Core } from "..";
import { AudioManager, ERR_MISSING_TITLE, ERR_NOT_AUDIO, IAudioData } from "../Core/AudioManager";
import { IAudioList, ListManager } from "../Core/ListManager";
import { UserManager } from "../Core/UserManager";
import { retry } from "../Core/Utils/PromiseUtils";

export const BIND_TYPE = "discord";
const ERR_MISSING_TOKEN = Error("Discord token missing");
const ERR_CAN_NOT_GET_AUDIO = Error("Can not get audio from database");
const ERR_MISSING_AUDIO_FILE = Error("Audio missing in cache");
const MESSAGE_HI = "Hi!\nWant some music?";
const MESSAGE_HI_NOT_IN_VOICE = "Hi!\nYou are not in voice channel, so only can say hi using text.";
const MESSAGE_LIST_NOT_FOUND = "Play list not found!";
const MESSAGE_NOT_IN_VOICE = "You should say hi to me first!";
const MESSAGE_NOTHING_PLAYING = "Nothing playing";

enum PlayMode {
    normal,
    random
}

interface IPlayingStatus {
    index: number;
    list: WithId<IAudioList>;
    mode: PlayMode;
    statusMessage: Message;
}

export class Discord {
    private config: any;
    private bot: CommandClient;
    private audio: AudioManager;
    private list: ListManager;
    private user: UserManager;
    private playing = new Map<string, IPlayingStatus>();

    constructor(core: Core) {
        this.config = core.config.discord;

        if (!this.config.token) throw ERR_MISSING_TOKEN;

        this.bot = new CommandClient(
            this.config.token as string,
            {
                intents: ['guilds', 'guildMessages', 'guildVoiceStates'],
                opusOnly: true
            },
            { defaultCommandOptions: { caseInsensitive: true }, owner: this.config.owner }
        );
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
            console.error(`[Discord] Error ${id}: ${err}`)
        })

        // this.bot.on("messageCreate", msg => {
        //     if (msg.attachments.length > 0) this.procseeFile(msg);
        // });

        this.registerCommand();

        void this.bot.connect();
    }

    private registerCommand() {
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