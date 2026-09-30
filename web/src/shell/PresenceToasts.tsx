/** Says "Name joined" / "Name left" when people enter or leave the room. Renders nothing. Owner: Lane A. */
import { useEffect, useRef } from 'react';
import { usePresence, useSession } from '../session';
import { useToast } from './toast';

const GRACE_MS = 1500; // people already in the room show up within ~0.3 s of connecting; do not announce them as "joined"

export function PresenceToasts() {
  const { session } = useSession();
  const people = usePresence();
  const toast = useToast();
  const known = useRef<Map<string, string>>(new Map());
  const startedAt = useRef(Date.now());

  useEffect(() => {
    const now = new Map(people.map((p) => [p.userId, p.name]));
    const quiet = Date.now() - startedAt.current < GRACE_MS;
    if (!quiet) {
      now.forEach((name, id) => {
        if (!known.current.has(id) && id !== session?.userId) toast(`${name} joined the room`, 'ok');
      });
      known.current.forEach((name, id) => {
        if (!now.has(id) && id !== session?.userId) toast(`${name} left the room`);
      });
    }
    known.current = now;
  }, [people, session?.userId, toast]);

  return null;
}



