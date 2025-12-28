import * as http from "http";
import * as fs from "fs";
import { judge } from "./judge.ts";
import challenges from "./challenges.ts";
import { SubmitRequest, SubmitResponse } from "./api_types.ts";
import workerpool from "workerpool";
import { WorkerOutput } from "./worker.ts";
import sql from "./db.ts";
const host = "localhost";
const port: number = 8000;
const pool = workerpool.pool(__dirname + "/worker.js");

const requestListener = async function(req: http.IncomingMessage, res: http.ServerResponse){
    console.log(req.url);
    switch(req.url) {
        case "/":
        case "/index.html":
            fs.readFile("src/index.html", "utf8", (err, data) => {
                if(err) {
                    console.error("Error:", err);
                    return;
                }
                res.setHeader("Content-Type", "text/html");
                res.writeHead(200);
                res.end(data);
            });
            break;
        case "/out.js":
            fs.readFile("dist/out.js", "utf8", (err, data) => {
                if(err) {
                    console.error("Error:", err);
                    return;
                }
                res.setHeader("Content-Type", "text/javascript");
                res.writeHead(200);
                res.end(data);
            });
            break;
        case "/style.css":
            fs.readFile("src/style.css", "utf8", (err, data) => {
                if(err) {
                    console.error("Error:", err);
                    return;
                }
                res.setHeader("Content-Type", "text/css");
                res.writeHead(200);
                res.end(data);
            });
            break;
        case "/submit": {
            let body = "";

            req.on("data", chunk => {
                body += chunk.toString();
            });
            req.on("end", async () => {
                try {
                    let response: SubmitResponse;
                    const {username, memory, challenge_name} = JSON.parse(body) as SubmitRequest;
                    const challenge = challenges.get(challenge_name);
                    if(challenge === undefined) {
                        response = {pass: false, message: "Unknown challenge"};
                    } else {
                        const {memory: output_memory, initial_bytes, cycles}: WorkerOutput = await pool.exec("worker", [memory]);
                        if(cycles > (1 << 30)) {
                            response = {pass: false, message: "Too many cycles"};
                        } else {
                            const pass = judge(output_memory, challenge);
                            response = {pass, message: pass ? "Passed" : "Incorrect output"};
                            if(pass && username !== "") {
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
                    }
                    res.setHeader("Content-Type", "application/json");
                    res.writeHead(200);
                    res.end(JSON.stringify(response));
                } catch(e) {
                    console.error(e);
                    res.setHeader("Content-Type", "application/json");
                    res.writeHead(500);
                    res.end(JSON.stringify({pass: false, message: "Internal server error"}));
                }
            });

            break;
        }
        case "/leaderboard.html": {
            let data = "<table><tr><td>challenge</td><td>bytes</td><td>cycles</td><td>username</td></tr>";
            const scores = await sql`select * from scores`;
            for(const {challenge, bytes, cycles, username} of scores) {
                data += `<tr><td>${challenge}</td><td>${bytes}</td><td>${cycles}</td><td>${username}</td></tr>`;
            }
            data += "</table>";
            res.setHeader("Content-Type", "text/html");
            res.writeHead(200);
            res.end(data);
            break;
        }
        case "/reset": {
            await sql`truncate scores`;
            res.setHeader("Content-Type", "text/html");
            res.writeHead(200);
            res.end("wiped all scores lmao");
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