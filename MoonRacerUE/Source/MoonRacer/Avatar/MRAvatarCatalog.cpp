#include "Avatar/MRAvatarCatalog.h"

UMRAvatarCatalog* UMRAvatarCatalog::LoadDefault()
{
	return Cast<UMRAvatarCatalog>(FSoftObjectPath(DefaultAssetPath()).TryLoad());
}

const FMRAvatarOption* UMRAvatarCatalog::FindIn(const TArray<FMRAvatarOption>& List, FName Id)
{
	return List.FindByPredicate([Id](const FMRAvatarOption& O) { return O.Id == Id; });
}

const FMRSpeciesEntry* UMRAvatarCatalog::FindSpecies(FName Id) const
{
	return Species.FindByPredicate([Id](const FMRSpeciesEntry& S) { return S.Id == Id; });
}

FMRAvatarAppearance UMRAvatarCatalog::MakeDefaultAppearance() const
{
	FMRAvatarAppearance A;
	A.AvatarId = FGuid::NewGuid();
	A.SpeciesId = DefaultSpeciesId;
	A.BodyBaseId = DefaultBodyId;
	A.MaterialVariantId = DefaultMaterialVariantId;
	return A;
}

namespace
{
	// Optional single-ID slot (hair/eyes/outfit/accent). None is always valid.
	void CheckOptional(FMRAvatarValidationResult& R, EMRAvatarSlot Slot, FName Id, const TArray<FMRAvatarOption>& List, const TCHAR* Label)
	{
		if (Id.IsNone()) return;
		const FMRAvatarOption* O = UMRAvatarCatalog::FindIn(List, Id);
		if (!O) { R.Add(Slot, EMRAvatarIssueSeverity::Error, Id, FString::Printf(TEXT("unknown %s ID"), Label)); return; }
		if (!O->IsAvailable()) R.Add(Slot, EMRAvatarIssueSeverity::Pending, Id, FString::Printf(TEXT("%s has no 3D asset yet (pending)"), Label));
	}
}

FMRAvatarValidationResult UMRAvatarCatalog::Validate(const FMRAvatarAppearance& A) const
{
	FMRAvatarValidationResult R;

	if (A.SchemaVersion > MRAvatar::CurrentSchemaVersion)
		R.Add(EMRAvatarSlot::Schema, EMRAvatarIssueSeverity::Error, NAME_None, FString::Printf(TEXT("schema version %d is newer than supported (%d)"), A.SchemaVersion, MRAvatar::CurrentSchemaVersion));
	else if (A.SchemaVersion < MRAvatar::CurrentSchemaVersion)
		R.Add(EMRAvatarSlot::Schema, EMRAvatarIssueSeverity::Error, NAME_None, FString::Printf(TEXT("schema version %d must be migrated first"), A.SchemaVersion));

	// Species: one of the six permanent canonical IDs.
	if (!MRAvatar::IsCanonicalSpecies(A.SpeciesId))
	{
		R.Add(EMRAvatarSlot::Species, EMRAvatarIssueSeverity::Error, A.SpeciesId, TEXT("not one of the six canonical species IDs"));
	}
	else if (const FMRSpeciesEntry* S = FindSpecies(A.SpeciesId))
	{
		if (S->Assessment == EMRSpeciesAssessment::Unassessed)
			R.Add(EMRAvatarSlot::Species, EMRAvatarIssueSeverity::Info, A.SpeciesId, TEXT("species 3D model compatibility is unassessed (no 3D model exists)"));
	}
	else
	{
		R.Add(EMRAvatarSlot::Species, EMRAvatarIssueSeverity::Error, A.SpeciesId, TEXT("species is missing from the catalog"));
	}

	// Body (required).
	const FMRAvatarOption* Body = FindBody(A.BodyBaseId);
	if (A.BodyBaseId.IsNone()) R.Add(EMRAvatarSlot::BodyBase, EMRAvatarIssueSeverity::Error, NAME_None, TEXT("body base is required"));
	else if (!Body) R.Add(EMRAvatarSlot::BodyBase, EMRAvatarIssueSeverity::Error, A.BodyBaseId, TEXT("unknown body base ID"));
	else if (!Body->IsAvailable()) R.Add(EMRAvatarSlot::BodyBase, EMRAvatarIssueSeverity::Pending, A.BodyBaseId, TEXT("body has no 3D asset yet (pending)"));
	else if (Body->Status == EMRAvatarAssetStatus::DevPlaceholder) R.Add(EMRAvatarSlot::BodyBase, EMRAvatarIssueSeverity::Info, A.BodyBaseId, TEXT("development placeholder body (not a canonical Moon Racer design)"));

	CheckOptional(R, EMRAvatarSlot::Hair, A.HairId, Hair, TEXT("hair"));
	CheckOptional(R, EMRAvatarSlot::Eyes, A.EyesId, Eyes, TEXT("eyes"));
	CheckOptional(R, EMRAvatarSlot::Outfit, A.OutfitId, Outfits, TEXT("outfit"));
	CheckOptional(R, EMRAvatarSlot::SignalAccent, A.SignalAccentId, SignalAccents, TEXT("signal accent"));

	// Accessories: known, no duplicates, no two on the same attachment point.
	TSet<FName> SeenIds, UsedPoints;
	for (const FName& Id : A.AccessoryIds)
	{
		if (SeenIds.Contains(Id)) { R.Add(EMRAvatarSlot::Accessory, EMRAvatarIssueSeverity::Error, Id, TEXT("duplicate accessory")); continue; }
		SeenIds.Add(Id);
		const FMRAvatarOption* O = FindAccessory(Id);
		if (!O) { R.Add(EMRAvatarSlot::Accessory, EMRAvatarIssueSeverity::Error, Id, TEXT("unknown accessory ID")); continue; }
		if (!O->IsAvailable()) { R.Add(EMRAvatarSlot::Accessory, EMRAvatarIssueSeverity::Pending, Id, TEXT("accessory has no 3D asset yet (pending)")); continue; }
		if (O->AttachmentPointId.IsNone()) { R.Add(EMRAvatarSlot::Accessory, EMRAvatarIssueSeverity::Error, Id, TEXT("accessory has no attachment point")); continue; }
		if (UsedPoints.Contains(O->AttachmentPointId)) R.Add(EMRAvatarSlot::Accessory, EMRAvatarIssueSeverity::Error, Id, FString::Printf(TEXT("attachment point %s is already used by another accessory"), *O->AttachmentPointId.ToString()));
		UsedPoints.Add(O->AttachmentPointId);
	}

	// Material variant: known; if it has bindings it must support the chosen body.
	if (!A.MaterialVariantId.IsNone())
	{
		const FMRAvatarOption* V = FindMaterialVariant(A.MaterialVariantId);
		if (!V) R.Add(EMRAvatarSlot::MaterialVariant, EMRAvatarIssueSeverity::Error, A.MaterialVariantId, TEXT("unknown material variant ID"));
		else if (!V->IsAvailable()) R.Add(EMRAvatarSlot::MaterialVariant, EMRAvatarIssueSeverity::Pending, A.MaterialVariantId, TEXT("material variant has no asset yet (pending)"));
		else if (V->MaterialBindings.Num() > 0 && Body && !V->MaterialBindings.ContainsByPredicate([&](const FMRMaterialBinding& B) { return B.BodyId == A.BodyBaseId; }))
			R.Add(EMRAvatarSlot::MaterialVariant, EMRAvatarIssueSeverity::Error, A.MaterialVariantId, FString::Printf(TEXT("variant is not supported on body %s"), *A.BodyBaseId.ToString()));
	}
	return R;
}

