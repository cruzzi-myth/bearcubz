"""Moon Racer: set ONLY DEV_Sun's rotation in the currently loaded map (open it via the command line):
roll 0, pitch -45 (pointing down), yaw 35. No other actor or setting is touched."""
import unreal
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem); les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
n = 0
for a in eas.get_all_level_actors():
    if a.get_actor_label() == "DEV_Sun" and a.get_class().get_name() == "DirectionalLight":
        unreal.log("MRSUN| before: %s" % a.get_actor_rotation())
        a.set_actor_rotation(unreal.Rotator(roll=0.0, pitch=-45.0, yaw=35.0), False)
        unreal.log("MRSUN| after:  %s" % a.get_actor_rotation()); n += 1
unreal.log("MRSUN| changed %d actor(s)" % n)
if n == 1: les.save_current_level(); unreal.log("MRSUN| saved")
