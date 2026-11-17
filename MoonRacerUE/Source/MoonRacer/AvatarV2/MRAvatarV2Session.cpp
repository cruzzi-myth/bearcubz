#include "AvatarV2/MRAvatarV2Session.h"
#include "AvatarV2/MRAvatarV2Gate.h"
#include "Avatar/MRAvatarCatalog.h"
#include "Avatar/MRAvatarCustomizationComponent.h"
#include "Avatar/MRAvatarSaveGame.h"
#include "Humanoid/MRPlayerCharacter.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "MoonRacer.h"

const TArray<FMRV2Stage>& UMRAvatarV2Session::Stages()
{
	static const TArray<FMRV2Stage> S = {
		{ 1, FName("stage_race_base"),  TEXT("Race & Base") },
		{ 2, FName("stage_appearance"), TEXT("Appearance") },
		{ 3, FName("stage_style_gear"), TEXT("Style & Gear") },
		{ 4, FName("stage_house_crest"),TEXT("House Crest") },
		{ 5, FName("stage_identity"),   TEXT("Identity") },
		{ 6, FName("stage_review"),     TEXT("Final Review") },
	};
	return S;
}

const TArray<FMRV2Category>& UMRAvatarV2Session::Categories()
{
	static const TArray<FMRV2Category> C = {
		{ 1,  FName("species_base"),  TEXT("Species & Base"),     1 },
		{ 2,  FName("body"),          TEXT("Body"),               2 },
		{ 3,  FName("head_shape"),    TEXT("Head Shape"),         2 },
		{ 4,  FName("facial"),        TEXT("Facial Features"),    2 },
		{ 5,  FName("ears_horns"),    TEXT("Ears & Horns"),       2 },
		{ 6,  FName("hair"),          TEXT("Hair & Styles"),      2 },
		{ 7,  FName("markings"),      TEXT("Markings & Patterns"),2 },
		{ 8,  FName("eyes"),          TEXT("Eyes"),               2 },
		{ 9,  FName("skin"),          TEXT("Skin & Surface"),     2 },
		{ 10, FName("augmentations"), TEXT("Augmentations"),      2 },
		{ 11, FName("attire"),        TEXT("Attire & Armor"),     3 },
		{ 12, FName("colors"),        TEXT("Colors & Materials"), 3 },
		{ 13, FName("house_crest"),   TEXT("House Crest"),        4 },
		{ 14, FName("identity"),      TEXT("Identity & Profile"), 5 },
	};
	return C;
}

TArray<int32> UMRAvatarV2Session::CategoriesOfStage(int32 StageNumber)
{
	TArray<int32> R;
	for (const FMRV2Category& C : Categories()) if (C.Stage == StageNumber) R.Add(C.Number);
	return R;
}

const TArray<FName>& UMRAvatarV2Session::PlaceholderCrestIds()
{
	static const TArray<FName> Ids = { FName("TEST_FIXTURE_NONCANON_CREST_A"), FName("TEST_FIXTURE_NONCANON_CREST_B"), FName("TEST_FIXTURE_NONCANON_CREST_C") };
	return Ids;
}

UMRAvatarCustomizationComponent* UMRAvatarV2Session::Comp() const { return Target ? Target->AvatarCustomization.Get() : nullptr; }

UMRAvatarSaveSubsystem* UMRAvatarV2Session::SaveSys() const
{
	UWorld* W = Target ? Target->GetWorld() : nullptr;
	UGameInstance* GI = W ? W->GetGameInstance() : nullptr;
	return GI ? GI->GetSubsystem<UMRAvatarSaveSubsystem>() : nullptr;
}

FString UMRAvatarV2Session::SlotName() const { return UMRAvatarSaveSubsystem::GetSlotName(); }

const FMRAvatarAppearance& UMRAvatarV2Session::Working() const
{
	static const FMRAvatarAppearance Empty;
	return Comp() ? Comp()->GetCurrentAppearance() : Empty;
}

