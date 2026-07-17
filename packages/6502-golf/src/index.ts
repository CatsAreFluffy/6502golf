import * as http from "http";
import { promises as fsPromises } from "fs";
import { judge } from "./judge.ts";
import challenges from "./challenges.ts";
import { LeaderboardRequest, LeaderboardResponse, LeaderboardRow, SubmitRequest, SubmitResponse } from "./api_types.ts";
import workerpool from "workerpool";
import { WorkerOutput } from "./worker.ts";
import sql from "./db.ts";
const host = "localhost";
const port: number = 8000;
const pool = workerpool.pool(__dirname + "/worker.js");
// Simple in-memory per-IP rate limiter
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_MAX = 10; // max requests
const RATE_LIMIT_WINDOW = 60_000; // per 60s

function getClientIp(req: http.IncomingMessage) {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
    return req.socket && req.socket.remoteAddress ? String(req.socket.remoteAddress) : "unknown";
}

async function sendFile(res: http.ServerResponse, filePath: string, contentType: string) {
    try {
        const data = await fsPromises.readFile(filePath, "utf8");
        res.setHeader("Content-Type", contentType);
        res.writeHead(200);
        res.end(data);
    } catch (err) {
        console.error("Error reading file", filePath, err);
        res.writeHead(500);
        res.end("Internal server error");
    }
}

