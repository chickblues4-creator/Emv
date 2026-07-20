#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
EMV Studio WebSocket Bridge v1.0
Python PC/SC reader bridge for EMV Studio web application
Detects readers, connects to cards, sends APDUs, parses responses
"""

import asyncio
import json
import logging
import struct
from typing import Dict, List, Optional, Set
from datetime import datetime
from pathlib import Path

try:
    import websockets
    from websockets.server import WebSocketServerProtocol
    HAS_WEBSOCKETS = True
except ImportError:
    HAS_WEBSOCKETS = False
    print("WARNING: websockets not installed. Install with: pip install websockets")

try:
    from smartcard.System import readers as pcsc_readers
    from smartcard.util import toHexString, toBytes
    from smartcard.Exceptions import (
        CardConnectionException, NoReadersException, 
        CardRequestTimeoutException, NoCardException
    )
    HAS_SMARTCARD = True
except ImportError:
    HAS_SMARTCARD = False
    print("WARNING: pyscard not installed. Install with: pip install pyscard")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('emv_studio.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════
# DATA MODELS
# ═══════════════════════════════════════════════════════════════════════════

class ReaderInfo:
    """Smartcard reader information"""
    def __init__(self, name: str, index: int = 0):
        self.name = name
        self.index = index
        self.connected = False
        self.card_present = False
        self.atr = ""
        self.protocol = ""
        self.connection = None

    def to_dict(self):
        return {
            "name": self.name,
            "index": self.index,
            "connected": self.connected,
            "card_present": self.card_present,
            "atr": self.atr,
            "protocol": self.protocol,
        }


class APDUCommand:
    """APDU command structure"""
    def __init__(self, cla: int, ins: int, p1: int, p2: int, 
                 data: bytes = b"", le: int = 0):
        self.cla = cla & 0xFF
        self.ins = ins & 0xFF
        self.p1 = p1 & 0xFF
        self.p2 = p2 & 0xFF
        self.data = data
        self.le = le & 0xFF

    def to_bytes(self) -> List[int]:
        """Convert to APDU byte array"""
        apdu = [self.cla, self.ins, self.p1, self.p2]
        if self.data:
            apdu.append(len(self.data) & 0xFF)
            apdu.extend(list(self.data))
        if self.le > 0:
            apdu.append(self.le)
        return apdu

    def to_hex_string(self) -> str:
        """Convert to hex string format"""
        return " ".join(f"{b:02X}" for b in self.to_bytes())


# ═══════════════════════════════════════════════════════════════════════════
# SMARTCARD READER MANAGER
# ═══════════════════════════════════════════════════════════════════════════

class SmartCardManager:
    """Manages PC/SC reader operations"""
    
    def __init__(self):
        self.readers: Dict[str, ReaderInfo] = {}
        self.active_reader: Optional[ReaderInfo] = None
        self.scan_interval = 2  # seconds

    def scan_readers(self) -> Dict[str, ReaderInfo]:
        """Scan for available PC/SC readers"""
        if not HAS_SMARTCARD:
            logger.warning("pyscard not available - running in simulation mode")
            return {}

        try:
            readers_list = list(pcsc_readers())
            found = {}

            for idx, reader in enumerate(readers_list):
                reader_name = str(reader)
                if reader_name not in self.readers:
                    self.readers[reader_name] = ReaderInfo(reader_name, idx)
                found[reader_name] = self.readers[reader_name]

            # Clean up removed readers
            removed = set(self.readers.keys()) - set(found.keys())
            for name in removed:
                if self.active_reader and self.active_reader.name == name:
                    self.disconnect()
                del self.readers[name]

            logger.info(f"Scan complete: {len(found)} reader(s) found")
            return found

        except Exception as e:
            logger.error(f"Error scanning readers: {e}")
            return {}

    def connect_card(self, reader_name: str, protocol: str = "ANY") -> bool:
        """Connect to card in reader"""
        if not HAS_SMARTCARD:
            logger.warning("Cannot connect - pyscard not available")
            return False

        try:
            if reader_name not in self.readers:
                logger.error(f"Reader not found: {reader_name}")
                return False

            reader_obj = None
            readers_list = list(pcsc_readers())

            for reader in readers_list:
                if str(reader) == reader_name:
                    reader_obj = reader
                    break

            if not reader_obj:
                logger.error(f"Reader object not found: {reader_name}")
                return False

            # Try protocols in order
            protocols = []
            if protocol == "ANY":
                protocols = [("T=1", 0x02), ("T=0", 0x01), ("T=ANY", 0x03)]
            elif protocol == "T0":
                protocols = [("T=0", 0x01)]
            elif protocol == "T1":
                protocols = [("T=1", 0x02)]
            else:
                protocols = [("T=ANY", 0x03)]

            for proto_name, proto_const in protocols:
                try:
                    conn = reader_obj.createConnection()
                    conn.connect(proto_const)

                    # Get ATR
                    atr_bytes = conn.getATR()
                    atr_hex = toHexString(atr_bytes)

                    # Store connection
                    reader_info = self.readers[reader_name]
                    reader_info.connection = conn
                    reader_info.connected = True
                    reader_info.card_present = True
                    reader_info.atr = atr_hex
                    reader_info.protocol = proto_name

                    self.active_reader = reader_info

                    logger.info(f"Connected to {reader_name} via {proto_name}")
                    logger.info(f"ATR: {atr_hex}")
                    return True

                except Exception as e:
                    logger.debug(f"Failed to connect with {proto_name}: {e}")
                    continue

            logger.error(f"Failed to connect with any protocol to {reader_name}")
            return False

        except Exception as e:
            logger.error(f"Connection error: {e}")
            return False

    def disconnect(self) -> bool:
        """Disconnect from active card"""
        if not self.active_reader:
            return False

        try:
            if self.active_reader.connection:
                self.active_reader.connection.disconnect()
            self.active_reader.connected = False
            self.active_reader.card_present = False
            self.active_reader.connection = None
            logger.info(f"Disconnected from {self.active_reader.name}")
            self.active_reader = None
            return True
        except Exception as e:
            logger.error(f"Disconnect error: {e}")
            return False

    def send_apdu(self, apdu_cmd: APDUCommand) -> tuple:
        """Send APDU to active card"""
        if not self.active_reader or not self.active_reader.connection:
            logger.error("No active card connection")
            return b"", 0x00, 0x00

        try:
            apdu_bytes = apdu_cmd.to_bytes()
            response, sw1, sw2 = self.active_reader.connection.transmit(apdu_bytes)

            logger.debug(f"APDU: {apdu_cmd.to_hex_string()}")
            logger.debug(f"Response: {toHexString(response)} (SW: {sw1:02X}{sw2:02X})")

            return bytes(response), sw1, sw2

        except Exception as e:
            logger.error(f"APDU error: {e}")
            return b"", 0x00, 0x00

    def get_data(self, tag: int) -> Optional[bytes]:
        """GET DATA (0xCA) - read tag value"""
        apdu = APDUCommand(0x80, 0xCA, (tag >> 8) & 0xFF, tag & 0xFF, le=256)
        response, sw1, sw2 = self.send_apdu(apdu)

        if sw1 == 0x90 and sw2 == 0x00:
            return response
        return None

    def put_data(self, tag: int, data: bytes) -> bool:
        """PUT DATA (0xDA) - write tag value"""
        apdu = APDUCommand(0x80, 0xDA, (tag >> 8) & 0xFF, tag & 0xFF, data=data)
        response, sw1, sw2 = self.send_apdu(apdu)
        return sw1 == 0x90 and sw2 == 0x00


# ═══════════════════════════════════════════════════════════════════════════
# WEBSOCKET SERVER
# ═══════════════════════════════════════════════════════════════════════════

class EMVStudioServer:
    """WebSocket server for EMV Studio"""

    def __init__(self, host: str = "localhost", port: int = 8765):
        self.host = host
        self.port = port
        self.manager = SmartCardManager()
        self.clients: Set[WebSocketServerProtocol] = set()
        self.running = True

    async def broadcast(self, message: dict):
        """Broadcast message to all connected clients"""
        if not self.clients:
            return

        msg_json = json.dumps(message)
        disconnected = set()

        for client in self.clients:
            try:
                await client.send(msg_json)
            except Exception as e:
                logger.warning(f"Failed to send to client: {e}")
                disconnected.add(client)

        self.clients -= disconnected

    async def scan_loop(self):
        """Continuously scan for readers and cards"""
        while self.running:
            try:
                readers = self.manager.scan_readers()

                await self.broadcast({
                    "type": "readers_updated",
                    "readers": {name: info.to_dict() for name, info in readers.items()},
                    "timestamp": datetime.now().isoformat(),
                })

                await asyncio.sleep(self.manager.scan_interval)

            except Exception as e:
                logger.error(f"Scan loop error: {e}")
                await asyncio.sleep(self.manager.scan_interval)

    async def handle_client(self, websocket: WebSocketServerProtocol, path: str):
        """Handle incoming WebSocket connection"""
        self.clients.add(websocket)
        logger.info(f"Client connected: {websocket.remote_address}")

        try:
            async for message in websocket:
                await self.process_message(websocket, json.loads(message))

        except websockets.exceptions.ConnectionClosed:
            logger.info(f"Client disconnected: {websocket.remote_address}")
        except Exception as e:
            logger.error(f"Client error: {e}")
        finally:
            self.clients.discard(websocket)

    async def process_message(self, websocket: WebSocketServerProtocol, msg: dict):
        """Process incoming message from client"""
        msg_type = msg.get("type")
        logger.debug(f"Message type: {msg_type}")

        try:
            if msg_type == "ping":
                await websocket.send(json.dumps({"type": "pong"}))

            elif msg_type == "get_readers":
                readers = self.manager.scan_readers()
                await websocket.send(json.dumps({
                    "type": "readers_list",
                    "readers": {name: info.to_dict() for name, info in readers.items()},
                }))

            elif msg_type == "connect":
                reader_name = msg.get("reader")
                protocol = msg.get("protocol", "ANY")

                success = self.manager.connect_card(reader_name, protocol)

                if success and self.manager.active_reader:
                    reader_info = self.manager.active_reader
                    await self.broadcast({
                        "type": "card_connected",
                        "reader": reader_name,
                        "atr": reader_info.atr,
                        "protocol": reader_info.protocol,
                    })
                    logger.info(f"Card connected: {reader_name}")
                else:
                    await websocket.send(json.dumps({
                        "type": "error",
                        "message": f"Failed to connect to {reader_name}",
                    }))

            elif msg_type == "disconnect":
                success = self.manager.disconnect()
                if success:
                    await self.broadcast({
                        "type": "card_disconnected",
                    })

            elif msg_type == "send_apdu":
                cla = int(msg.get("cla", "00"), 16)
                ins = int(msg.get("ins", "00"), 16)
                p1 = int(msg.get("p1", "00"), 16)
                p2 = int(msg.get("p2", "00"), 16)
                data_hex = msg.get("data", "").replace(" ", "")
                le = int(msg.get("le", "0"), 16) if msg.get("le") else 0

                data_bytes = bytes.fromhex(data_hex) if data_hex else b""
                apdu = APDUCommand(cla, ins, p1, p2, data_bytes, le)

                response, sw1, sw2 = self.manager.send_apdu(apdu)

                await websocket.send(json.dumps({
                    "type": "apdu_response",
                    "command": apdu.to_hex_string(),
                    "response": toHexString(response) if response else "",
                    "sw1": sw1,
                    "sw2": sw2,
                    "success": sw1 == 0x90 and sw2 == 0x00,
                }))

            elif msg_type == "get_data":
                tag = int(msg.get("tag", "00"), 16)
                data = self.manager.get_data(tag)

                await websocket.send(json.dumps({
                    "type": "data_response",
                    "tag": f"{tag:04X}",
                    "value": toHexString(data) if data else "",
                    "success": data is not None,
                }))

            else:
                await websocket.send(json.dumps({
                    "type": "error",
                    "message": f"Unknown message type: {msg_type}",
                }))

        except Exception as e:
            logger.error(f"Error processing message: {e}")
            await websocket.send(json.dumps({
                "type": "error",
                "message": str(e),
            }))

    async def start(self):
        """Start WebSocket server"""
        logger.info(f"Starting EMV Studio WebSocket bridge on ws://{self.host}:{self.port}")

        async with websockets.serve(self.handle_client, self.host, self.port):
            logger.info(f"✓ Server running on ws://{self.host}:{self.port}")

            # Start background scan loop
            scan_task = asyncio.create_task(self.scan_loop())

            try:
                await asyncio.Future()  # run forever
            except KeyboardInterrupt:
                logger.info("Shutting down...")
                self.running = False


# ═══════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════

async def main():
    """Main entry point"""
    if not HAS_WEBSOCKETS:
        print("ERROR: websockets library not found")
        print("Install with: pip install websockets")
        return

    if not HAS_SMARTCARD:
        print("WARNING: pyscard not found - running in simulation mode only")
        print("For real card support, install: pip install pyscard")

    server = EMVStudioServer(host="0.0.0.0", port=8765)

    try:
        await server.start()
    except KeyboardInterrupt:
        logger.info("Server stopped")


if __name__ == "__main__":
    asyncio.run(main())
