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

export async function getMediaInfo(file: string) {
    const ffprobeOption = [
        "-v", "error",
        "-of", "default=nw=1",
        "-show_entries", "stream_tags=title,artist:format_tags=title,artist:format=duration,size",
        file,
    ];

    const execOption = {
        timeout: 30000,
        windowsHide: true
    };

    return new Promise<IAudioMetadata>((resolve, rejec