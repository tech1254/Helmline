# The ready-made sea routes (public/data/routes.json) still match what the pathfinder plans: every
# route is listed, and one in eight is replanned and compared (the tool checks them all without --sample).
import subprocess, sys, os
here = os.path.dirname(os.path.abspath(__file__))
p = subprocess.run(['node', os.path.join(here, 'tools', 'check_routes.mjs'), '--sample', '8'], capture_output=True, text=True)
print(p.stdout + p.stderr)
sys.exit(p.returncode)
