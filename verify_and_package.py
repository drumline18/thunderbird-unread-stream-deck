import asyncio
import io
import json
import pathlib
import zipfile
from websockets.asyncio.server import serve

work = pathlib.Path(__file__).resolve().parent
plugin = work / "com.maxo.thunderbird-unread.sdPlugin"
addon = work / "thunderbird-addon"

async def verify():
    connected = asyncio.Queue()
    async def accept(socket):
        await connected.put(socket)
        await socket.wait_closed()

    async with serve(accept, "127.0.0.1", 0) as server:
        port = server.sockets[0].getsockname()[1]
        process = await asyncio.create_subprocess_exec(
            "node", str(plugin / "plugin.js"),
            "-port", str(port), "-pluginUUID", "test", "-registerEvent", "registerPlugin"
        )
        try:
            socket = await asyncio.wait_for(connected.get(), 8)
            async def receive():
                return json.loads(await asyncio.wait_for(socket.recv(), 8))

            assert await receive() == {"event": "registerPlugin", "uuid": "test"}
            await socket.send(json.dumps({"event": "willAppear", "context": "key-a"}))
            assert (await receive())["payload"]["title"] == "-"

            source = """
                const assert = require("node:assert/strict");
                let counts = [7, 12];
                let folderChanged;
                global.setInterval = () => {};
                global.messenger = { folders: {
                  query: async (query) => {
                    assert.deepEqual(query, { specialUse: ["inbox"], isVirtual: false });
                    return [{id: "one"}, {id: "two"}];
                  },
                  getFolderInfo: async (id) => ({unreadMessageCount: counts[id === "one" ? 0 : 1]}),
                  onFolderInfoChanged: {addListener: (fn) => {folderChanged = fn;} }
                }};
                require("./thunderbird-addon/background.js");
                setTimeout(() => {
                  counts = [0, 0];
                  folderChanged({specialUse: ["inbox"]}, {unreadMessageCount: 0});
                }, 400);
            """
            addon_process = await asyncio.create_subprocess_exec("node", "-e", source)
            assert (await receive())["payload"]["title"] == "19"
            assert (await receive())["payload"]["title"] == "0"
            assert await addon_process.wait() == 0
            await socket.close()
            assert await asyncio.wait_for(process.wait(), 8) == 0
        finally:
            if process.returncode is None:
                process.kill()
                await process.wait()

def archive(entries):
    data = io.BytesIO()
    with zipfile.ZipFile(data, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for name, value in entries:
            z.writestr(name, value)
    with zipfile.ZipFile(data) as z:
        assert z.testzip() is None
    return data.getvalue()

asyncio.run(verify())
plugin_archive = archive((plugin.name + "/" + item.name, item.read_bytes()) for item in sorted(plugin.iterdir()))
addon_archive = archive((item.name, item.read_bytes()) for item in sorted(addon.iterdir()))
bundle = archive([
    ("Thunderbird-Unread.streamDeckPlugin", plugin_archive),
    ("Thunderbird-Unread-Bridge.xpi", addon_archive),
    ("README.txt", (work / "README.txt").read_bytes()),
])
output = work / "outputs" / "Thunderbird-Unread-Setup.zip"
output.parent.mkdir(exist_ok=True)
output.write_bytes(bundle)
print("Verified registration, offline display, combined Inbox count, and transition to zero.")
