#!/usr/bin/env python3
"""Authoring/review helper (NOT used by the importer, which never writes source files).
Recomputes the "sha1" of every file listed in a narrative bundle's bundle.json and rewrites bundle.json.
Run it only as part of a reviewed change:   python3 Scripts/Tools/narrative_manifest_sha1.py NarrativeSource/<BUNDLE>"""
import hashlib, json, os, sys
d = sys.argv[1]
mp = os.path.join(d, "bundle.json")
m = json.load(open(mp))
for f in m["files"]:
    f["sha1"] = hashlib.sha1(open(os.path.join(d, f["path"]), "rb").read()).hexdigest()
open(mp, "w").write(json.dumps(m, indent=2) + "\n")
print("updated", mp)
