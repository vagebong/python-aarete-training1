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
co