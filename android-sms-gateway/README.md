# Android SMS Gateway

An Android APK that turns any Android phone into an SMPP-based SMS gateway.
The app connects to your **NET2APP Hub** platform via SMPP transceiver bind,
authenticates with SMPP username/password, and routes SMS through the
phone's SIM card.

## How it works

```
┌─────────────┐     SMPP deliver_sm      ┌──────────────┐     Android SmsManager     ┌──────────────┐
│  NET2APP    │ ─────────────────────────→│  Android SMS │ ──────────────────────────→│  Recipient   │
│  Server     │                           │  Gateway APK │    (phone SIM card)        │  Phone       │
│             │←──────────────────────────│              │←───────────────────────────│              │
└─────────────┘  SMPP deliver_sm (DLR)    └──────────────┘   delivery status          └──────────────┘
       ↑
       │ SMPP submit_sm (inbound SMS from phone)
       │
```

- **Outbound**: Server sends `deliver_sm` → APK sends SMS via SIM → APK sends DLR receipt back
- **Inbound**: Phone receives SMS → APK forwards as `submit_sm` → Server routes it

## Setup

1. **Create an inbound supplier** on your NET2APP platform with a unique SMPP username/password
2. **Install the APK** on the Android phone (Android 8.0+)
3. **Configure** in the app:
   - Server IP/port (pre-filled with your platform's address)
   - SMPP username and password from step 1
4. **Press START** — the app binds as a transceiver and begins routing

## Build

Open this directory in **Android Studio** (Arctic Fox 2021.3+) and build → Generate Signed APK.

Dependencies:
- `jSMPP 2.3.11` — SMPP client library
- `AndroidX` — AppCompat, Material, SwipeRefreshLayout, Preference

## Project Structure

```
app/src/main/java/com/net2app/smsgw/
├── GatewayApp.java         Application class, notification channels, defaults
├── SmppSessionManager.java SMPP bind/reconnect/DLR logic (jSMPP)
├── SmsSender.java          Android SmsManager — sends SMS via SIM, tracks delivery
├── SmsReceiver.java        BroadcastReceiver — catches incoming SMS, forwards to server
├── SmppService.java        Foreground service — keeps SMPP session alive
├── BootReceiver.java       Auto-start gateway on device boot
├── MainActivity.java       Dashboard: status, stats cards, activity log
└── SettingsActivity.java   Configure server host/port, SMPP credentials
```

## Permissions

The app requests:
- `SEND_SMS`, `RECEIVE_SMS`, `READ_SMS` — core SMS gateway functionality
- `INTERNET`, `ACCESS_NETWORK_STATE` — SMPP TCP connection
- `FOREGROUND_SERVICE`, `WAKE_LOCK` — keep connection alive
- `POST_NOTIFICATIONS` — persistent notification while running
- `RECEIVE_BOOT_COMPLETED` — optional auto-start

## License

Part of the NET2APP Hub platform.
