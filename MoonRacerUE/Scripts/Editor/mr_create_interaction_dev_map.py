"""P5A dev environment: L_MR_InteractionDev - a minimal, lit, primitives-only map with TEST FIXTURE - NONCANON NPC stand-ins and the
interaction test driver. It defines NO Core geography, architecture, spawn points or landmarks. New asset only (never overwrites).
Run: UnrealEditor-Cmd MoonRacer.uproject -ExecutePythonScript=<this file> -stdout -unattended -nosplash -NullRHI"""
import unreal
def out(*a): unreal.log("MRNARRASSET| " + " ".join(str(x) for x in a))
eal = unreal.EditorAssetLibrary
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem); les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
MAP = "/Game/MoonRacer/Maps/L_MR_InteractionDev"
if eal.does_asset_exist(MAP):
    out("map already exists; not touched", MAP)
else:
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
    t = sp(unreal.TextRenderActor, (300,0,300), (0,0,180)); t.set_actor_label("DEV_Label")
    t.text_render.set_editor_property("text", "TEST FIXTURE - NONCANON: interaction dev map (no canonical placement)"); t.text_render.set_editor_property("world_size", 20)
    # NPC stand-ins: development primitives only. Positions are arbitrary test coordinates, not canonical placements.
    for npc, pos, label in (("TEST_FIXTURE_NPC_ALPHA", (600,0,90), "DEV_Npc_Alpha"), ("TEST_FIXTURE_NPC_BETA", (-600,0,90), "DEV_Npc_Beta"), ("TEST_FIXTURE_NPC_UNREGISTERED", (0,700,90), "DEV_Npc_Unregistered")):
        a = sp(unreal.MRDevNpcActor, pos); a.set_actor_label(label); a.set_editor_property("npc_id", npc)
    sp(unreal.MRInteractionTestDriver, (0,0,50)).set_actor_label("DEV_InteractionTestDriver")
    world.get_world_settings().set_editor_property("default_game_mode", gm)
    les.save_current_level(); out("map created", MAP)
out("DONE")