bool UMRAvatarV2Session::Initialize(AMRPlayerCharacter* InTarget, FString& OutError)
{
	Target = InTarget;
	if (!Target || !Target->AvatarCustomization) { OutError = TEXT("no avatar character with a customization component"); return false; }
	if (MRAvatarV2Dev::IsProtectedSlot(SlotName())) { OutError = TEXT("refusing the default player avatar slot"); Target = nullptr; return false; }
	CatalogPtr = Target->AvatarCustomization->GetCatalog();
	if (!CatalogPtr) { OutError = TEXT("avatar catalog is not available"); Target = nullptr; return false; }
	const FMRAvatarApplyResult R = Target->AvatarCustomization->LoadAndApplySaved();   // dev slot only (slot guard above)
	if (!R.bApplied) Status = FString(TEXT("Could not apply an avatar: ")) + R.Message;
	else Status = (SaveSys() && SaveSys()->HasSavedAppearance()) ? FString(TEXT("Restored the saved development avatar.")) : FString(TEXT("Started from the catalog default."));
	return R.bApplied;
}

FMRV2Result UMRAvatarV2Session::Try(const FMRAvatarAppearance& Candidate, const FString& OkMessage)
{
	FMRV2Result Out;
	UMRAvatarCustomizationComponent* C = Comp();
	if (!C) { Out.Message = TEXT("no character bound"); return Out; }
	const FMRAvatarApplyResult R = C->PreviewAppearance(Candidate);
	Out.bOk = R.bApplied;
	Out.Message = R.bApplied ? OkMessage : (TEXT("Not applied: ") + (R.Message.IsEmpty() ? R.Validation.ToString() : R.Message));
	Status = Out.Message;
	return Out;
}

FMRV2Result UMRAvatarV2Session::SetSpecies(FName Id)
{
	FMRAvatarAppearance A = Working();
	if (!MRAvatar::IsCanonicalSpecies(Id)) { FMRV2Result R; R.Message = FString::Printf(TEXT("'%s' is not one of the six canonical species ids."), *Id.ToString()); Status = R.Message; return R; }
	A.SpeciesId = Id;
	return Try(A, FString::Printf(TEXT("Species id set to '%s'. No species-specific model exists: the shared development body is still used."), *Id.ToString()));
}

FMRV2Result UMRAvatarV2Session::SetBody(FName Id)
{
	FMRAvatarAppearance A = Working(); A.BodyBaseId = Id;
	// A material variant bound to the previous body may not exist on the new one; fall back to the default variant rather than failing.
	if (CatalogPtr)
	{
		const FMRAvatarOption* V = CatalogPtr->FindMaterialVariant(A.MaterialVariantId);
		if (V && V->MaterialBindings.Num() > 0 && !V->MaterialBindings.ContainsByPredicate([&](const FMRMaterialBinding& B) { return B.BodyId == Id; })) A.MaterialVariantId = CatalogPtr->DefaultMaterialVariantId;
	}
	return Try(A, FString::Printf(TEXT("Development body set to '%s'."), *Id.ToString()));
}

FMRV2Result UMRAvatarV2Session::ToggleAccessory(FName Id)
{
	FMRAvatarAppearance A = Working();
	if (A.AccessoryIds.Contains(Id)) { A.AccessoryIds.Remove(Id); return Try(A, FString::Printf(TEXT("Removed accessory '%s'."), *Id.ToString())); }
	if (CatalogPtr) if (const FMRAvatarOption* New = CatalogPtr->FindAccessory(Id))
		A.AccessoryIds.RemoveAll([&](const FName& Old) { const FMRAvatarOption* O = CatalogPtr->FindAccessory(Old); return O && O->AttachmentPointId == New->AttachmentPointId; });
	A.AccessoryIds.Add(Id);
	return Try(A, FString::Printf(TEXT("Attached accessory '%s' (rigid development prop)."), *Id.ToString()));
}

