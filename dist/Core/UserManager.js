"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserManager = exports.ERR_BIND_TOKEN_NOT_FOUND = exports.ERR_USER_EXIST = void 0;
const crypto_1 = require("crypto");
const MongoDB_1 = require("./MongoDB");
exports.ERR_USER_EXIST = Error("Us