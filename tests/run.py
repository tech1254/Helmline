#!/usr/bin/env python3
"""Run Helmline's browser tests.

Starts the local stand-in for Cloudflare (tests/mock/server.mjs: the real Worker, with
SQLite standing in for D1), then runs every tests/test_*.py against it in headless
Chromium. Screenshots go to tests/output/.

    python3 tests/run.py              # everything
    python3 tests/run.py ledger fleet # only tests whose names contain these words
    python3 tests/run.py -v           # show each test's output
"""
import os, subprocess, sys, time, urllib.request, glob

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
PORT = int(os.environ.get('PORT', '8787'))
URL = f'http://localhost:{PORT}/'
OUT = os.path.join(HERE, 'output')


def failed(out, code):
    if code != 0 or 'Traceback' in out:
        return True
    for line in out.splitlines():
        low = line.strip().lower()
        if low.startswith('errors') and '[]' not in low:
            return True
    return False


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('-')]
    verbose = '-v' in sys.argv
    tests = sorted(glob.glob(os.path.join(HERE, 'test_*.py')))
    if args:
        tests = [t for t in tests if any(a in os.path.basename(t) for a in args)]
    os.makedirs(OUT, exist_ok=True)
    server = subprocess.Popen(['node', os.path.join(HERE, 'mock', 'server.mjs'), REPO],
                              env={**os.environ, 'PORT': str(PORT)}, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        for _ in range(50):
            try:
                urllib.request.urlopen(URL, timeout=1)
                break
            except Exception:
                time.sleep(0.2)
        else:
            sys.exit('The mock server did not start (it needs Node 22.5 or later for node:sqlite).')
        env = {**os.environ, 'HELMLINE_URL': URL, 'HELMLINE_OUT': OUT}
        bad = []
        for t in tests:
            name = os.path.basename(t)[5:-3]
            start = time.time()
            p = subprocess.run([sys.executable, t, OUT], env=env, capture_output=True, text=True, timeout=600)
            out = p.stdout + p.stderr
            ok = not failed(out, p.returncode)
            print(f"{'ok  ' if ok else 'FAIL'} {name:28} {time.time() - start:5.1f}s")
            if verbose or not ok:
                print('    ' + out.strip().replace('\n', '\n    '))
            if not ok:
                bad.append(name)
        print(f'\n{len(tests) - len(bad)} of {len(tests)} passed' + (f'; failed: {", ".join(bad)}' if bad else ''))
        sys.exit(1 if bad else 0)
    finally:
        server.terminate()


if __name__ == '__main__':
    main()