FMRV2Result UMRAvatarV2Session::SetMaterialVariant(FName Id)
{
	FMRAvatarAppearance A = Working(); A.MaterialVariantId = Id;
	return Try(A, FString::Printf(TEXT("Material variant set to '%s'."), *Id.ToString()));
}

FMRV2Result UMRAvatarV2Session::ResetAppearance()
{
	if (!CatalogPtr) { FMRV2Result R; R.Message = TEXT("no catalog"); return R; }
	FMRAvatarAppearance D = CatalogPtr->MakeDefaultAppearance();
	D.AvatarId = Working().AvatarId.IsValid() ? Working().AvatarId : D.AvatarId;
	return Try(D, TEXT("Appearance reset to the catalog default (not saved)."));
}

FMRV2Result UMRAvatarV2Session::RevertToCommitted()
{
	FMRV2Result Out;
	UMRAvatarCustomizationComponent* C = Comp();
	if (!C) { Out.Message = TEXT("no character bound"); return Out; }
	const FMRAvatarApplyResult R = C->RevertToCommitted();
	Out.bOk = R.bApplied; Out.Message = R.bApplied ? TEXT("Reverted to the last saved/loaded appearance.") : TEXT("Revert failed: ") + R.Message;
	Status = Out.Message; return Out;
}

FMRV2Result UMRAvatarV2Session::SaveToDevSlot()
{
	FMRV2Result Out;
	UMRAvatarSaveSubsystem* S = SaveSys(); UMRAvatarCustomizationComponent* C = Comp();
	if (!S || !C) { Out.Message = TEXT("save subsystem or character unavailable"); Status = Out.Message; return Out; }
	if (MRAvatarV2Dev::IsProtectedSlot(SlotName())) { Out.Message = TEXT("Refused: the default player avatar slot is protected."); Status = Out.Message; UE_LOG(LogMoonRacer, Error, TEXT("MRAV2|REFUSED|save to protected slot %s"), *SlotName()); return Out; }
	FMRAvatarAppearance A = C->GetCurrentAppearance();
	if (!A.AvatarId.IsValid()) A.AvatarId = FGuid::NewGuid();
	FString Err;
	if (!S->SaveAppearance(A, Err)) { Out.Message = TEXT("Save failed: ") + Err; Status = Out.Message; return Out; }
	C->CommitCurrent();
	bCrestLocked = !OriginalCrest.IsNone();   // session-only: the original crest becomes immutable once the avatar is saved
	Out.bOk = true; Out.Message = FString::Printf(TEXT("Saved to development slot '%s'."), *SlotName());
	Status = Out.Message; return Out;
}

FMRV2Result UMRAvatarV2Session::LoadFromDevSlot()
{
	FMRV2Result Out;
	UMRAvatarCustomizationComponent* C = Comp(); UMRAvatarSaveSubsystem* S = SaveSys();
	if (!C || !S) { Out.Message = TEXT("character or save subsystem unavailable"); Status = Out.Message; return Out; }
	if (!S->HasSavedAppearance()) { Out.Message = TEXT("No saved development avatar in this slot."); Status = Out.Message; return Out; }
	const FMRAvatarApplyResult R = C->LoadAndApplySaved();
	Out.bOk = R.bApplied; Out.Message = R.bApplied ? FString::Printf(TEXT("Loaded development slot '%s'."), *SlotName()) : TEXT("Load failed: ") + R.Message;
	Status = Out.Message; return Out;
}

FMRV2Result UMRAvatarV2Session::SelectCrest(FName Id)
{
	FMRV2Result Out;
	if (bCrestLocked) { Out.Message = TEXT("The Original House Crest is locked. Future changes need an approved progression checkpoint; none exist yet."); Status = Out.Message; return Out; }
	if (!PlaceholderCrestIds().Contains(Id)) { Out.Message = FString::Printf(TEXT("'%s' is not a placeholder crest."), *Id.ToString()); Status = Out.Message; return Out; }
	OriginalCrest = Id; ActiveCrest = Id;
	Out.bOk = true; Out.Message = TEXT("Placeholder crest chosen (NONCANON, session only, not saved)."); Status = Out.Message; return Out;
}

