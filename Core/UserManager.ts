import { randomBytes } from "crypto";
import { Collection, ObjectId } from "mongodb";
import { Core } from "..";
import { ERR_DB_NOT_INIT } from "./MongoDB";

export const ERR_USER_EXIST = Error("User exist");
export const ERR_BIND_TOKEN_NOT_FOUND = Error("Bind token not found");

export interface IUserData {
    name: string;
    bind: IBindData[];
}

export interface IBindData {
    type: string;
    id: string | number;
}

export class UserManager {
    private databas