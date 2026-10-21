#!/usr/bin/env python3
"""Install only Platter One's two mapping files; refuse to replace different files."""
import argparse
from pathlib import Path
import shutil
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--destination', type=Path, help='Explicit Mixxx controllers directory')
    parser.add_argument('--check', action='store_true', help='Inspect without writing')
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    candidates = [
        Path.home() / 'Library/Containers/org.mixxx.mixxx/Data/Library/Application Support/Mixxx/controllers',
        Path.home() / 'Library/Application Support/Mixxx/controllers',
    ]
    destination = args.destination
    if destination is None:
        existing = [p for p in candidates if p.is_dir()]
        if len(existing) != 1:
            sys.exit('Cannot choose one Mixxx profile. Pass --destination explicitly.')
        destination = existing[0]
    sources = [root / 'mixxx' / name for name in ('Platter-One.midi.xml', 'Platter-One-scripts.js')]
    for source in sources:
        target = destination / source.name
        if target.exists() and target.read_bytes() != source.read_bytes():
            sys.exit(f'Refusing to replace different file: {target}. Review and back it up first.')
    for source in sources:
        target = destination / source.name
        if args.check:
            print(('Matches: ' if target.exists() else 'Would install: ') + str(target))
        else:
            destination.mkdir(parents=True, exist_ok=True)
            if not target.exists():
                shutil.copy2(source, target)
            if target.read_bytes() != source.read_bytes():
                sys.exit(f'Verification failed: {target}')
            print(f'Verified: {target}')
    if not args.check:
        print('Enable Platter One in Mixxx Preferences > Controllers after starting the bridge.')


if __name__ == '__main__':
    main()