void UMRAvatarV2Session::ResetCrestForDev() { OriginalCrest = NAME_None; ActiveCrest = NAME_None; bCrestLocked = false; }

TArray<FMRV2Option> UMRAvatarV2Session::Options(EMRV2OptionKind Kind) const
{
	TArray<FMRV2Option> Out;
	if (Kind == EMRV2OptionKind::Crest)
	{
		static const TCHAR* Names[] = { TEXT("Placeholder crest A"), TEXT("Placeholder crest B"), TEXT("Placeholder crest C") };
		for (int32 i = 0; i < PlaceholderCrestIds().Num(); ++i)
		{
			FMRV2Option O; O.Id = PlaceholderCrestIds()[i]; O.Label = Names[i]; O.Note = TEXT("TEST FIXTURE - NONCANON"); O.bSelected = (OriginalCrest == O.Id); O.bDevPlaceholder = true; Out.Add(O);
		}
		return Out;
	}
	if (!CatalogPtr) return Out;
	const FMRAvatarAppearance& W = Working();
	if (Kind == EMRV2OptionKind::Species)
	{
		for (const FMRSpeciesEntry& S : CatalogPtr->Species)
		{
			FMRV2Option O; O.Id = S.Id; O.Label = S.DisplayName.ToString(); O.bSelected = (W.SpeciesId == S.Id);
			O.Note = TEXT("id only - shared dev body, no species model");
			Out.Add(O);
		}
		return Out;
	}
	const TArray<FMRAvatarOption>* List = Kind == EMRV2OptionKind::Body ? &CatalogPtr->Bodies : Kind == EMRV2OptionKind::Accessory ? &CatalogPtr->Accessories : &CatalogPtr->MaterialVariants;
	for (const FMRAvatarOption& Src : *List)
	{
		if (!Src.IsAvailable()) continue;   // Pending options are never offered as selectable
		FMRV2Option O; O.Id = Src.Id; O.Label = Src.DisplayName.ToString();
		O.bDevPlaceholder = Src.Status == EMRAvatarAssetStatus::DevPlaceholder;
		O.Note = O.bDevPlaceholder ? TEXT("development placeholder") : TEXT("");
		O.bSelected = Kind == EMRV2OptionKind::Body ? W.BodyBaseId == Src.Id : Kind == EMRV2OptionKind::Accessory ? W.AccessoryIds.Contains(Src.Id) : W.MaterialVariantId == Src.Id;
		if (Kind == EMRV2OptionKind::Material && Src.MaterialBindings.Num() > 0 && !Src.MaterialBindings.ContainsByPredicate([&](const FMRMaterialBinding& B) { return B.BodyId == W.BodyBaseId; })) continue;   // not supported on this body
		Out.Add(O);
	}
	return Out;
}

namespace
{
	int32 CountPending(const TArray<FMRAvatarOption>& L) { int32 N = 0; for (const FMRAvatarOption& O : L) if (!O.IsAvailable()) ++N; return N; }
}

