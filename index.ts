import * as http from "http";
import * as fs from "fs";
import { judge } from "./judge.ts";
import challenges from "./challenges.ts";
import { SubmitRequest, SubmitResponse } from "./api_types.ts";
import workerpool from "workerpool";
import { WorkerOutput } from "./worker.ts";
const host = "localhost";
const port: number = 8000;
const pool = workerpool.pool(__dirname + "/worker.js");

const requestListener = function(req: http.IncomingMessage, res: http.ServerResponse){
    console.log(req.url);
    switch(req.url) {
        case "/":
        case "/index.html":
            fs.readFile("index.html", "utf8", (err, data) => {
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
            fs.readFile("out.js", "utf8", (err, data) => {
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
            fs.readFile("style.css", "utf8", (err, data) => {
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
                    const {memory, challenge_name} = JSON.parse(body) as SubmitRequest;
                    const challenge = challenges.get(challenge_name);
                    if(challenge === undefined) {
                        response = {pass: false, message: "Unknown challenge"};
                    } else {
                        const {memory: output_memory, cycles}: WorkerOutput = await pool.exec("worker", [memory]);
                        if(cycles > (1 << 30)) {
                            response = {pass: false, message: "Too many cycles"};
                        } else {
                            const pass = judge(output_memory, challenge);
                            response = {pass, message: pass ? "Passed" : "Incorrect output"};
                        }
                    }
                    res.setHeader("Content-Type", "application/json");
                    res.writeHead(200);
                    res.end(JSON.stringify(response));
                } catch {
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