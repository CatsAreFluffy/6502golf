import * as http from "http"
import * as fs from "fs"
import Machine from "./machine.ts"
import { judge } from "./judge.ts";
import challenges from "./challenges.ts";
import { SubmitRequest, SubmitResponse } from "./api_types.ts";
const host = "localhost";
const port: number = 8000;

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
            })
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
            })
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
            })
            break;
        case "/submit": {
            let body = "";

            req.on("data", chunk => {
                body += chunk.toString();
            })
            req.on("end", () => {
                try {
                    let response: SubmitResponse;
                    let {memory, challenge_name} = JSON.parse(body) as SubmitRequest;
                    let machine = Machine.deserialize(memory);
                    let challenge = challenges.get(challenge_name);
                    if(challenge === undefined) {
                        response = {pass: false, message: "Unknown challenge"};
                    } else {
                        machine.run_until_jam(1 << 30);
                        console.log(machine.cycles);
                        if(machine.cycles > (1 << 30)) {
                            response = {pass: false, message: "Too many cycles"};
                        } else {
                            let pass = judge(machine, challenge);
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
server.listen(port, host, () => {
    console.log(`Server is running on http://${host}:${port}`);
});