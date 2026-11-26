"""Ponte local entre o Radar de Sinais (Node) e a IQ Option, usando a biblioteca iqoptionapi.

Só LÊ dados: velas e payout. Esta ponte nunca chama buy/sell: o Radar não envia ordens.
Escuta apenas em 127.0.0.1 (não fica exposta na internet). O servidor Node inicia e reinicia este processo.

Variáveis de ambiente:
  IQ_EMAIL, IQ_PASSWORD   login da IQ Option (use uma conta só para isso)
  IQ_BRIDGE_PORT          porta local (padrão 8765)
  IQ_FAKE=1               modo de teste sem IQ Option (velas aleatórias)
"""
import json, os, sys, time, threading, random, logging
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutTimeout

PORT = int(os.environ.get("IQ_BRIDGE_PORT", "8765"))
FAKE = os.environ.get("IQ_FAKE") == "1"
logging.basicConfig(level=logging.WARNING, format="[iq] %(message)s")

# Nomes da IQ Option para as ações (o resto é o par sem a barra: EUR/USD -> EURUSD)
STOCKS = {"AAPL": "APPLE", "AMZN": "AMAZON", "GOOGL": "GOOGLE", "GOOG": "GOOGLE", "META": "FACEBOOK", "FB": "FACEBOOK", "TSLA": "TESLA", "NFLX": "NFLX:US"}
CUR = {"USD","EUR","GBP","JPY","AUD","CAD","CHF","NZD","SGD","HKD","NOK","SEK","DKK","PLN","TRY","ZAR","MXN","BRL","INR","CNH","RUB","XOF","THB","HUF","CZK","ILS","KES","NGN"}
def category(name):
    if name.endswith("-OTC"): return "otc"
    base = name.split("-")[0]
    if len(base) == 6 and base[:3] in CUR and base[3:] in CUR: return "forex"
    if base.endswith(("USD", "USDT", "EUR")) and base[:-3] not in CUR and base.isalpha() and len(base) <= 9: return "crypto"
    return "other"
def iq_name(sym, otc):
    if "/" not in sym:
        return STOCKS.get(sym, sym)
    base = sym.replace("/", "")
    return base + "-OTC" if otc and not base.endswith("-OTC") else base

class FakeIQ:
    def __init__(self): self.p = {}
    def connect(self): return True, None
    def check_connect(self): return True
    def change_balance(self, m): pass
    def get_candles(self, a, size, count, end):
        out, now = [], int(end)
        t0 = now - now % size - (count - 1) * size
        rnd = random.Random(hash((a, size)) & 0xFFFF)
        p = 1.1
        for i in range(count):
            o = p; c = o * (1 + rnd.uniform(-1, 1) * 0.0008); h = max(o, c) * (1 + rnd.random() * 0.0003); l = min(o, c) * (1 - rnd.random() * 0.0003); p = c
            out.append({"from": t0 + i * size, "open": o, "max": h, "min": l, "close": c})
        # a última vela varia a cada consulta, como a vela em formação
        last = out[-1]; last["close"] = last["open"] * (1 + random.uniform(-1, 1) * 0.0005); last["max"] = max(last["max"], last["close"]); last["min"] = min(last["min"], last["close"])
        return out
    def get_binary_option_detail(self):
        names = ["EURUSD", "GBPUSD", "USDJPY", "AUDCAD", "EURJPY", "EURUSD-OTC", "GBPUSD-OTC", "USDCHF-OTC", "EURJPY-OTC", "NZDUSD-OTC", "BTCUSD", "ETHUSD", "APPLE", "AMAZON", "XAUUSD"]
        d = {}
        for i, n in enumerate(names):
            comm = 8 + (i * 3) % 15
            d[n] = {k: {"enabled": True, "is_suspended": (n == "AUDCAD" and k == "binary"), "option": {"profit": {"commission": comm + (2 if k == "binary" else 0)}}} for k in ("turbo", "binary")}
        return d

state = {"connected": False, "reason": "iniciando", "since": None, "timeouts": 0}
iq = None
pool = ThreadPoolExecutor(max_workers=1)  # a biblioteca não é segura para várias chamadas ao mesmo tempo

