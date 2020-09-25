import { execFile, execFileSync } from "child_process";
import { IAudioMetadata } from "../URLParser";

let ffprobe: string;
// Test system ffprobe
try {
    execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
    ffprobe = "ffprobe";
} catch (err) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ffprobe = require("@ffprobe-installer/ffprobe").path;
}

expo