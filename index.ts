import { EventEmitter } from "events";
import { existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import { Discord } from "./Component/Discord";
import { Telegram } from "./Component/Telegram";
import { AudioManager } from "./Core/AudioM