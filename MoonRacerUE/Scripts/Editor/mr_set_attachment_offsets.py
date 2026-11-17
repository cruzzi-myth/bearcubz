"""Moon Racer - set the dev attachment-point offsets on DA_MR_HumanoidAttachmentPoints (Moon Racer asset only).
Offsets are in each bone's LOCAL space, derived from the runtime axis probe (MRTEST|AXIS):
  head/spine/pelvis: +X = up, +Y = forward, +Z = character right
Hand points use Epic's existing HandGrip_R / HandGrip_L skeleton sockets as the base (read only)."""
import unreal
def out(*a): unreal.log("MROFFSETS| " + " ".join(str(x) for x in a))
da = unreal.load_asset("/Game/MoonRacer/Characters/Data/DA_MR_HumanoidAttachmentPoints")
POINTS = [
    # id,              bone/socket,   (x,y,z) cm offset (bone local),  purpose
    ("MR_Head_Top",    "head",        (13, 0, 0),    "headgear"),
    ("MR_Head_Face",   "head",        (7, 11, 0),    "visor / glasses"),
    ("MR_Chest",       "spine_04",    (5, 12, 0),    "chest device"),
    ("MR_Back_Upper",  "spine_04",    (5, -12, 0),   "back accessory (upper)"),
    ("MR_Back_Lower",  "spine_02",    (0, -13, 0),   "back accessory (lower)"),
    ("MR_Hip_L",       "pelvis",      (-6, 0, -22),  "holster / belt item (left)"),
    ("MR_Hip_R",       "pelvis",      (-6, 0, 22),   "holster / belt item (right)"),
    ("MR_Hand_R_Grip", "HandGrip_R",  (0, 0, 0),     "hand-held item (right) - Epic HandGrip_R socket"),
    ("MR_Hand_L_Grip", "HandGrip_L",  (0, 0, 0),     "hand-held item (left) - Epic HandGrip_L socket"),
]
pts = []
for pid, bone, loc, purpose in POINTS:
    d = unreal.MRAttachmentPointDef()
    d.set_editor_property("point_id", pid); d.set_editor_property("bone_name", bone)
    d.set_editor_property("relative_transform", unreal.Transform(location=unreal.Vector(*loc), rotation=unreal.Rotator(0,0,0), scale=unreal.Vector(1,1,1)))
    d.set_editor_property("purpose", purpose); pts.append(d)
da.set_editor_property("points", pts)
unreal.EditorAssetLibrary.save_loaded_asset(da)
out("updated", len(pts), "points")
