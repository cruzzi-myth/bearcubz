"""Moon Racer Phase 3A - create the shared humanoid foundation assets under /Game/MoonRacer/.
Creates ONLY new assets. Never modifies or saves any Epic template asset.
Run: UnrealEditor-Cmd MoonRacer.uproject -ExecutePythonScript=<this file> -stdout -unattended -nosplash -NullRHI
Idempotent: existing MoonRacer assets are left as they are (delete them in the Editor to regenerate)."""
import unreal

def out(*a):
    unreal.log("MRCREATE| " + " ".join(str(x) for x in a))

eal = unreal.EditorAssetLibrary
tools = unreal.AssetToolsHelpers.get_asset_tools()

ROOT = "/Game/MoonRacer"
CH = ROOT + "/Characters"
ANIM_SRC = "/Game/Characters/Mannequins/Anims/Unarmed/ABP_Unarmed"
ANIM_DST = CH + "/Animation/ABP_MR_Humanoid"
DA_PATH = CH + "/Data/DA_MR_HumanoidAttachmentPoints"
BP_CHAR = CH + "/Blueprints/BP_MR_PlayerCharacter"
BP_GM = CH + "/Blueprints/BP_MR_GameMode"
import os
MAP = os.environ.get("MR_MAP_PATH", ROOT + "/Maps/L_MR_AnimationTest")  # override to generate a disposable copy

for d in (CH + "/Animation", CH + "/Blueprints", CH + "/Data", ROOT + "/Maps"):
    eal.make_directory(d)

# 1) Animation Blueprint: a COPY of the Epic ABP. It keeps pointing at the original Blend Space,
#    idle/jump/fall/land clips, SK_Mannequin and CR_Mannequin_FootIK - nothing duplicated but the graph.
if not eal.does_asset_exist(ANIM_DST):
    ok = eal.duplicate_asset(ANIM_SRC, ANIM_DST)
    out("ABP duplicate", ANIM_DST, "OK" if ok else "FAILED")
else:
    out("ABP exists", ANIM_DST)

# 2) Attachment point data asset (bone + offset, no skeleton edits)
POINTS = [
    # id, bone, (x,y,z) local offset, purpose
    ("MR_Head_Top",     "head",     (0, 0, 0), "headgear"),
    ("MR_Head_Face",    "head",     (0, 0, 0), "visor / glasses"),
    ("MR_Chest",        "spine_04", (0, 0, 0), "chest device"),
    ("MR_Back_Upper",   "spine_04", (0, 0, 0), "back accessory (upper)"),
    ("MR_Back_Lower",   "spine_02", (0, 0, 0), "back accessory (lower)"),
    ("MR_Hip_L",        "pelvis",   (0, 0, 0), "holster / belt item"),
    ("MR_Hip_R",        "pelvis",   (0, 0, 0), "holster / belt item"),
    ("MR_Hand_R_Grip",  "hand_r",   (0, 0, 0), "hand-held item"),
    ("MR_Hand_L_Grip",  "hand_l",   (0, 0, 0), "hand-held item"),
]
if not eal.does_asset_exist(DA_PATH):
    da = tools.create_asset("DA_MR_HumanoidAttachmentPoints", CH + "/Data", unreal.MRAttachmentPointSet, unreal.DataAssetFactory())
    pts = []
    for pid, bone, loc, purpose in POINTS:
        d = unreal.MRAttachmentPointDef()
        d.set_editor_property("point_id", pid)
        d.set_editor_property("bone_name", bone)
        d.set_editor_property("relative_transform", unreal.Transform(location=unreal.Vector(*loc), rotation=unreal.Rotator(0, 0, 0), scale=unreal.Vector(1, 1, 1)))
        d.set_editor_property("purpose", purpose)
        pts.append(d)
    da.set_editor_property("points", pts)
    eal.save_loaded_asset(da)
    out("DA created", DA_PATH, len(pts), "points")
else:
    out("DA exists", DA_PATH)
da = unreal.load_asset(DA_PATH)

# 3) Player character Blueprint
if not eal.does_asset_exist(BP_CHAR):
    f = unreal.BlueprintFactory()
    f.set_editor_property("parent_class", unreal.MRPlayerCharacter)
    bp = tools.create_asset("BP_MR_PlayerCharacter", CH + "/Blueprints", unreal.Blueprint, f)
    out("BP created", BP_CHAR)
else:
    bp = unreal.load_asset(BP_CHAR)
    out("BP exists", BP_CHAR)

