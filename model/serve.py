"""
Step 6.5: serve the trained DQN over HTTP so the web backend can ask it for signal decisions.

    cd model
    python serve.py                      # http://127.0.0.1:5001, loads results/models/dqn_last.pt
    python serve.py --model results/models/dqn_ep300.pt --port 5001

Endpoints (JSON):
    GET  /health    -> status, checkpoint episode, which backend is running the network
    POST /predict   -> body {"state": [35 numbers]}
                       reply {"action", "phase", "green_seconds", "q_values", "episode", "backend"}

The service listens on 127.0.0.1 only. The Express backend (routes/ai.js) is the only caller, after it
has checked the user is logged in. The network is the same QNetwork used in training (dqn_agent.py);
if PyTorch is not installed a small numpy reader loads the same weights, so the answers are identical.
"""
import argparse
import collections
import json
import math
import os
import pickle
import sys
import threading
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_MODEL = os.path.join(HERE, "results", "models", "dqn_last.pt")

try:                                    # use the training definitions when SUMO's traci is installed
    from sumo_env import DURATIONS, SumoEnv, decode_action
    STATE_SIZE, ACTION_SIZE = SumoEnv.state_size, SumoEnv.action_size
except Exception:                       # otherwise local copies, kept identical to sumo_env.py
    DURATIONS = [10, 20, 30, 40]
    STATE_SIZE, ACTION_SIZE = 35, 8

    def decode_action(action):
        """action (0..7) -> (phase, green_seconds). phase 0 = North/South green, 1 = East/West green."""
        return int(action) // len(DURATIONS), DURATIONS[int(action) % len(DURATIONS)]


# ---------------------------------------------------------------------------------------------
# Loading the trained network
# ---------------------------------------------------------------------------------------------
def _load_numpy(path):
    """Read a PyTorch checkpoint without PyTorch (zip + pickle) and run the 3-layer network in numpy."""
    zf = zipfile.ZipFile(path)
    prefix = zf.namelist()[0].split("/")[0]
    dtypes = {"FloatStorage": np.float32, "DoubleStorage": np.float64, "LongStorage": np.int64,
              "IntStorage": np.int32, "HalfStorage": np.float16, "BoolStorage": np.bool_}

    class Storage:
        def __init__(self, arr):
            self.arr = arr

    def rebuild(storage, offset, size, stride, *args, **kwargs):
        size, stride, flat = tuple(size), tuple(stride), storage.arr
        if not size:
            return np.array(flat[offset])
        view = np.lib.stride_tricks.as_strided(flat[offset:], shape=size,
                                               strides=[s * flat.itemsize for s in stride])
        return np.array(view)

    class Reader(pickle.Unpickler):
        def find_class(self, module, name):
            if name == "_rebuild_tensor_v2":
                return rebuild
            if module == "torch" and name.endswith("Storage"):
                return name
            if module == "collections" and name == "OrderedDict":
                return collections.OrderedDict
            return lambda *a, **k: None          # optimizer bookkeeping etc. is not needed for inference

        def persistent_load(self, pid):
            _, stype, key = pid[0], pid[1], pid[2]
            return Storage(np.frombuffer(zf.read(f"{prefix}/data/{key}"), dtype=dtypes[stype]))

    ck = Reader(zf.open(f"{prefix}/data.pkl")).load()
    p = {k: np.asarray(v, dtype=np.float32) for k, v in ck["policy"].items()}
    w0, b0, w1, b1, w2, b2 = (p["net.0.weight"], p["net.0.bias"], p["net.2.weight"],
                              p["net.2.bias"], p["net.4.weight"], p["net.4.bias"])

    def q(state):
        h = np.maximum(w0 @ state + b0, 0.0)
        h = np.maximum(w1 @ h + b1, 0.0)
        return (w2 @ h + b2).tolist()

    return q, int(ck["episode"]), "numpy"


def load_policy(path):
    """Return (q_function, episode, backend_name)."""
    try:
        import torch
        from dqn_agent import QNetwork
    except ImportError:
        return _load_numpy(path)
    ck = torch.load(path, map_location="cpu", weights_only=False)     # same call as DQNAgent.load()
    net = QNetwork(STATE_SIZE, ACTION_SIZE)
    net.load_state_dict(ck["policy"])
    net.eval()

    def q(state):
        with torch.no_grad():
            return net(torch.as_tensor(state, dtype=torch.float32).unsqueeze(0))[0].tolist()

    return q, int(ck["episode"]), "pytorch"


# ---------------------------------------------------------------------------------------------
# HTTP service
# ---------------------------------------------------------------------------------------------
def make_handler(q_fn, episode, backend, model_name, quiet):
    lock = threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        server_version = "SmartSignalAI/1.0"

        def _send(self, code, obj):
            body = json.dumps(obj).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, fmt, *args):
            if not quiet:
                sys.stderr.write("[ai] " + fmt % args + "\n")

        def do_GET(self):
            if self.path == "/health":
                self._send(200, {"status": "ok", "model": model_name, "episode": episode, "backend": backend,
                                 "state_size": STATE_SIZE, "action_size": ACTION_SIZE,
                                 "durations": DURATIONS})
            else:
                self._send(404, {"message": "not found"})

        def do_POST(self):
            if self.path != "/predict":
                return self._send(404, {"message": "not found"})
            try:
                length = int(self.headers.get("Content-Length", 0))
            except ValueError:
                length = 0
            if length <= 0 or length > 16384:
                return self._send(400, {"message": "body missing or too large"})
            try:
                state = json.loads(self.rfile.read(length)).get("state")
            except (ValueError, AttributeError):
                return self._send(400, {"message": "body must be JSON like {\"state\": [...]}"})
            if (not isinstance(state, list) or len(state) != STATE_SIZE
                    or not all(isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)
                               for x in state)):
                return self._send(400, {"message": f"state must be a list of {STATE_SIZE} finite numbers"})
            x = np.clip(np.asarray(state, dtype=np.float32), 0.0, 1.0)   # training states are in [0, 1]
            with lock:
                q = q_fn(x)
            action = int(np.argmax(q))
            phase, green = decode_action(action)
            self._send(200, {"action": action, "phase": phase, "green_seconds": green,
                             "q_values": [round(float(v), 4) for v in q], "episode": episode,
                             "backend": backend})

    return Handler


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", default=DEFAULT_MODEL, help="checkpoint to serve")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=5001)
    ap.add_argument("--quiet", action="store_true", help="do not log each request")
    args = ap.parse_args()

    if not os.path.exists(args.model):
        sys.exit(f"Checkpoint not found: {args.model}\nTrain first (python train.py) or pass --model <file>.")
    q_fn, episode, backend = load_policy(args.model)
    server = ThreadingHTTPServer((args.host, args.port),
                                 make_handler(q_fn, episode, backend, os.path.basename(args.model), args.quiet))
    print(f"DQN service ready: {os.path.basename(args.model)} (trained {episode} episodes, {backend}) "
          f"at http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")


if __name__ == "__main__":
    main()
