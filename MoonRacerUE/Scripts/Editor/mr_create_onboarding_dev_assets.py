"""P0 dev environment for Phase 3B onboarding: DA_MR_OnboardingFlow (TEST FIXTURE - NONCANON content IDs) and the dev map
L_MR_OnboardingDev (lit, corrected sun orientation, avatar pawn game mode, onboarding test driver). New assets only."""
import unreal
def out(*a): unreal.log("MRONBASSET| " + " ".join(str(x) for x in a))
eal = unreal.EditorAssetLibrary; tools = unreal.AssetToolsHelpers.get_asset_tools()
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem); les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
eal.make_directory("/Game/MoonRacer/Onboarding")
P = "/Game/MoonRacer/Onboarding/DA_MR_OnboardingFlow"
if not eal.does_asset_exist(P):
    da = tools.create_asset("DA_MR_OnboardingFlow", "/Game/MoonRacer/Onboarding", unreal.MROnboardingFlowAsset, unreal.DataAssetFactory())
    eal.save_loaded_asset(da); out("flow asset created (defaults = TEST FIXTURE - NONCANON IDs)")
MAP = "/Game/MoonRacer/Maps/L_MR_OnboardingDev"
if not eal.does_asset_exist(MAP):
    gm = eal.load_blueprint_class("/Game/MoonRacer/Characters/Blueprints/BP_MR_AvatarSpawnGameMode")
    les.new_level(MAP)
    world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
    def sp(c, l=(0,0,0), rot=(0,0,0)): return eas.spawn_actor_from_class(c, unreal.Vector(*l), unreal.Rotator(roll=rot[0], pitch=rot[1], yaw=rot[2]))
    f = sp(unreal.StaticMeshActor, (0,0,-50)); f.set_actor_label("DEV_Floor")
    f.static_mesh_component.set_static_mesh(unreal.load_asset("/Engine/BasicShapes/Cube")); f.set_actor_scale3d(unreal.Vector(100,100,1))
    f.static_mesh_component.set_material(0, unreal.load_asset("/Engine/EngineMaterials/WorldGridMaterial"))
    sp(unreal.PlayerStart, (0,0,100)).set_actor_label("DEV_PlayerStart")
    sun = sp(unreal.DirectionalLight, (0,0,500), (0,-45,35)); sun.set_actor_label("DEV_Sun")
    sun.get_component_by_class(unreal.DirectionalLightComponent).set_editor_property("mobility", unreal.ComponentMobility.MOVABLE)
    sp(unreal.SkyAtmosphere).set_actor_label("DEV_SkyAtmosphere")
    sk = sp(unreal.SkyLight, (0,0,300)); sk.set_actor_label("DEV_SkyLight"); c = sk.get_component_by_class(unreal.SkyLightComponent)
    c.set_editor_property("mobility", unreal.ComponentMobility.MOVABLE); c.set_editor_property("real_time_capture", True)
    t = sp(unreal.TextRenderActor, (300,0,200), (0,0,180)); t.set_actor_label("DEV_Label")
    t.text_render.set_editor_property("text", "TEST FIXTURE - NONCANON: onboarding dev map"); t.text_render.set_editor_property("world_size", 20)
    sp(unreal.MROnboardingTestDriver, (0,0,50)).set_actor_label("DEV_OnboardingTestDriver")
    world.get_world_settings().set_editor_property("default_game_mode", gm)
    les.save_current_level(); out("map created", MAP)
eal.save_directory("/Game/MoonRacer/Onboarding"); out("DONE")
