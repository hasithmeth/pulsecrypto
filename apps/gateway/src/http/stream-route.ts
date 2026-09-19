import websocket from '@fastify/websocket';
import { STREAM_PATH } from '@pulsecrypto/contracts';
import type { FastifyPluginAsync } from 'fastify';
import type { Broadcaster } from '../broadcast/broadcaster';
import { rawDataToString } from '../lib/raw-data';

const MAX_INBOUND_PAYLOAD_BYTES = 4 * 1024;

export const streamRoute: FastifyPluginAsync<{ broadcaster: Broadcaster }> = async (
  app,
  { broadcaster },
) => {
  // Compression is off on purpose: frames are small, and per-message deflate
  // costs CPU and per-socket memory on both the gateway and the phone.
  await app.register(websocket, {
    options: { maxPayload: MAX_INBOUND_PAYLOAD_BYTES, perMessageDeflate: false },
  });

  app.get(STREAM_PATH, { websocket: true }, (socket) => {
    const session = broadcaster.connect(socket);
    if (!session) return;

    socket.on('message', (data, isBinary) => {
      broadcaster.receive(session, isBinary ? '' : rawDataToString(data));
    });
    socket.on('pong', () => {
      broadcaster.markAlive(session);
    });
    socket.on('error', (error) => {
      app.log.debug({ client: session.id, err: error }, 'client socket error');
    });
    socket.on('close', () => {
      broadcaster.disconnect(session);
    });
  });
};
