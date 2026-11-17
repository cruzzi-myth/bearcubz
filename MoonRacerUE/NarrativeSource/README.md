# NarrativeSource — reviewable narrative source bundles

Each sub-folder is one **bundle**: JSON files that humans review and version-control, and that the importer reads (never writes).
`TEST_FIXTURE_BUNDLE/` is the only bundle today and is **TEST FIXTURE — NONCANON** (generic placeholders; no Moon Racer canon).

Schema and process: `Docs/Phase3B_P5B0_Content_Pipeline.md`.
After an approved edit, refresh the manifest hashes with `python3 Scripts/Tools/narrative_manifest_sha1.py NarrativeSource/<bundle>` and import with
`UnrealEditor-Cmd MoonRacer.uproject -run=MRNarrativeImport -Source=<absolute bundle dir>` (add `-ValidateOnly` to check without writing, `-Production` to apply production rules).
Do not put Asset Bible files here.
