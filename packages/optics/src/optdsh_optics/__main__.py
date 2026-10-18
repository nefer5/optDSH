"""Wheel commands: serve, mcp, worker, tx-native-worker."""
import sys

def main():
    commands={'serve':'server','mcp':'mcp','worker':'capture','tx-native-worker':'tx_worker'}
    if len(sys.argv)<2 or sys.argv[1] not in commands:
        print('Usage: python -m optdsh_optics {serve|mcp|worker|tx-native-worker} [options]')
        raise SystemExit(0 if '--help' in sys.argv else 2)
    import importlib
    command=sys.argv.pop(1)
    importlib.import_module('.'+commands[command],__package__).main()

if __name__=='__main__':main()
