"""Serve the controller and forward one paired browser to CoreMIDI."""
import argparse
import asyncio
import contextlib
import hmac
import json
import logging
import math
from pathlib import Path
import secrets
import socket

from aiohttp import web, WSMsgType
from .protocol import ScratchSession

WEB = Path(__file__).resolve().parent.parent / 'web'
LOG = logging.getLogger('platter')


class MidiOutput:
    def __init__(self, dry_run=False, port=None):
        self.output = None
        self.mode = 'dry-run' if dry_run else 'midi'
        if not dry_run:
            import rtmidi
            self.output = rtmidi.MidiOut()
            if port:
                matches = [i for i, name in enumerate(self.output.get_ports()) if name == port]
                if len(matches) != 1:
                    raise RuntimeError(f'Expected one MIDI destination named {port!r}')
                self.output.open_port(matches[0])
            else:
                self.output.open_virtual_port('Platter One')

    def send(self, message):
        if self.output:
            self.output.send_message(message)
        else:
            LOG.debug('MIDI %s', message)

    def close(self):
        if self.output:
            self.output.close_port()


def create_app(output, token):
    app = web.Application(client_max_size=1024)
    active = None
    session = ScratchSession(output.send)

    async def index(request):
        response = web.FileResponse(WEB / 'index.html')
        websocket_origin = f'{"wss" if request.secure else "ws"}://{request.host}'
        response.headers['Cache-Control'] = 'no-store'
        response.headers['Referrer-Policy'] = 'no-referrer'
        response.headers['Content-Security-Policy'] = (
            "default-src 'self'; script-src 'self'; style-src 'self'; "
            f"connect-src 'self' {websocket_origin}; img-src 'self' data:; "
            "frame-ancestors 'none'; base-uri 'none'"
        )
        return response

    async def health(request):
        return web.json_response({'service': 'Platter One', 'output': output.mode,
                                  'mixxx': 'unverified'})

    async def websocket(request):
        nonlocal active
        expected_origin = f'{request.scheme}://{request.host}'
        if request.headers.get('Origin') != expected_origin:
            raise web.HTTPForbidden(text='Open the controller from this bridge')
        if not hmac.compare_digest(request.query.get('token', '').encode(), token.encode()):
            raise web.HTTPForbidden(text='Pair using the URL printed on the Mac')
        ws = web.WebSocketResponse(max_msg_size=1024, heartbeat=5)
        await ws.prepare(request)
        if active is not None:
            await ws.send_json({'type': 'busy'})
            await ws.close(code=1008, message=b'Another controller is connected')
            return ws
        active = ws
        try:
            await ws.send_json({'type': 'hello', 'output': output.mode})
            LOG.info('Controller connected')
            async for incoming in ws:
                if incoming.type != WSMsgType.TEXT:
                    break
                try:
                    message = json.loads(incoming.data)
                    if isinstance(message, dict) and message.get('type') == 'ping':
                        timestamp = message.get('time')
                        if type(timestamp) not in (float, int) or not math.isfinite(timestamp):
                            raise ValueError('Invalid ping')
                        await ws.send_json({'type': 'pong', 'time': timestamp})
                    else:
                        # Reject a queued movement arriving after the hold lease elapsed.
                        if session.expire():
                            await ws.send_json({'type': 'released'})
                            continue
                        session.handle(message)
                except (ValueError, TypeError, OverflowError):
                    session.release()
                    await ws.close(code=1008, message=b'Invalid controller input')
                    break
        finally:
            session.release()
            active = None
            LOG.info('Controller disconnected; platter released')
        return ws

    async def watchdog(app):
        async def watch():
            while True:
                await asyncio.sleep(0.05)
                if session.expire() and active is not None and not active.closed:
                    with contextlib.suppress(ConnectionResetError, RuntimeError):
                        await active.send_json({'type': 'released'})
        task = asyncio.create_task(watch())
        yield
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        session.release()

    async def shutdown(app):
        session.release()
        if active is not None:
            await active.close(code=1001, message=b'Bridge stopping')

    app.router.add_get('/', index)
    app.router.add_get('/health', health)
    app.router.add_get('/ws', websocket)
    for filename in ('app.js', 'geometry.mjs', 'style.css'):
        async def asset(request, filename=filename):
            return web.FileResponse(WEB / filename, headers={'Cache-Control': 'no-cache'})
        app.router.add_get('/' + filename, asset)
    app.cleanup_ctx.append(watchdog)
    app.on_shutdown.append(shutdown)
    return app


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', default='0.0.0.0')
    parser.add_argument('--port', default=8765, type=int)
    parser.add_argument('--dry-run', action='store_true', help='Preview without creating MIDI ports')
    parser.add_argument('--midi-port', help='Use an existing exact destination name, e.g. an IAC bus')
    parser.add_argument('--list-midi-ports', action='store_true', help='List existing MIDI destinations and exit')
    parser.add_argument('--verbose', action='store_true')
    args = parser.parse_args()
    if args.list_midi_ports:
        import rtmidi
        for name in rtmidi.MidiOut().get_ports():
            print(name)
        return
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format='%(message)s')
    output = MidiOutput(args.dry_run, args.midi_port)
    token = secrets.token_urlsafe(24)
    print(f'\nPlatter One | {output.mode} | Mixxx mapping must be enabled separately', flush=True)
    hosts = ['127.0.0.1'] if args.host in ('0.0.0.0', '127.0.0.1') else [args.host]
    if args.host == '0.0.0.0':
        hosts.append(socket.gethostname())
        try:
            hosts.extend(socket.gethostbyname_ex(socket.gethostname())[2])
        except OSError:
            pass
    for host in dict.fromkeys(hosts):
        print(f'  http://{host}:{args.port}/#token={token}', flush=True)
    print('Use the Mac LAN address on your iPad. Keep this pairing URL private.\n', flush=True)
    try:
        web.run_app(create_app(output, token), host=args.host, port=args.port,
                    access_log=None, print=None)
    finally:
        output.close()


if __name__ == '__main__':
    main()
