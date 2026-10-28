# Ports grow with history, harbour works deepen berths, river bars rise in the rains, and a deep
# ship keeps off the banks (rules checked in Node, see tests/tools/check_ports.mjs).
import subprocess, sys, os
here = os.path.dirname(os.path.abspath(__file__))
p = subprocess.run(['node', os.path.join(here, 'tools', 'check_ports.mjs')], capture_output=True, text=True)
print(p.stdout + p.stderr)
sys.exit(p.returncode)
