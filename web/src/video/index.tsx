/**
 * Lane A (Akshit): P-A4 video dock. LiveKit prebuilt conference: video, audio, screen share and in-room chat.
 * The call starts only when the user clicks "Join call" (no surprise camera prompts, no auto-connect in tests).
 * The dock stays mounted while other tabs are shown (see App.tsx) so the call survives tab switching.
 */
import { useState } from 'react';
import { LiveKitRoom, VideoConference } from '@livekit/components-react';
import { VideoPresets } from 'livekit-client';
import '@livekit/components-styles';
import { api, ApiError } from '../api';
import { useLowBandwidth } from '../lowbandwidth';
import { useSessionUser } from '../session';

interface Conn {
  token: string;
  url: string;
}

export function VideoDock() {
  const me = useSessionUser();
  const low = useLowBandwidth();
  const listenOnly = me.role === 'viewer'; // viewers watch and listen; the server grants them no publish rights
  const [conn, setConn] = useState<Conn | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setBusy(true);
    setError(null);
    try {
      setConn(await api.get<Conn>(`/api/livekit/token?room=${encodeURIComponent(me.roomCode)}`));
    } catch (e) {
      if (e instanceof ApiError && e.status === 503) {
        const hint = (e.body as { hint?: string } | null)?.hint;
        setError(hint ?? 'Video is not configured on this server yet.');
      } else {
        setError(e instanceof Error ? e.message : 'Could not start the call.');
      }
    } finally {
      setBusy(false);
    }
  }

  if (conn) {
    return (
      <div style={{ height: '100%', minHeight: 420 }} data-testid="video-live" data-audio-only={low || undefined} data-listen-only={listenOnly || undefined}>
        <LiveKitRoom
          data-lk-theme="default"
          style={{ height: '100%' }}
          token={conn.token}
          serverUrl={conn.url}
          connect
          video={!low && !listenOnly}
          audio={!listenOnly}
          options={low ? { adaptiveStream: true, dynacast: true, videoCaptureDefaults: { resolution: VideoPresets.h180 } } : undefined}
          onDisconnected={() => setConn(null)}
          onError={(err) => setError(err.message)}
        >
          <VideoConference />
        </LiveKitRoom>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-start gap-3 rounded-md border border-dashed p-3 text-sm" style={{ borderColor: 'var(--lane-a)' }}>
      <div className="font-semibold">Video, audio, screen share and chat</div>
      <div className="text-xs" style={{ color: 'var(--muted)' }}>
        Talk to everyone in room <b>{me.roomCode}</b> without leaving this tab.{' '}
        {listenOnly ? 'As a viewer you can watch and listen, not speak.' : low ? 'Low-bandwidth mode is on: you join with audio only.' : 'Your camera and microphone start when you join.'}
      </div>
      <button
        className="btn btn-sm disabled:opacity-60"
        onClick={join}
        disabled={busy}
        data-testid="video-join"
      >
        {busy ? 'Connecting...' : 'Join call'}
      </button>
      {error && (
        <div className="rounded border p-2 text-xs" style={{ borderColor: 'var(--danger)', background: 'var(--danger-bg)' }} data-testid="video-error">
          {error}
        </div>
      )}
    </div>
  );
}

export default VideoDock;

