"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Core = void 0;
const events_1 = require("events");
const fs_1 = require("fs");
const path_1 = require("path");
const Discord_1 = require("./Component/Discord");
const Telegram_1 = require("./Component/Telegram");
const AudioManager_1 = require("./Core/AudioManager");
const ListManager_1 = require("./Core/ListManager");
const MongoDB_1 = require("./Core/MongoDB");
const UserManager_1 = require("./Core/UserManager");
class Core extends events_1.EventEmitter {
    constructor() {
        super();
        this.config = require((0, path_1.resolve)("config.json"));
        this.audioManager = new AudioManager_1.AudioManager(this);
        this.userManager = new UserManager_1.UserManager(this);
        this.listManager = new ListManager_1.ListManager(this);
        this.database = new