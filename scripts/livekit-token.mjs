// P-D0 scratch check: mints one LiveKit token from .env keys. Run: node scripts/livekit-token.mjs
import { createRequire } from 'node:module';
import dotenv from 'dotenv';
const require = createRequire(new URL('../server/package.json', import.meta.url));
dotenv.config();
const { AccessToken } = require('livekit-server-sdk');
const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  console.log('Missing LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET in .env (create a LiveKit Cloud project first).');
  process.exit(1);
}
const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { identity: 'scratch' });
at.addGrant({ roomJoin: true, room: 'sv-scratch' });
const jwt = await at.toJwt();
console.log('OK token for', LIVEKIT_URL, '\n' + jwt.slice(0, 40) + '...');
