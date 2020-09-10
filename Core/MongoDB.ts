import { EventEmitter } from "events";
import { Db, MongoClient } from "mongodb";

export const ERR_DB_NOT_INIT = Error("Database is not initialized");

// tslint:disable-next-line:interf