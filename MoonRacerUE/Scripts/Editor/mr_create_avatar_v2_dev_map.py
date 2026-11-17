"""AV2 I1+I2: create the Avatar Creator V2 DEVELOPMENT map and its three development materials. New assets only - never overwrites.
 /Game/MoonRacer/AvatarV2Dev/M_MR_AV2Dev_Lit, _Emissive, _Translucent  : clearly labelled development materials (NONCANON)
 /Game/MoonRacer/Maps/L_MR_AvatarCreatorV2Dev                          : near-empty map; game mode = AMRAvatarV2GameMode; the chamber graybox
                                                                         is built at runtime by AMRAvatarV2Chamber (primitives only).
It does NOT touch the default map, the default game mode, or any existing asset.
Run: UnrealEditor-Cmd <abs MoonRacer.uproject> -ExecutePythonScript=<this file> -stdout -unattended -nosplash -NullRHI"""
import unreal
def out(*a): unreal.log("MRAV2ASSET| " + " ".join(str(x) for x in a))
eal = unreal.EditorAssetLibrary
mel = unreal.MaterialEditingLibrary
DIR = "/Game/MoonRacer/AvatarV2Dev"
MAP = "/Game/MoonRacer/Maps/L_MR_AvatarCreatorV2Dev"

def node(m, cls, x, y): return mel.create_material_expression(m, cls, x, y)
def vec(m, name, color, x, y):
    n = node(m, unreal.MaterialExpressionVectorParameter, x, y); n.set_editor_property("parameter_name", name); n.set_editor_property("default_value", unreal.LinearColor(*color)); return n
def sca(m, name, val, x, y):
    n = node(m, unreal.MaterialExpressionScalarParameter, x, y); n.set_editor_property("parameter_name", name); n.set_editor_property("default_value", val); return n

def make(name, kind):
    path = DIR + "/" + name
    if eal.does_asset_exist(path):
        out("exists; not touched", path); return
    m = unreal.AssetToolsHelpers.get_asset_tools().create_asset(name, DIR, unreal.Material, unreal.MaterialFactoryNew())
    m.set_editor_property("two_sided", True)
    if kind == "lit":
        c = vec(m, "Color", (0.05, 0.05, 0.07, 1), -600, 0); mel.connect_material_property(c, "", unreal.MaterialProperty.MP_BASE_COLOR)
        mt = sca(m, "Metallic", 0.6, -600, 200); mel.connect_material_property(mt, "", unreal.MaterialProperty.MP_METALLIC)
        ro = sca(m, "Roughness", 0.45, -600, 300); mel.connect_material_property(ro, "", unreal.MaterialProperty.MP_ROUGHNESS)
    else:
        m.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_UNLIT)
        c = vec(m, "Color", (0.0, 0.75, 1.0, 1), -700, 0); e = sca(m, "Emissive", 4.0, -700, 200)
        mul = node(m, unreal.MaterialExpressionMultiply, -450, 50)
        mel.connect_material_expressions(c, "", mul, "A"); mel.connect_material_expressions(e, "", mul, "B")
        mel.connect_material_property(mul, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
        if kind == "translucent":
            m.set_editor_property("blend_mode", unreal.BlendMode.BLEND_TRANSLUCENT)
            o = sca(m, "Opacity", 0.1, -450, 250); mel.connect_material_property(o, "", unreal.MaterialProperty.MP_OPACITY)
    mel.recompile_material(m)
    eal.save_asset(path)
    out("created", path)

make("M_MR_AV2Dev_Lit", "lit")
make("M_MR_AV2Dev_Emissive", "emissive")
make("M_MR_AV2Dev_Translucent", "translucent")

if eal.does_asset_exist(MAP):
    out("map already exists; not touched", MAP)
else:
    les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem); eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    les.new_level(MAP)
    world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
    def sp(c, l=(0, 0, 0), rot=(0, 0, 0)): return eas.spawn_actor_from_class(c, unreal.Vector(*l), unreal.Rotator(roll=rot[0], pitch=rot[1], yaw=rot[2]))
    sp(unreal.PlayerStart, (0, 0, 130)).set_actor_label("DEV_PlayerStart")
    sp(unreal.MRAvatarV2Chamber, (0, 0, 0)).set_actor_label("DEV_AvatarV2_Chamber_Graybox")
    world.get_world_settings().set_editor_property("default_game_mode", unreal.MRAvatarV2GameMode)
    les.save_current_level(); out("map created", MAP)
out("DONE")
