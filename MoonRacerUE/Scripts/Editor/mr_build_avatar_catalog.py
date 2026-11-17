"""Build /Game/MoonRacer/Avatar/DA_MR_AvatarCatalog from the canonical JSON export
(Scripts/Data/avatar_catalog.canonical.json, generated from network-app/src by Scripts/Tools/export_avatar_catalog.mjs).

 - Canonical IDs (species, hair, eyes, outfits, signal accents, human accessories/headwear) come ONLY from that JSON.
   They are Pending: no 3D assets exist for them, so they are never applied or offered in the creator.
 - 'dev_*' entries are development stand-ins that exist in Unreal today (Epic Manny/Quinn, primitive marker props on the
   nine Moon Racer attachment points, mannequin material variants). They are NOT canonical designs.
Creates/overwrites ONLY the catalog asset."""
import json, os, unreal

def out(*a): unreal.log("MRCATALOG| " + " ".join(str(x) for x in a))
eal = unreal.EditorAssetLibrary
PATH = "/Game/MoonRacer/Avatar/DA_MR_AvatarCatalog"
src = os.path.join(unreal.Paths.project_dir(), "Scripts/Data/avatar_catalog.canonical.json")
data = json.load(open(src))
S = unreal.MRAvatarAssetStatus

def opt(id_, label, status, note=""):
    o = unreal.MRAvatarOption()
    o.set_editor_property("id", id_); o.set_editor_property("display_name", label)
    o.set_editor_property("status", status); o.set_editor_property("note", note)
    return o

eal.make_directory("/Game/MoonRacer/Avatar")
if eal.does_asset_exist(PATH):
    cat = unreal.load_asset(PATH)
else:
    cat = unreal.AssetToolsHelpers.get_asset_tools().create_asset("DA_MR_AvatarCatalog", "/Game/MoonRacer/Avatar", unreal.MRAvatarCatalog, unreal.DataAssetFactory())

# species: the six canonical IDs, all Unassessed (no 3D model exists for any of them)
species = []
for s in data["species"]:
    e = unreal.MRSpeciesEntry()
    e.set_editor_property("id", s["id"]); e.set_editor_property("display_name", s["displayName"])
    e.set_editor_property("assessment", unreal.MRSpeciesAssessment.UNASSESSED)
    e.set_editor_property("note", "No 3D model has been assessed for this species.")
    species.append(e)
cat.set_editor_property("species", species)

# bodies: Epic mannequins as clearly-labelled dev placeholders
manny = opt("dev_manny", "Manny (dev placeholder)", S.DEV_PLACEHOLDER, "Epic mannequin. Not a Moon Racer design.")
manny.set_editor_property("body_mesh", unreal.load_asset("/Game/Characters/Mannequins/Meshes/SKM_Manny_Simple"))
quinn = opt("dev_quinn", "Quinn (dev placeholder)", S.DEV_PLACEHOLDER, "Epic mannequin. Not a Moon Racer design.")
quinn.set_editor_property("body_mesh", unreal.load_asset("/Game/Characters/Mannequins/Meshes/SKM_Quinn_Simple"))
cat.set_editor_property("bodies", [manny, quinn])

# canonical, 3D-pending slots
cat.set_editor_property("hair", [opt(x["id"], x["label"], S.PENDING, "canonical web ID; no 3D asset") for x in data["hair"]])
cat.set_editor_property("eyes", [opt(x["id"], x["label"], S.PENDING, "canonical web ID; no 3D asset") for x in data["eyes"]])
cat.set_editor_property("outfits", [opt(x["id"], x["label"], S.PENDING, "canonical web ID; no 3D asset") for x in data["outfits"]])
cat.set_editor_property("signal_accents", [opt(x["id"], x["label"], S.PENDING, "canonical web ID; no 3D asset") for x in data["signalAccents"]])

# accessories: canonical (pending) + dev rigid markers on the nine Moon Racer attachment points
acc = [opt(x["id"], x["label"], S.PENDING, "canonical Human accessory ID; no 3D asset") for x in data["humanAccessories"]]
acc += [opt(x["id"], x["label"], S.PENDING, "canonical Human headwear ID; no 3D asset") for x in data["humanHeadwear"]]
TINTS = {'MR_Head_Top':(1,0.05,0.05,1),'MR_Head_Face':(1,0.9,0,1),'MR_Chest':(0.05,0.9,0.1,1),'MR_Back_Upper':(0.1,0.2,1,1),'MR_Back_Lower':(0,0.9,0.9,1),'MR_Hip_L':(1,0,0.9,1),'MR_Hip_R':(1,0.45,0,1),'MR_Hand_R_Grip':(1,1,0.3,1),'MR_Hand_L_Grip':(0.5,0,0.8,1)}  # dev-only identification colours
shapes = ["/Engine/BasicShapes/Cube", "/Engine/BasicShapes/Sphere", "/Engine/BasicShapes/Cylinder"]
points = [("MR_Head_Top","Head top"),("MR_Head_Face","Head face"),("MR_Chest","Chest"),("MR_Back_Upper","Upper back"),("MR_Back_Lower","Lower back"),("MR_Hip_L","Hip left"),("MR_Hip_R","Hip right"),("MR_Hand_R_Grip","Right hand"),("MR_Hand_L_Grip","Left hand")]
for i, (pid, label) in enumerate(points):
    o = opt("dev_marker_" + pid[3:].lower(), label + " marker (dev prop)", S.DEV_PLACEHOLDER, "Primitive test prop on a rigid attachment point. Not an accessory design.")
    o.set_editor_property("attachment_point_id", pid)
    o.set_editor_property("accessory_mesh", unreal.load_asset(shapes[i % 3]))
    o.set_editor_property("accessory_scale", unreal.Vector(0.1, 0.1, 0.1))
    o.set_editor_property("dev_tint", unreal.LinearColor(*TINTS[pid]))
    acc.append(o)
cat.set_editor_property("accessories", acc)

# material variants (mannequin materials; no override = the mesh's own materials)
v0 = opt("dev_default", "Default materials", S.DEV_PLACEHOLDER)
v1 = opt("dev_alt", "Alternate mannequin material", S.DEV_PLACEHOLDER, "Swaps material slot 0 to the mannequin's second material instance.")
bindings = []
for body, mat in (("dev_manny", "/Game/Characters/Mannequins/Materials/Manny/MI_Manny_02_New"), ("dev_quinn", "/Game/Characters/Mannequins/Materials/Quinn/MI_Quinn_02")):
    b = unreal.MRMaterialBinding(); b.set_editor_property("body_id", body); b.set_editor_property("slot_index", 0); b.set_editor_property("material", unreal.load_asset(mat)); bindings.append(b)
v1.set_editor_property("material_bindings", bindings)
cat.set_editor_property("material_variants", [v0, v1])

cat.set_editor_property("default_species_id", "human")
cat.set_editor_property("default_body_id", "dev_manny")
cat.set_editor_property("default_material_variant_id", "dev_default")
eal.save_loaded_asset(cat)
out("saved", PATH, "species=%d bodies=2 hair=%d eyes=%d outfits=%d accents=%d accessories=%d variants=2" % (len(species), len(data["hair"]), len(data["eyes"]), len(data["outfits"]), len(data["signalAccents"]), len(acc)))
