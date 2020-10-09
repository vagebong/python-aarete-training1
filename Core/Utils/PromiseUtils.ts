import { access, constants } from "fs";

export async function retry<T>(fun: () => Promise<T>, time = 5, interval = 5000, increase = true) {
    let tryTime = 0;
    let run: Promise<T>;

    do {
        try {
            run = fun();
            return await run;
        } catch (error) {
            if (++tryTime > 0 && increase) i