import { EventEmitter } from "events";
import { existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import { Discord } from "./Component/Discord";
import { Telegram } from "./Component/Telegram";
import { AudioManager } from "./Core/AudioManager";
import { ListManager } from "./Core/ListManager";
import { MongoDB } from "./Core/MongoDB";
import { UserManager } from "./Core/UserManager";

export class Core extends EventEmitter {
    public readonly config = require(resolve("config.json"));
    public readonly audioManager = new AudioManager(this);
    public readonly userManager = new UserManager(this);
    public readonly listManager = new ListManager(this);
    public readonly database = new MongoDB(this.config);

    constructor() {
        super();

        this.emit("init", this);

        if (!existsSync(resolve(this.config.audio.save as string))) mkdirSync(resolve(this.config.audio.save as string));

        // Wait DB connect
        this.database.on("connect", () => this.emit("ready"));

        this.on("ready", async () => {
            console.log("[Main] Init components...");

            try {
                // tslint:disable-next-line:no-unused-expression
                new Telegram(this);
            } catch (error) {
                console.error(error);
            }

            try {
                // tslint:disable-next-line:no-unused-expression
         