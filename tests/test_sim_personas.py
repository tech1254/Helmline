# The simulated players still run on the game's current code: a short career for each persona,
# checking that the books balance and that corsairs and contracts both still happen.
# (The full tuning runs are tests/sim/personas.mjs; this only keeps the simulator working.)
import subprocess, json, os
here = os.path.dirname(os.path.abspath(__file__))
p = subprocess.run(['node', os.path.join(here, 'sim', 'personas.mjs'), '--runs', '1', '--years', '15', '--json'],
                   capture_output=True, text=True, timeout=600)
errors = []
if p.returncode:
    errors.append(p.stderr[-2000:])
else:
    for s in json.loads(p.stdout):
        name = s['persona']
        print(f"{name:10} worth {round(s['worth'][str(s['end'])]):>8}  contracts {s['contracts']['done']:.0f}/{s['contracts']['taken']:.0f}  corsairs {s['corsairs']['met']:.0f}")
        if s['corsairs']['met'] < 1:
            errors.append(f'{name}: no corsairs in 15 years')
        if name != 'merchant' and s['contracts']['taken'] < 1:
            errors.append(f'{name}: took no contracts')
        if name == 'merchant' and s['contracts']['taken']:
            errors.append('merchant took contracts')
        if name == 'runner' and (s['corsairs']['fight'] or s['corsairs']['pay']):
            errors.append('runner chose to fight or pay')
print('ERRORS', errors)
