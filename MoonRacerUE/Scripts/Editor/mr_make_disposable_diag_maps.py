"""Creates DISPOSABLE diagnostic maps under /Game/MoonRacer/Diagnostics/ (built from scratch with new_level;
the original L_MR_AnimationTest and all project settings are never touched). Delete the folder to discard."""
import unreal
eal = unreal.EditorAssetLibrary
les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
D = "/Game/MoonRacer/Diagnostics/"
eal.make_directory(D)
def out(*a): unreal.log("MRDIAG| " + " ".join(str(x) for x in a))
bp = unreal.load_asset("/Game/MoonRacer/Characters/Blueprints/BP_MR_PlayerCharacter")
gm = unreal.load_asset("/Game/MoonRacer/Characters/Blueprints/BP_MR_GameMode")

def spawn(cls, loc=(0,0,0), rot=(0,0,0)):
    # rot is (roll, pitch, yaw) - the order unreal.Rotator() takes
    return eas.spawn_actor_from_class(cls, unreal.Vector(*loc), unreal.Rotator(roll=rot[0], pitch=rot[1], yaw=rot[2]))

def build(name, sky=True, ppv=None, unlit_floor=False, step=False):
    path = D + "DISPOSABLE_DIAG_" + name
    if eal.does_asset_exist(path): eal.delete_asset(path)
    les.new_level(path)
    world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
    f = spawn(unreal.StaticMeshActor, (0,0,-50)); f.set_actor_label("DIAG_Floor")
    f.static_mesh_component.set_static_mesh(unreal.load_asset("/Engine/BasicShapes/Cube"))
    f.set_actor_scale3d(unreal.Vector(100,100,1))
    f.static_mesh_component.set_material(0, unreal.load_asset("/Engine/EngineMaterials/WorldGridMaterial"))
    spawn(unreal.PlayerStart, (0,0,100 + (15 if step else 0)))
    if step:
        # Foot-IK probe: a 15 cm step under the capsule centre; the character's left foot (y=-10) hangs over the lower floor.
        st = spawn(unreal.StaticMeshActor, (0, 35, 7.5)); st.set_actor_label("DIAG_Step")
        st.static_mesh_component.set_static_mesh(unreal.load_asset("/Engine/BasicShapes/Cube")); st.set_actor_scale3d(unreal.Vector(3.0, 0.8, 0.15))
        st.static_mesh_component.set_material(0, unreal.load_asset("/Engine/EngineMaterials/WorldGridMaterial"))
    sun = spawn(unreal.DirectionalLight, (0,0,500), (0,-45,35))
    sun.get_component_by_class(unreal.DirectionalLightComponent).set_editor_property("mobility", unreal.ComponentMobility.MOVABLE)
    if sky:
        spawn(unreal.SkyAtmosphere)
        sk = spawn(unreal.SkyLight, (0,0,300)); c = sk.get_component_by_class(unreal.SkyLightComponent)
        c.set_editor_property("mobility", unreal.ComponentMobility.MOVABLE); c.set_editor_property("real_time_capture", True)
    for idx, y in ((0,-140),(1,140)):
        pv = spawn(bp.generated_class(), (-260,y,100)); pv.set_editor_property("initial_body_index", idx)
        pv.set_editor_property("auto_possess_player", unreal.AutoReceiveInput.DISABLED)
    spawn(unreal.MRAnimationTestDriver, (0,0,50))
    if ppv:
        p = spawn(unreal.PostProcessVolume); p.set_editor_property("unbound", True)
        s = p.get_editor_property("settings")
        try:
            if ppv in ("nolumen","both"):
                s.set_editor_property("override_dynamic_global_illumination_method", True)
                s.set_editor_property("dynamic_global_illumination_method", unreal.DynamicGlobalIlluminationMethod.NONE)
                s.set_editor_property("override_reflection_method", True)
                s.set_editor_property("reflection_method", unreal.ReflectionMethod.NONE)
            if ppv in ("exposure","both"):
                s.set_editor_property("override_auto_exposure_method", True)
                s.set_editor_property("auto_exposure_method", unreal.AutoExposureMethod.AEM_MANUAL)
                s.set_editor_property("override_auto_exposure_bias", True)
                s.set_editor_property("auto_exposure_bias", 10.0)
        except Exception as e: out("PPV exc", repr(e)[:200])
        p.set_editor_property("settings", s)
    world.get_world_settings().set_editor_property("default_game_mode", gm.generated_class())
    les.save_current_level()
    out("made", path)

import os
if os.environ.get("MR_ONLY_STEP"):
    build("V8_FootIK_Step", step=True)
    out("DONE (step only)")
    raise SystemExit
if os.environ.get("MR_ONLY_VERIFY"):
    build("V7_RotationVerify")
    out("DONE (verify only)")
    raise SystemExit
build("V1_Baseline")
build("V2_SunOnly", sky=False)
build("V3_NoLumen", ppv="nolumen")
build("V4_ManualExposure", ppv="exposure")
build("V5_SunOnly_NoLumen_ManualExposure", sky=False, ppv="both")
out("DONE")
