import { EventEmitter } from "events";
import { Db, MongoClient } from "mongodb";

export const ERR_DB_NOT_INIT = Error("Database is not initialized");

// tslint:disable-next-line:interface-name
export declare interface MongoDB {
    on(event: "connect", listen: (database: Db) => void): this