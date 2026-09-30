// Checks the LiveKit keys in .env against LiveKit Cloud with ONE read-only call (lists rooms). Run: node scripts/check-livekit.mjs
// Needs no dev server. Tells you in plain words whether the URL, key and secret work together. Prints no secrets.
import { createRequire } from 'node:module';
import dotenv from 'dotenv';
const require = createRequire(new URL('../server/package.json', import.meta.url));
dotenv.config();
const { RoomServiceClient } = require('livekit-server-sdk');
const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  console.log('FAIL  LIVEKIT_URL, LIVEKIT_API_KEY or LIVEKIT_API_SECRET is missing in .env');
  process.exit(1);
}
const host = LIVEKIT_URL.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:');
try {
  const rooms = await new RoomServiceClient(host, LIVEKIT_API_KEY, LIVEKIT_API_SECRET).listRooms();
  console.log(`PASS  LiveKit accepted the keys for ${new URL(host).host} (${rooms.length} room(s) live right now)`);
} catch (e) {
  const msg = String(e?.message ?? e);
  const hint = /401|unauthor|invalid|signature/i.test(msg)
    ? 'the key and secret do not match this project'
    : /ENOTFOUND|EAI_AGAIN|fetch failed|ECONN/i.test(msg)
      ? 'could not reach LiveKit: check the internet connection and the URL'
      : 'see the message';
  console.log(`FAIL  ${hint}: ${msg.split('\n')[0]}`);
  process.exit(1);
}
