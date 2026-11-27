const http = require("node:http");
const path = require("node:path");
const { existsSync } = require("node:fs");
const { execFile } = require("node:child_process");

const bridgePort = 49387;
const staleAfterMs = 35_000;
const activeKeys = new Map();
let count = null;
let lastUpdate = 0;

function startBridge(onUpdate, port = bridgePort) {
  const server = http.createServer((request, response) => {
    const matches = request.method === "POST" && request.url === "/unread"
      && request.headers.host === "127.0.0.1:" + port
      && request.headers["x-thunderbird-unread"] === "1"
      && request.headers["content-type"] === "application/json";
    if (!matches) {
      request.resume();
      response.writeHead(404).end();
      return;
    }

    let body = "";
    let tooLarge = false;
    request.on("data", (chunk) => {
      if (tooLarge) return;
      body += chunk;
      if (body.length <= 64) return;
      tooLarge = true;
      response.writeHead(413).end();
    });
    request.on("end", () => {
      if (tooLarge) return;
      let value;
      try { value = JSON.parse(body); } catch {}
      if (!Number.isSafeInteger(value) || value < 0) {
        response.writeHead(400).end();
        return;
      }
      onUpdate(value);
      response.writeHead(204).end();
    });
  });
  server.listen(port, "127.0.0.1");
  return server;
}

function launchThunderbird(callback) {
  const programDirectories = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"], process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs")];
  const executable = programDirectories.filter(Boolean)
    .map((directory) => path.join(directory, "Mozilla Thunderbird", "thunderbird.exe"))
    .find(existsSync);
  if (!executable) {
    callback(new Error("Thunderbird was not found in its standard install locations."));
    return;
  }
  execFile(executable, ["-mail"], { windowsHide: false }, (error) => {
    if (error) callback(error);
  });
}

function connectToStreamDeck() {
  const args = process.argv;
  const option = (name) => args.indexOf(name) >= 0 ? args[args.indexOf(name) + 1] : null;
  const port = option("-port");
  const uuid = option("-pluginUUID");
  const event = option("-registerEvent");
  if (!port || !uuid || !event) throw new Error("Start this plugin from Stream Deck.");
  const socket = new WebSocket("ws://127.0.0.1:" + port);

  function send(message) {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }

  function updateKeys() {
    const fresh = count !== null && Date.now() - lastUpdate <= staleAfterMs;
    const title = fresh ? String(count) : "\u2014";
    for (const [context, shownTitle] of activeKeys) {
      if (shownTitle === title) continue;
      send({ event: "setTitle", context, payload: { title, target: 0 } });
      activeKeys.set(context, title);
    }
  }

  const bridge = startBridge((value) => {
    count = value;
    lastUpdate = Date.now();
    updateKeys();
  });
  bridge.on("error", (error) => console.error("Unread bridge:", error.message));
  const timer = setInterval(updateKeys, 1000);

  socket.addEventListener("open", () => send({ event, uuid }));
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.event === "willAppear") {
      activeKeys.set(message.context, null);
      updateKeys();
    }
    if (message.event === "willDisappear") activeKeys.delete(message.context);
    if (message.event === "keyDown") {
      launchThunderbird(() => send({ event: "showAlert", context: message.context }));
    }
  });
  socket.addEventListener("close", () => {
    clearInterval(timer);
    bridge.close();
  });
}

if (require.main === module) connectToStreamDeck();
module.exports = { startBridge };
