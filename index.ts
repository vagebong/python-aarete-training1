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
  