import asyncio
import unittest
from aiohttp import WSServerHandshakeError
from aiohttp.test_utils import TestClient, TestServer
from bridge.server import create_app


class Output:
    mode = 'dry-run'
    def __init__(self):
        self.messages = []
    def send(self, message):
        self.messages.append(message)


class BridgeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.output = Output()
        self.client = TestClient(TestServer(create_app(self.output, 'test-token')))
        await self.client.start_server()
        self.origin = str(self.client.make_url('/')).rstrip('/')

    async def asyncTearDown(self):
        await self.client.close()

    async def connect(self, token='test-token', origin=None):
        return await self.client.ws_connect('/ws?token=' + token,
                                            headers={'Origin': origin or self.origin})

    async def test_static_files_and_health_do_not_claim_mixxx_ready(self):
        response = await self.client.get('/')
        self.assertEqual(response.status, 200)
        self.assertIn('Platter One', await response.text())
        self.assertIn("frame-ancestors 'none'", response.headers['Content-Security-Policy'])
        for path in ['/app.js', '/geometry.mjs', '/style.css']:
            self.assertEqual((await self.client.get(path)).status, 200)
        response = await self.client.get('/health')
        self.assertEqual((await response.json())['mixxx'], 'unverified')
        self.assertEqual((await self.client.get('/requirements.txt')).status, 404)

    async def test_pairing_and_origin_required(self):
        for token, origin in [('wrong', self.origin), ('test-token', 'https://untrusted.example')]:
            with self.assertRaises(WSServerHandshakeError) as error:
                await self.connect(token, origin)
            self.assertEqual(error.exception.status, 403)
        self.assertEqual(self.output.messages, [])

    async def test_websocket_to_midi_and_disconnect_release(self):
        ws = await self.connect()
        self.assertEqual((await ws.receive_json())['type'], 'hello')
        await ws.send_json({'type': 'down', 'deck': 1})
        await ws.send_json({'type': 'move', 'deck': 1, 'radians': 0.5})
        await ws.send_json({'type': 'ping', 'time': 123})
        self.assertEqual(await ws.receive_json(), {'type': 'pong', 'time': 123})
        self.assertEqual(self.output.messages[0], [0x90, 0, 127])
        self.assertEqual(sum(m[2] - 64 for m in self.output.messages[1:]), 162)
        await ws.close()
        await asyncio.sleep(0.02)
        self.assertEqual(self.output.messages[-1], [0x90, 0, 0])

    async def test_single_controller_and_watchdog(self):
        ws = await self.connect()
        await ws.receive_json()
        second = await self.connect()
        self.assertEqual((await second.receive_json())['type'], 'busy')
        await second.close()
        await ws.send_json({'type': 'down', 'deck': 2})
        self.assertEqual((await ws.receive_json(timeout=1.2))['type'], 'released')
        self.assertEqual(self.output.messages, [[0x91, 0, 127], [0x91, 0, 0]])
        await ws.close()

    async def test_malformed_input_releases_deck(self):
        ws = await self.connect()
        await ws.receive_json()
        await ws.send_json({'type': 'down', 'deck': 1})
        await ws.send_str('{broken')
        await ws.receive()
        await ws.close()
        self.assertEqual(self.output.messages[-1], [0x90, 0, 0])
