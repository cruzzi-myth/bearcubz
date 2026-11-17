"""Create the Phase 3A avatar Blueprints and test maps under /Game/MoonRacer/. New assets only; Epic assets untouched.
 BP_MR_AvatarPlayerCharacter : child of BP_MR_PlayerCharacter that loads the saved avatar at BeginPlay
 BP_MR_AvatarCreatorGameMode : avatar pawn + AMRAvatarCreatorController (UMG Avatar Creator)
 BP_MR_AvatarSpawnGameMode   : avatar pawn + the template player controller (normal movement)
 L_MR_AvatarCreator / L_MR_AvatarSpawnTest : lit dev maps (sun pitch -45 / yaw 35 via roll,pitch,yaw order)
Idempotent: existing assets are left as they are."""
import unreal
def out(*a): unreal.log("MRAVATAR| " + " ".join(str(x) for x in a))
eal = unreal.EditorAssetLibrary; tools = unreal.AssetToolsHelpers.get_asset_tools()
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem); les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
BP = "/Game/MoonRacer/Characters/Blueprints"; MAPS = "/Game/MoonRacer/Maps"

def make_bp(name, parent_cls):
    path = BP + "/" + name
    if eal.does_asset_exist(path): return unreal.load_asset(path)
    f = unreal.BlueprintFactory(); f.set_editor_property("parent_class", parent_cls)
    return tools.create_asset(name, BP, unreal.Blueprint, f)

base = unreal.load_asset(BP + "/BP_MR_PlayerCharacter")
pawn = make_bp("BP_MR_AvatarPlayerCharacter", base.generated_class())
unreal.get_default_object(pawn.generated_class()).set_editor_property("load_saved_avatar_on_begin_play", True)
unreal.BlueprintEditorLibrary.compile_blueprint(pawn); eal.save_loaded_asset(pawn)

gm_creator = make_bp("BP_MR_AvatarCreatorGameMode", unreal.MoonRacerGameMode)
g = unreal.get_default_object(gm_creator.generated_class())
g.set_editor_property("default_pawn_class", pawn.generated_class()); g.set_editor_property("player_controller_class", unreal.MRAvatarCreatorController)
unreal.BlueprintEditorLibrary.compile_blueprint(gm_creator); eal.save_loaded_asset(gm_creator)

gm_spawn = make_bp("BP_MR_AvatarSpawnGameMode", unreal.MoonRacerGameMode)
g = unreal.get_default_object(gm_spawn.generated_class())
g.set_editor_property("default_pawn_class", pawn.generated_class())
g.set_editor_property("player_controller_class", eal.load_blueprint_class("/Game/ThirdPerson/Blueprints/BP_ThirdPersonPlayerController"))
unreal.BlueprintEditorLibrary.compile_blueprint(gm_spawn); eal.save_loaded_asset(gm_spawn)

def make_map(name, gm):
    path = MAPS + "/" + name
    if eal.does_asset_exist(path): out("map exists", path); return
    les.new_level(path)
    world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
    def sp(c, l=(0,0,0), rot=(0,0,0)):   # rot = (roll, pitch, yaw) - unreal.Rotator() argument order
        return eas.spawn_actor_from_class(c, unreal.Vector(*l), unreal.Rotator(roll=rot[0], pitch=rot[1], yaw=rot[2]))
    f = sp(unreal.StaticMeshActor, (0,0,-50)); f.set_actor_label("DEV_Floor")
    f.static_mesh_component.set_static_mesh(unreal.load_asset("/Engine/BasicShapes/Cube")); f.set_actor_scale3d(unreal.Vector(100,100,1))
    f.static_mesh_component.set_material(0, unreal.load_asset("/Engine/EngineMaterials/WorldGridMaterial"))
    sp(unreal.PlayerStart, (0,0,100)).set_actor_label("PlayerStart")
    sun = sp(unreal.DirectionalLight, (0,0,500), (0,-45,35)); sun.set_actor_label("DEV_Sun")
    sun.get_component_by_class(unreal.DirectionalLightComponent).set_editor_property("mobility", unreal.ComponentMobility.MOVABLE)
    sp(unreal.SkyAtmosphere).set_actor_label("DEV_SkyAtmosphere")
    sk = sp(unreal.SkyLight, (0,0,300)); sk.set_actor_label("DEV_SkyLight"); c = sk.get_component_by_class(unreal.SkyLightComponent)
    c.set_editor_property("mobility", unreal.ComponentMobility.MOVABLE); c.set_editor_property("real_time_capture", True)
    sp(unreal.MRAvatarTestDriver, (0,0,50)).set_actor_label("DEV_AvatarTestDriver")
    world.get_world_settings().set_editor_property("default_game_mode", gm.generated_class())
    les.save_current_level(); out("map made", path)
make_map("L_MR_AvatarCreator", gm_creator)
make_map("L_MR_AvatarSpawnTest", gm_spawn)
eal.save_directory("/Game/MoonRacer")
out("DONE")
