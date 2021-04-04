"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMediaInfo = void 0;
const child_process_1 = require("child_process");
let ffprobe;
try {
    (0, child_process_1.execFileSync)("ffprobe", ["-version"], { stdio: "ignore" });
    