def login():
    global iq
    if FAKE:
        iq = FakeIQ()
    else:
        from iqoptionapi.stable_api import IQ_Option
        email, pw = os.environ.get("IQ_EMAIL", ""), os.environ.get("IQ_PASSWORD", "")
        if not email or not pw:
            state.update(connected=False, reason="IQ_EMAIL e IQ_PASSWORD não configurados"); return
        iq = IQ_Option(email, pw)
    ok, reason = iq.connect()
    if ok:
        try: iq.change_balance("PRACTICE")
        except Exception: pass
        state.update(connected=True, reason=None, since=time.time(), timeouts=0)
    else:
        r = str(reason or "falha no login")
        if r == "2FA": r = "a conta usa verificação em duas etapas (2FA); este modo não é suportado"
        elif "invalid_credentials" in r: r = "e-mail ou senha incorretos"
        state.update(connected=False, reason=r)

def call(fn, timeout=20):
    if not state["connected"]: raise RuntimeError(state["reason"] or "desconectado")
    fut = pool.submit(fn)
    try:
        r = fut.result(timeout=timeout); state["timeouts"] = 0; return r
    except FutTimeout:
        state["timeouts"] += 1
        if state["timeouts"] >= 3:
            # a biblioteca pode travar num laço; sair faz o servidor Node reiniciar a ponte
            logging.warning("IQ Option sem resposta, reiniciando a ponte"); os._exit(3)
        raise RuntimeError("IQ Option demorou para responder")

def watchdog():
    wait = 10
    while True:
        time.sleep(wait)
        try:
            if iq is None or not state["connected"] or not iq.check_connect():
                state["connected"] = False; login()
            # login recusado (senha, 2FA): tenta de novo só a cada 10 min, para não bloquear a conta
            r = state["reason"] or ""
            wait = 600 if (not state["connected"] and ("senha" in r or "2FA" in r or "configurados" in r)) else (10 if state["connected"] else 60)
        except Exception as e:
            state.update(connected=False, reason=str(e)); wait = 60

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def send(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code); self.send_header("content-type", "application/json"); self.send_header("content-length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        u = urlparse(self.path); q = {k: v[0] for k, v in parse_qs(u.query).items()}
        try:
            if u.path == "/health":
                return self.send(200, {"ok": True, "connected": state["connected"], "reason": state["reason"], "fake": FAKE})
            if u.path == "/candles":
                sym, otc = q.get("sym", "EUR/USD"), q.get("otc") == "1"
                size, count = int(q.get("size", "60")), max(1, min(1000, int(q.get("count", "300"))))
                name = iq_name(sym, otc)
                data = call(lambda: iq.get_candles(name, size, count, time.time()))
                if not data: return self.send(404, {"error": "ativo " + name + " não encontrado na IQ Option"})
                rows = [[int(k["from"]) * 1000, float(k["open"]), float(k["max"]), float(k["min"]), float(k["close"])] for k in data]
                return self.send(200, {"asset": name, "candles": rows})
            if u.path in ("/assets", "/payouts"):
                # ativos de opções binárias/turbo da IQ Option, com status e payout (100 - comissão)
                det = call(lambda: iq.get_binary_option_detail(), timeout=40)
                out = []
                for name, kinds in det.items():
                    a = {"name": name, "cat": category(name), "open": False, "payout": {}}
                    for k in ("turbo", "binary"):
                        v = kinds.get(k) or {}
                        if not v: continue
                        if v.get("enabled") and not v.get("is_suspended"): a["open"] = True
                        try: a["payout"][k] = round(100 - float(v["option"]["profit"]["commission"]))
                        except Exception: pass
                    out.append(a)
                out.sort(key=lambda a: (["forex", "otc", "crypto", "other"].index(a["cat"]), a["name"]))
                return self.send(200, {"assets": out})
            self.send(404, {"error": "rota"})
        except Exception as e:
            self.send(503, {"error": str(e)})

if __name__ == "__main__":
    threading.Thread(target=lambda: (login(), watchdog()), daemon=True).start()
    print("[iq] ponte ouvindo em 127.0.0.1:%d%s" % (PORT, " (modo teste)" if FAKE else ""), flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
