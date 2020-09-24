
import { execFileSync } from "child_process";
import FFmpeg from "fluent-ffmpeg";
import { createWriteStream, promises as fsp } from "fs";
import { tmpdir } from "os";
import path, { join } from "path";
import { get } from "request";
import { getMediaInfo } from "./MediaInfo";

export class Encoder {
    private config: any;
    private ffmpegPath?: string;
    private cacheDir: string | undefined;

    constructor(config: any) {
        this.config = config.audio;

        // Test system ffmpeg
        try {
            execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
        } catch (err) {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            this.ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
        }
    }

    public async encode(input: string, filename: string, duration: number): Promise<string> {
        if (!this.cacheDir) {
            this.cacheDir = await fsp.mkdtemp(join(tmpdir(), "musicbot-"));
        }

        const cacheFile = join(this.cacheDir, filename);
        await this.download(input, cacheFile);

        const normalize = await this.getNormalize(cacheFile);