FMRV2Capability UMRAvatarV2Session::Capability(int32 N) const
{
	FMRV2Capability C;
	auto Add = [&C](const TCHAR* Control, const FString& Reason) { C.Unavailable.Add(FString::Printf(TEXT("%s - %s"), Control, *Reason)); };
	const FString NoMorph = TEXT("no morph targets exist on the development meshes");
	switch (N)
	{
	case 1:
		C.Support = EMRV2Support::Functional;
		C.Summary = TEXT("Species id is recorded and saved. All six species currently share the same development body; no species has its own model.");
		Add(TEXT("Species-specific model/rig"), TEXT("no species 3D asset exists (all six are Unassessed)"));
		break;
	case 2:
		C.Support = EMRV2Support::Partial;
		C.Summary = TEXT("Switch between the available development bodies (Epic mannequins, not Moon Racer designs).");
		Add(TEXT("Body proportion sliders"), NoMorph);
		Add(TEXT("Height / build"), TEXT("not part of the avatar schema and not backed by any rig control"));
		break;
	case 3: C.Summary = TEXT("Not available."); Add(TEXT("Head shape sliders"), NoMorph); break;
	case 4: C.Summary = TEXT("Not available."); Add(TEXT("Face morphs (jaw, cheeks, chin, nose, mouth)"), NoMorph); break;
	case 5: C.Summary = TEXT("Not available."); Add(TEXT("Ears & horns"), TEXT("no ear/horn assets; per-species support is awaiting approval")); break;
	case 6: C.Summary = TEXT("Not available."); Add(TEXT("Hair styles"), FString::Printf(TEXT("%d hair ids exist in the catalog but all are Pending: there are no hair meshes or grooms"), CatalogPtr ? CatalogPtr->Hair.Num() : 0)); Add(TEXT("Hair parameters/colour"), TEXT("no hair assets")); break;
	case 7: C.Summary = TEXT("Not available."); Add(TEXT("Markings & patterns"), TEXT("no decal/texture-layer system exists")); break;
	case 8: C.Summary = TEXT("Not available."); Add(TEXT("Eye styles/colour"), FString::Printf(TEXT("%d eye ids exist but all are Pending: no eye assets or material parameters"), CatalogPtr ? CatalogPtr->Eyes.Num() : 0)); break;
	case 9: C.Summary = TEXT("Not available."); Add(TEXT("Skin tone & surface"), TEXT("the development meshes have no skin material parameters")); break;
	case 10: C.Summary = TEXT("Not available."); Add(TEXT("Cybernetic augmentations"), TEXT("no augmentation assets exist")); break;
	case 11:
		C.Support = EMRV2Support::Partial;
		C.Summary = TEXT("Rigid development props can be attached at the Moon Racer attachment points. They are marker primitives, not accessory designs.");
		Add(TEXT("Attire & armor (skinned garments)"), FString::Printf(TEXT("%d outfit ids exist but all are Pending: no skinned garments are available or tested"), CatalogPtr ? CatalogPtr->Outfits.Num() : 0));
		break;
	case 12:
		C.Support = EMRV2Support::Partial;
		C.Summary = TEXT("Switch the development material variant (swaps the body's material slot).");
		Add(TEXT("Signal accent colour"), FString::Printf(TEXT("%d accent ids exist but all are Pending: no material assets"), CatalogPtr ? CatalogPtr->SignalAccents.Num() : 0));
		Add(TEXT("Colour pickers / material parameters"), TEXT("no parameterised character materials exist"));
		break;
	case 13:
		C.Support = EMRV2Support::Partial;
		C.Summary = TEXT("Placeholder crests only (NONCANON). Held in this session; not saved, no faction or gameplay link.");
		Add(TEXT("Official Houses & crest art"), TEXT("no approved House list or crest art exists"));
		Add(TEXT("Changing the House Crest after creation"), TEXT("requires approved progression checkpoints; none are defined"));
		Add(TEXT("Crest persistence"), TEXT("the House Crest save record is a later milestone"));
		break;
	case 14:
		C.Summary = TEXT("Not available.");
		Add(TEXT("Name & callsign"), TEXT("identity record is a later milestone (not in the avatar schema)"));
		Add(TEXT("Origin & background"), TEXT("lists are canon-dependent and unapproved"));
		Add(TEXT("Voice"), TEXT("no voice assets exist"));
		break;
	default: break;
	}
	if (N == 14 || (N >= 3 && N <= 10 && N != 0)) C.Support = EMRV2Support::Unavailable;
	return C;
}
