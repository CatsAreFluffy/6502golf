import * as http from "http"
import * as fs from "fs"
const host = "localhost";
const port: number = 8000;

const requestListener = function(req: http.IncomingMessage, res: http.ServerResponse){
    // res.writeHead(200);
    // res.end("My first server?");
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