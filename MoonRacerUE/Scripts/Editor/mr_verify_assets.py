"""Read-only: confirm the Phase 3A assets are visible to the Asset Registry and load."""
import unreal
ar = unreal.AssetRegistryHelpers.get_asset_registry()
for p in ["/Game/MoonRacer/Characters/Animation/ABP_MR_Humanoid","/Game/MoonRacer/Characters/Blueprints/BP_MR_PlayerCharacter","/Game/MoonRacer/Characters/Blueprints/BP_MR_GameMode","/Game/MoonRacer/Characters/Data/DA_MR_HumanoidAttachmentPoints","/Game/MoonRacer/Maps/L_MR_AnimationTest"]:
    d = ar.get_asset_by_object_path(p + "." + p.split("/")[-1])
    a = unreal.load_asset(p)
    unreal.log("MRVERIFY| %s registry=%s loaded=%s class=%s" % (p.split("/")[-1], d.is_valid(), a is not None, d.asset_class_path.asset_name if d.is_valid() else "-"))
