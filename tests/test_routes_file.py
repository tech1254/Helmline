# The ready-made sea routes (public/data/routes.json) still match what the pathfinder plans.
import subprocess, sys, os
here = os.path.dirname(os.path.abspath(__file__))
p = subprocess.run(['node', os.path.join(here, 'tools', 'check_routes.mjs')], capture_output=True, text=True)
print(p.stdout + p.stderr)
sys.exit(p.returncode)
