# Thunderbird Unread for Stream Deck

A Windows Stream Deck key that displays the combined unread count across your Thunderbird Inboxes. Press it to open Thunderbird.

## Install

1. Download and extract `Thunderbird-Unread-Setup.zip` from [Releases](../../releases).
2. In Thunderbird, open **Add-ons and Themes**, click the gear, choose **Install Add-on From File**, and select `Thunderbird-Unread-Bridge.xpi`.
3. Double-click `Thunderbird-Unread.streamDeckPlugin`.
4. In Stream Deck, drag **Thunderbird Unread → Unread Inbox** onto a key.

Requires Windows 10 or later, Stream Deck 7.1 or later, and Thunderbird 128 or later. The launcher looks for Thunderbird in its standard install locations. Thunderbird needs to stay running for live counts. A dash means the Stream Deck key has not received a recent count.

The add-on reads folder counts through Thunderbird's extension API and sends only the combined number to the plugin over localhost. It uses the accounts already configured in Thunderbird.

## Test and package

From the repository root with Python and Node.js 22 or later installed, run:

```sh
python -m pip install websockets
python verify_and_package.py
```

The script checks the key's connection and unread updates with simulated inboxes, then writes the setup ZIP to `outputs/`.
