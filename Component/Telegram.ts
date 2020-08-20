
import { ObjectId, WithId } from "mongodb";
import TelegramBot, { CallbackQuery, EditMessageTextOptions, InlineKeyboardButton, Message, User } from "node-telegram-bot-api";
import { basename } from "path";
import Queue from "promise-queue";
import { parse, URL } from "url";
import { Core } from "..";
import { AudioManager, ERR_MISSING_TITLE, IAudioData } from "../Core/AudioManager";
import { ListManager } from "../Core/ListManager";
import { UserManager } from "../Core/UserManager";
import { retry, sleep } from "../Core/Utils/PromiseUtils";

export const BIND_TYPE = "telegram";
const ERR_MISSING_TOKEN = Error("Telegram bot api token not found!");
const ERR_NOT_VALID_TITLE = Error("Not valid title");
const ERR_LIST_NOT_FOUND = Error("Playlist not found");
const ERR_NOT_REGISTER = "Please use /register to register or bind account!";
const ERR_PERMISSION_LOST = "Add sound session ended because you no longer have the permission.";

export class Telegram {
    private audio: AudioManager;
    private user: UserManager;
    private list: ListManager;
    private bot: TelegramBot;
    private me!: User;