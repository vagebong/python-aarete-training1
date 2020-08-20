
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
            description: "Register or bind account",
            usage: "[token]"
        });
        this.bot.registerCommand("bind", this.commandBind.bind(this), {
            description: "Generate bind token"
        });
    }

    private commandHi(msg: Message) {
        if (!msg.member) return;

        if (msg.member.voiceState.channelID) {
            void this.bot.joinVoiceChannel(msg.member.voiceState.channelID).then(voice => {
                voice.on('warn', msg => console.error(`[Discord] warn: ${msg}`));
                voice.on('error', err => console.error("[Discord] error: ", err));
            });
            void msg.channel.createMessage(MESSAGE_HI);
        } else {
            void msg.channel.createMessage(MESSAGE_HI_NOT_IN_VOICE);
        }
    }

    private async commandPlay(msg: Message, args: string[]) {
        const list = await this.list.get(new ObjectId(args[0]));
        const voice = this.bot.voiceConnections.get((msg.channel as TextChannel).guild.id);
        const mode = (args[1]) ? ((args[1].toLocaleLowerCase() === "random") ? PlayMode.random : PlayMode.normal) : PlayMode.normal;

        if (!list) {
            void msg.channel.createMessage(MESSAGE_LIST_NOT_FOUND);
            return;
        }

        if (!voice) {
            void msg.channel.createMessage(MESSAGE_NOT_IN_VOICE);
            return;
        }

        // Init playing status
        let isPlaying = false;
        if (mode === PlayMode.random) shuffle(list.audio);
        if (this.playing.has(voice.id)) isPlaying = true;
        this.playing.set(voice.id, {
            index: 0,
            list,
            mode,
            statusMessage: await this.bot.createMessage(msg.channel.id, await this.genPlayingMessage(list, 0))
        });

        // Start play
        if (!isPlaying) {
            const onEnd = async () => {
                // check status
                const status = this.playing.get(voice.id);
                if (!status) {
                    this.bot.closeVoiceConnection(voice.id)
                    return;
                }

                // next
                status.index++;
                if (status.index >= status.list.audio.length) {
                    // refresh list
                    const newList = await this.list.get(status.list._id);
                    if (newList) {
                        if (status.mode === PlayMode.random) {
                            newList.audio.sort();
                            shuffle(newList.audio);
                        }
                        status.list = newList;
                        status.index = 0;
                    } else {
                        this.playing.delete(voice.id);
                        return;
                    }
                }

                retry(() => this.play(voice, status)).catch(err => {
                    console.error(err)

                    // Deletet play state
                    this.playing.delete(voice.id);
                    voice.removeListener("end", onEnd)
                    voice.stopPlaying()
                });
            }
            voice.on("end", onEnd);
            voice.once("disconnect", err => {
                console.error(err)
                this.bot.closeVoiceConnection(voice.id)
                this.playing.delete(voice.id);
                voice.removeListener("end", onEnd)
                voice.stopPlaying()
            })

            void this.play(voice, this.playing.get(voice.id)!);
        }
    }

    private commandNext(msg: Message) {
        const voice = this.bot.voiceConnections.get((msg.channel as TextChannel).guild.id);

        if (voice) {
            voice.stopPlaying();
        } else {
            void msg.channel.createMessage(MESSAGE_NOTHING_PLAYING);
        }
    }

    private commandBye(msg: Message) {
        const voice = this.bot.voiceConnections.get((msg.channel as TextChannel).guild.id);

        if (voice) {
            this.bot.closeVoiceConnection(voice.id)
            this.playing.delete(voice.id);
        } else {
            void msg.channel.createMessage(MESSAGE_NOTHING_PLAYING);
        }
    }
