import { Collection, ObjectId } from "mongodb";
import { Core } from "..";
import { AudioManager } from "./AudioManager";
import { ERR_DB_NOT_INIT } from "./MongoDB";
import { retry } from "./Utils/PromiseUtils";

export interface IAudioList {
    name: string;
    owner: ObjectId;
    