cdo = unreal.get_default_object(bp.generated_class())
abp_cls = eal.load_blueprint_class(ANIM_DST)
cdo.set_editor_property("humanoid_anim_class", abp_cls)
cdo.set_editor_property("dev_body_meshes", [
    unreal.load_asset("/Game/Characters/Mannequins/Meshes/SKM_Manny_Simple"),
    unreal.load_asset("/Game/Characters/Mannequins/Meshes/SKM_Quinn_Simple"),
])
cdo.set_editor_property("attachment_points", da)
cdo.set_editor_property("jump_action", unreal.load_asset("/Game/Input/Actions/IA_Jump"))
cdo.set_editor_property("move_action", unreal.load_asset("/Game/Input/Actions/IA_Move"))
cdo.set_editor_property("look_action", unreal.load_asset("/Game/Input/Actions/IA_Look"))
cdo.set_editor_property("mouse_look_action", unreal.load_asset("/Game/Input/Actions/IA_MouseLook"))
unreal.BlueprintEditorLibrary.compile_blueprint(bp)
eal.save_loaded_asset(bp)
out("BP configured + compiled")

# 4) Game mode (default pawn = our character; controller = the unmodified template controller that maps IMC_Default/IMC_MouseLook)
if not eal.does_asset_exist(BP_GM):
    f = unreal.BlueprintFactory()
    f.set_editor_property("parent_class", unreal.MoonRacerGameMode)
    gm = tools.create_asset("BP_MR_GameMode", CH + "/Blueprints", unreal.Blueprint, f)
else:
    gm = unreal.load_asset(BP_GM)
gcdo = unreal.get_default_object(gm.generated_class())
gcdo.set_editor_property("default_pawn_class", bp.generated_class())
pc_cls = eal.load_blueprint_class("/Game/ThirdPerson/Blueprints/BP_ThirdPersonPlayerController")
gcdo.set_editor_property("player_controller_class", pc_cls)
unreal.BlueprintEditorLibrary.compile_blueprint(gm)
eal.save_loaded_asset(gm)
out("GameMode configured", BP_GM)

# 5) Animation test level (new level; template levels untouched)
les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
if not eal.does_asset_exist(MAP):
    les.new_level(MAP)
    world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
    def spawn(cls, loc=(0, 0, 0), rot=(0, 0, 0)):
        # rot is (roll, pitch, yaw) - the argument order unreal.Rotator() expects.
        return eas.spawn_actor_from_class(cls, unreal.Vector(*loc), unreal.Rotator(roll=rot[0], pitch=rot[1], yaw=rot[2]))

    floor = spawn(unreal.StaticMeshActor, (0, 0, -50))
    floor.set_actor_label("DEV_Floor")
    floor.static_mesh_component.set_static_mesh(unreal.load_asset("/Engine/BasicShapes/Cube"))
    floor.set_actor_scale3d(unreal.Vector(100, 100, 1))
    floor.static_mesh_component.set_material(0, unreal.load_asset("/Engine/EngineMaterials/WorldGridMaterial"))

    ps = spawn(unreal.PlayerStart, (0, 0, 100)); ps.set_actor_label("PlayerStart")
    sun = spawn(unreal.DirectionalLight, (0, 0, 500), (0, -45, 35)); sun.set_actor_label("DEV_Sun")
    sun.get_component_by_class(unreal.DirectionalLightComponent).set_editor_property("mobility", unreal.ComponentMobility.MOVABLE)
    spawn(unreal.SkyAtmosphere, (0, 0, 0)).set_actor_label("DEV_SkyAtmosphere")
    sky = spawn(unreal.SkyLight, (0, 0, 300)); sky.set_actor_label("DEV_SkyLight")
    skc = sky.get_component_by_class(unreal.SkyLightComponent)
    skc.set_editor_property("mobility", unreal.ComponentMobility.MOVABLE)
    skc.set_editor_property("real_time_capture", True)

    # Development-only previews: Manny and Quinn, clearly labelled as placeholders.
    for idx, (label, y) in enumerate((("DEV PLACEHOLDER: Manny (Epic mannequin)", -140), ("DEV PLACEHOLDER: Quinn (Epic mannequin)", 140))):
        pv = spawn(bp.generated_class(), (-260, y, 100), (0, 0, 0))
        pv.set_actor_label("DEV_Preview_" + ("Manny" if idx == 0 else "Quinn"))
        pv.set_editor_property("initial_body_index", idx)
        pv.set_editor_property("auto_possess_player", unreal.AutoReceiveInput.DISABLED)
        tx = spawn(unreal.TextRenderActor, (-260, y, 230), (0, 0, 0))
        tx.set_actor_label("DEV_Label_" + str(idx))
        tx.text_render.set_editor_property("text", label)
        tx.text_render.set_editor_property("world_size", 9)
        tx.text_render.set_editor_property("horizontal_alignment", unreal.HorizTextAligment.EHTA_CENTER)

    drv = spawn(unreal.MRAnimationTestDriver, (0, 0, 50)); drv.set_actor_label("DEV_AnimationTestDriver")

    ws = world.get_world_settings()
    ws.set_editor_property("default_game_mode", gm.generated_class())
    les.save_current_level()
    out("Level created", MAP)
else:
    out("Level exists", MAP)

eal.save_directory(ROOT)
out("DONE")