bool UMRAvatarCatalog::Sanitize(FMRAvatarAppearance& A, TArray<FString>& Notes) const
{
	bool bChanged = false;
	auto Note = [&](const FString& S) { Notes.Add(S); bChanged = true; };

	if (!MRAvatar::IsCanonicalSpecies(A.SpeciesId)) { Note(FString::Printf(TEXT("species '%s' is not canonical; reset to '%s'"), *A.SpeciesId.ToString(), *DefaultSpeciesId.ToString())); A.SpeciesId = DefaultSpeciesId; }
	if (!FindBody(A.BodyBaseId)) { Note(FString::Printf(TEXT("body '%s' no longer exists; reset to '%s'"), *A.BodyBaseId.ToString(), *DefaultBodyId.ToString())); A.BodyBaseId = DefaultBodyId; }

	auto FixOptional = [&](FName& Id, const TArray<FMRAvatarOption>& List, const TCHAR* Label)
	{
		if (!Id.IsNone() && !FindIn(List, Id)) { Note(FString::Printf(TEXT("%s '%s' no longer exists; cleared"), Label, *Id.ToString())); Id = NAME_None; }
	};
	FixOptional(A.HairId, Hair, TEXT("hair"));
	FixOptional(A.EyesId, Eyes, TEXT("eyes"));
	FixOptional(A.OutfitId, Outfits, TEXT("outfit"));
	FixOptional(A.SignalAccentId, SignalAccents, TEXT("signal accent"));

	TArray<FName> Kept;
	TSet<FName> UsedPoints;
	for (const FName& Id : A.AccessoryIds)
	{
		const FMRAvatarOption* O = FindAccessory(Id);
		if (!O) { Note(FString::Printf(TEXT("accessory '%s' no longer exists; removed"), *Id.ToString())); continue; }
		if (Kept.Contains(Id)) { Note(FString::Printf(TEXT("duplicate accessory '%s' removed"), *Id.ToString())); continue; }
		if (O->IsAvailable() && UsedPoints.Contains(O->AttachmentPointId)) { Note(FString::Printf(TEXT("accessory '%s' conflicts on attachment point; removed"), *Id.ToString())); continue; }
		if (O->IsAvailable()) UsedPoints.Add(O->AttachmentPointId);
		Kept.Add(Id);
	}
	A.AccessoryIds = Kept;

	if (!A.MaterialVariantId.IsNone())
	{
		const FMRAvatarOption* V = FindMaterialVariant(A.MaterialVariantId);
		const bool bUnknown = !V;
		const bool bUnsupported = V && V->IsAvailable() && V->MaterialBindings.Num() > 0 && !V->MaterialBindings.ContainsByPredicate([&](const FMRMaterialBinding& B) { return B.BodyId == A.BodyBaseId; });
		if (bUnknown || bUnsupported) { Note(FString::Printf(TEXT("material variant '%s' %s; reset to '%s'"), *A.MaterialVariantId.ToString(), bUnknown ? TEXT("no longer exists") : TEXT("unsupported on this body"), *DefaultMaterialVariantId.ToString())); A.MaterialVariantId = DefaultMaterialVariantId; }
	}
	if (A.SchemaVersion != MRAvatar::CurrentSchemaVersion && A.SchemaVersion <= MRAvatar::CurrentSchemaVersion) { A.SchemaVersion = MRAvatar::CurrentSchemaVersion; }
	return bChanged;
}
