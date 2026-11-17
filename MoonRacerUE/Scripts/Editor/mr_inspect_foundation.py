"""Moon Racer - read-only Editor inspection of the Epic Mannequin foundation assets.
Run:  UnrealEditor-Cmd MoonRacer.uproject -ExecutePythonScript=<this file> -stdout -unattended -nosplash -NullRHI
Prints MRINSPECT| lines. Does not save or modify any asset."""
import unreal

def out(*a):
    unreal.log("MRINSPECT| " + " ".join(str(x) for x in a))

def tryit(label, fn):
    try:
        return fn()
    except Exception as e:
        out(label, "EXC", repr(e)[:200])
        return None

base = "/Game/Characters/Mannequins/"
paths = {
 "skeleton": base + "Meshes/SK_Mannequin",
 "manny": base + "Meshes/SKM_Manny_Simple",
 "quinn": base + "Meshes/SKM_Quinn_Simple",
 "abp": base + "Anims/Unarmed/ABP_Unarmed",
 "bs": base + "Anims/Unarmed/BS_Idle_Walk_Run",
}
assets = {}
for k, p in paths.items():
    a = unreal.load_asset(p)
    assets[k] = a
    out("LOAD", k, p, "OK" if a else "MISSING", type(a).__name__ if a else "")

# --- skeleton / meshes
sk = assets["skeleton"]
if sk:
    sockets = tryit("skeleton.sockets", lambda: sk.get_editor_property("sockets"))
    out("SKELETON.sockets", [str(s.get_editor_property("socket_name")) + "->" + str(s.get_editor_property("bone_name")) for s in (sockets or [])])
for k in ("manny", "quinn"):
    m = assets[k]
    if not m: continue
    skel = tryit(k + ".skeleton", lambda: m.get_editor_property("skeleton"))
    out(k.upper(), "skeleton=", skel.get_path_name() if skel else None)
    mats = tryit(k + ".materials", lambda: m.get_editor_property("materials"))
    out(k.upper(), "material_slots=", [(str(s.get_editor_property("material_slot_name")), s.get_editor_property("material_interface").get_name() if s.get_editor_property("material_interface") else None) for s in (mats or [])])
    out(k.upper(), "mesh_sockets=", [str(s.get_editor_property("socket_name")) for s in (tryit(k + ".msockets", lambda: m.get_editor_property("socket_array")) or [])])
    out(k.upper(), "morph_targets=", len(tryit(k + ".morphs", lambda: m.get_editor_property("morph_targets")) or []))
    bounds = tryit(k + ".bounds", lambda: m.get_bounds())
    out(k.upper(), "bounds_extent=", bounds.box_extent if bounds else None)
    lods = tryit(k + ".lods", lambda: unreal.SkeletalMeshEditorSubsystem().get_lod_count(m))
    out(k.upper(), "lod_count=", lods)
    num_bones = tryit(k + ".bonecount", lambda: len(unreal.SkeletalMeshEditorSubsystem().get_bone_names(m)) if hasattr(unreal.SkeletalMeshEditorSubsystem(), "get_bone_names") else None)

# bone list via skeleton modifiers helper
bones = tryit("bones", lambda: unreal.AnimationLibrary.get_bone_names(sk) if hasattr(unreal.AnimationLibrary, "get_bone_names") else None)
if bones is None and assets["manny"]:
    bones = tryit("bones2", lambda: [str(b) for b in unreal.SkeletalMeshEditorSubsystem().get_bone_names(assets["manny"])])
out("BONES.count=", len(bones) if bones else "unavailable via python API")
if bones:
    want = ["root", "pelvis", "spine_04", "spine_02", "head", "neck_02", "hand_r", "hand_l", "weapon_r", "weapon_l", "interaction", "foot_l", "foot_r", "ik_foot_root"]
    names = [str(b) for b in bones]
    out("BONES.required_present=", {w: (w in names) for w in want})

# --- blend space
bs = assets["bs"]
if bs:
    for prop in ("axis_to_scale_animation",):
        pass
    for i, label in ((0, "X"), (1, "Y")):
        pass
    params = tryit("bs.params", lambda: [bs.get_editor_property("blend_parameters")])
    out("BS.blend_parameters=", params)
    samples = tryit("bs.samples", lambda: bs.get_editor_property("sample_data"))
    out("BS.sample_count=", len(samples) if samples is not None else "n/a")
    for s in (samples or []):
        anim = s.get_editor_property("animation")
        out("BS.sample", anim.get_name() if anim else None, s.get_editor_property("sample_value"))
    ds = tryit("bs.dims", lambda: bs.get_blend_parameter(0))
    out("BS.param0=", ds, " param1=", tryit("bs.p1", lambda: bs.get_blend_parameter(1)))

# --- animation clips
clips = {
 "Idle": "Unarmed/MM_Idle", "WalkFwd": "Unarmed/Walk/MF_Unarmed_Walk_Fwd", "JogFwd": "Unarmed/Jog/MF_Unarmed_Jog_Fwd",
 "Jump": "Unarmed/Jump/MM_Jump", "FallLoop": "Unarmed/Jump/MM_Fall_Loop", "Land": "Unarmed/Jump/MM_Land",
}
for k, rel in clips.items():
    a = unreal.load_asset(base + "Anims/" + rel)
    if not a:
        out("CLIP", k, "MISSING"); continue
    out("CLIP", k, a.get_name(), "len=%.3fs" % a.get_editor_property("sequence_length") if hasattr(a, "get_editor_property") else "",
        "rate_scale=", tryit("rs", lambda: a.get_editor_property("rate_scale")),
        "loop=", tryit("loop", lambda: a.get_editor_property("loop")),
        "root_motion=", tryit("rm", lambda: a.get_editor_property("enable_root_motion")),
        "skeleton=", tryit("sk", lambda: a.get_editor_property("skeleton").get_name()))

# --- ABP
abp = assets["abp"]
if abp:
    out("ABP.target_skeleton=", tryit("abp.sk", lambda: abp.get_editor_property("target_skeleton").get_path_name()))
    gc = tryit("abp.gc", lambda: abp.generated_class())
    out("ABP.generated_class=", gc.get_name() if gc else None)
    out("ABP.parent_class=", tryit("abp.parent", lambda: abp.get_editor_property("parent_class").get_name()))

# --- asset registry dependency check (reuse proof)
ar = unreal.AssetRegistryHelpers.get_asset_registry()
opts = unreal.AssetRegistryDependencyOptions()
deps = ar.get_dependencies(unreal.Name(paths["abp"]), opts) or []
out("ABP.dependencies=", sorted(str(d) for d in deps if str(d).startswith("/Game")))
out("DONE")
