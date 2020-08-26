import { Collection, ObjectId } from "mongodb";
import { Core } from "..";
import { AudioManager } from "./AudioManager";
import { ERR_DB_NOT_INIT } from "./MongoDB";
import { retry } from "./Utils/PromiseUtils";

export interface IAudioList {
    name: string;
    owner: ObjectId;
    admin: ObjectId[];
    audio: ObjectId[];
}

export class ListManager {
    private database?: Collection<IAudioList>;
    private audioManager!: AudioManager;

    constructor(core: Core) {
        core.on("init", () => {
            this.audioManager = core.audioManager;
        });

        core.on("ready", () => {
            if (!this.audioManager) throw Er