const requestListener = async function(req: http.IncomingMessage, res: http.ServerResponse){
    const ip = getClientIp(req);
    console.log(req.url, req.method, ip);
    switch(req.url) {
        case "/":
        case "/index.html":
            await sendFile(res, "src/index.html", "text/html");
            break;
        case "/out.js":
            await sendFile(res, "dist/out.js", "text/javascript");
            break;
        case "/out.js.map":
            await sendFile(res, "dist/out.js.map", "text/javascript");
            break;
        case "/style.css":
            await sendFile(res, "src/style.css", "text/css");
            break;
        case "/submit": {
            if (req.method !== "POST") {
                res.writeHead(405);
                res.end();
                break;
            }
            // rate-limit per IP
            const now = Date.now();
            const entry = rateLimitMap.get(ip);
            if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
                rateLimitMap.set(ip, { count: 1, windowStart: now });
            } else {
                entry.count++;
                if (entry.count > RATE_LIMIT_MAX) {
                    res.writeHead(429);
                    res.end("Too many requests");
                    break;
                }
            }

            let body = "";
            req.on("data", chunk => {
                body += chunk.toString();
                // simple body size guard
                if (body.length > 1_000_000) {
                    res.writeHead(413);
                    res.end("Request entity too large");
                    req.socket.destroy();
                }
            });
            req.on("end", async () => {
                try {
                    let response: SubmitResponse;
                    const parsed = JSON.parse(body) as SubmitRequest;
                    // Basic validation/sanitization
                    const username = typeof parsed.username === "string" ? parsed.username.slice(0, 39) : "";
                    const challenge_name = typeof parsed.challenge_name === "string" ? parsed.challenge_name : "";
                    const memory = parsed.memory;

                    const challenge = challenges.get(challenge_name);
                    if (challenge === undefined) {
                        response = { pass: false, message: "Unknown challenge" };
                        res.setHeader("Content-Type", "application/json");
                        res.writeHead(200);
                        res.end(JSON.stringify(response));
                        return;
                    }

                    // Shallow validation only: ensure memory is an object.
                    // Detailed structural validation is performed inside the worker
                    // by Machine.deserialize to avoid duplication and to centralize
                    // error reporting.
                    if (typeof memory !== "object" || memory === null) {
                        throw new Error("Invalid memory");
                    }

                    // Run worker with a timeout to avoid long CPU usage
                    try {
                        const execOptions: unknown = { timeout: 30_000 }; // 30s timeout
                        // narrow pool type to avoid `any` usage in assertions
                        const poolExec = pool as unknown as { exec: (fn: string, args: unknown[], opts?: unknown) => Promise<WorkerOutput> };
                        const { memory: output_memory, initial_bytes, cycles }: WorkerOutput = await poolExec.exec("worker", [memory], execOptions);
                        if (cycles > (1 << 30)) {
                            response = { pass: false, message: "Too many cycles" };
                        } else {
                            const pass = judge(output_memory, challenge);
                            response = { pass, message: pass ? "Passed" : "Incorrect output" };
                            if (pass && username !== "") {
                                await sql.begin(async (sql) => {
                                    const obsolete_scores = await sql`
                                        delete from scores
                                            where challenge=${challenge_name}
                                            and bytes>=${initial_bytes}
                                            and cycles>=${cycles}
                                            and username=${username}`;
                                    console.log(`Deleted ${obsolete_scores.count} scores`);
                                    await sql`insert into scores
                                        (challenge, bytes, cycles, username)
                                        values
                                        (${challenge_name},${initial_bytes},${cycles},${username})`;
                                });
                            }
                        }
                    } catch (err: unknown) {
                        if (typeof err === "object" && err !== null) {
                            const e = err as { message?: unknown };
                            if (typeof e.message === "string" && e.message.toLowerCase().includes("timeout")) {
                                response = { pass: false, message: "Execution timed out" };
                            } else {
                                console.error("Worker error:", err);
                                throw err;
                            }
                        } else {
                            console.error("Worker error:", err);
                            throw err;
                        }
                    }

                    res.setHeader("Content-Type", "application/json");
                    res.writeHead(200);
                    res.end(JSON.stringify(response));
                } catch (e) {
                    console.error(e);
                    res.setHeader("Content-Type", "application/json");
                    res.writeHead(500);
                    res.end(JSON.stringify({ pass: false, message: "Internal server error" }));
                }
            });

            break;
        }
        case "/leaderboard.html": {
            await sendFile(res, "src/leaderboard.html", "text/html");
            break;
        }
        case "/leaderboard.js": {
            await sendFile(res, "dist/leaderboard.js", "text/javascript");
            break;
        }
        case "/leaderboard.js.map": {
            await sendFile(res, "dist/leaderboard.js.map", "text/javascript");
            break;
        }
        case "/leaderboard": {
            if (req.method !== "POST") {
                res.writeHead(405);
                res.end();
                break;
            }

            let body = "";
            req.on("data", chunk => {
                body += chunk.toString();
                if (body.length > 1_000_000) {
                    res.writeHead(413);
                    res.end("Request entity too large");
                    req.socket.destroy();
                }
            });
            req.on("end", async () => {
                try {
                    const request = JSON.parse(body) as LeaderboardRequest;
                    if(typeof request.challenge_name !== "string" || typeof request.scoring !== "string") {
                        throw new Error("Invalid types");
                    }
                    const rows: LeaderboardRow[] = [];
                    switch(request.scoring) {
                        case "bytes": {
                            const stuff = await sql`
                                select * from
                                    (select
                                        distinct on (username)
                                        bytes, cycles, username
                                        from scores
                                        where challenge=${request.challenge_name}
                                        order by username, bytes, cycles)
                                    order by bytes, cycles, username`;
                            for(const {bytes, cycles, username} of stuff) {
                                rows.push({username, bytes, cycles});
                            }
                            break;
                        }
                        case "frontier": {
                            const stuff = await sql`
                                select
                                    distinct on (bytes)
                                    bytes, cycles, username
                                    from scores
                                    where challenge=${request.challenge_name}
                                    order by bytes, cycles, username`;
                            let best_cycles = 3 << 29;
                            for(const {bytes, cycles, username} of stuff) {
                                if(cycles >= best_cycles) {
                                    continue;
                                }
                                best_cycles = cycles;
                                rows.push({username, bytes, cycles});
                            }
                            break;
                        }
                        case "cycles": {
                            const max_bytes = request.max_bytes;
                            if(typeof max_bytes !== "number") {
                                throw new Error("Invalid max bytes");
                            }
                            const stuff = await sql`
                                select * from
                                    (select
                                        distinct on (username)
                                        bytes, cycles, username
                                        from scores
                                        where challenge=${request.challenge_name}
                                        and bytes<=${max_bytes}
                                        order by username, cycles, bytes)
                                    order by cycles, bytes, username`;
                            for(const {bytes, cycles, username} of stuff) {
                                rows.push({username, bytes, cycles});
                            }
                            break;
                        }
                        default:
                            throw new Error("Invalid scoring");
                    }
                    const response: LeaderboardResponse = rows;
                    res.setHeader("Content-Type", "application/json");
                    res.writeHead(200);
                    res.end(JSON.stringify(response));
                } catch(e) {
                    console.error(e);
                    res.setHeader("Content-Type", "application/json");
                    res.writeHead(500);
                    res.end("Internal server error");
                }
            });

            break;
        }
        default:
            res.writeHead(404);
            res.end();
            break;
    }
};

const server = http.createServer(requestListener);
server.listen(port, undefined, () => {
    console.log(`Server is running on http://${host}:${port}`);
});